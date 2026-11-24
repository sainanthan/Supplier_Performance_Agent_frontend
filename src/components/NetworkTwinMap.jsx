import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import Map, { useControl } from "react-map-gl/maplibre";
import { MapboxOverlay } from "@deck.gl/mapbox";
import { AmbientLight, DirectionalLight, LightingEffect, WebMercatorViewport } from "@deck.gl/core";
import { SimpleMeshLayer } from "@deck.gl/mesh-layers";
import { PathLayer, ScatterplotLayer, TextLayer } from "@deck.gl/layers";
import { PathStyleExtension } from "@deck.gl/extensions";
import "maplibre-gl/dist/maplibre-gl.css";
import { setWorkerUrl } from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";

setWorkerUrl(workerUrl);   // explicit worker location (works in dev and in the production build)
import { token } from "../util";
import { factoryMesh, portMesh, shipMesh, truckMesh, warehouseMesh } from "./mapMeshes";

// soft studio lighting so the 3D models read clearly on the flat basemap
const LIGHTS = new LightingEffect({
  ambient: new AmbientLight({ color: [235, 240, 255], intensity: 0.85 }),
  sun: new DirectionalLight({ color: [255, 246, 228], intensity: 2.1, direction: [-1.4, -1.8, -2.6] }),
  fill: new DirectionalLight({ color: [190, 210, 255], intensity: 0.55, direction: [1.5, 1.2, -1.2] }),
});
const MODELS = { ship: shipMesh(), truck: truckMesh(), factory: factoryMesh(), warehouse: warehouseMesh(), port: portMesh() };

/* Network twin map (T2): MapLibre GL basemap + deck.gl GPU layers.
   - Lanes follow real routes (OSRM roads, searoute sea lanes) supplied and cached by the backend.
   - Every moving mark maps to real PO lines: consolidated vehicles for ESTIMATED shipments, individual marks for
     shipments with their own LIVE (GPS) or MILESTONE data. The source is shown on the icon and in the tooltip.
   - Dense traffic clusters on screen at low zoom (count = PO lines); click a cluster to zoom in.
   Same props / camera API as the classic Map3D so NetworkTracker can switch between them. */

/* Basemaps. With a MapTiler key (frontend/.env.local or the host's env settings: VITE_MAPTILER_KEY=...) the map uses MapTiler's
   detailed streets, hybrid satellite (imagery + labels), outdoor terrain style and terrain-RGB elevation. Without a key it falls back
   to free OpenFreeMap / Esri tiles and public AWS elevation tiles. Only tile coordinates are requested; no supplier or shipment data
   is sent. A value that is not a MapTiler key (e.g. a URL pasted into the setting by mistake) is ignored, so the map never goes blank. */
const MT_RAW = (import.meta.env.VITE_MAPTILER_KEY || "").trim();
const MT = /^[A-Za-z0-9]{16,64}$/.test(MT_RAW) ? MT_RAW : "";
const mt = name => `https://api.maptiler.com/maps/${name}/style.json?key=${MT}`;
export const MAP_PROVIDER = MT ? "MapTiler" : "OpenFreeMap";
const DEM = MT
  ? { type: "raster-dem", url: `https://api.maptiler.com/tiles/terrain-rgb-v2/tiles.json?key=${MT}`, tileSize: 256 }
  : { type: "raster-dem", tiles: ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"], encoding: "terrarium", tileSize: 256,
      maxzoom: 14, attribution: "Elevation: Mapzen terrain tiles (AWS Open Data)" };
const STYLE = {
  light: MT ? mt("streets-v2") : "https://tiles.openfreemap.org/styles/liberty",
  dark: MT ? mt("streets-v2-dark") : "https://tiles.openfreemap.org/styles/dark",
  hybrid: MT ? mt("hybrid") : null,
  satellite: {
    version: 8,
    sources: { sat: { type: "raster", tileSize: 256, attribution: "Imagery © Esri, Maxar, Earthstar Geographics",
      tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"] } },
    layers: [{ id: "sat", type: "raster", source: "sat", paint: { "raster-saturation": -0.55, "raster-brightness-max": 0.82, "raster-contrast": -0.08 } }],
  },
};
const VIEWS = { asia: [[62, -8], [148, 44]], india: [[71.5, 7], [86.5, 20.5]], malacca: [[91, -3], [110, 11]] };
const CLUSTER_ZOOM = 6;

const rgb = (v, a = 255) => {
  const s = (v || "").trim();
  if (s.startsWith("#")) { const h = s.length === 4 ? s.slice(1).split("").map(c => c + c).join("") : s.slice(1, 7); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), a]; }
  const m = s.match(/[\d.]+/g); return m ? [+m[0], +m[1], +m[2], a] : [128, 128, 128, a];
};
const hav = (a, b) => { const R = 6371, dLa = (b[1] - a[1]) * Math.PI / 180, dLo = (b[0] - a[0]) * Math.PI / 180, la = a[1] * Math.PI / 180, lb = b[1] * Math.PI / 180;
  return 2 * R * Math.asin(Math.sqrt(Math.sin(dLa / 2) ** 2 + Math.cos(la) * Math.cos(lb) * Math.sin(dLo / 2) ** 2)); };

function laneGeom(l) {
  const pts = l.path.map(([la, lo]) => [lo, la]);
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + hav(pts[i - 1], pts[i]));
  return { pts, cum, total: cum[cum.length - 1] || 1, seaA: l.mode === "SEA" ? l.sea_start : -1, seaB: l.mode === "SEA" ? l.sea_end : -1 };
}
// one distinct colour per supplier route (metro-map style); status is carried by the route outline and the vehicles
const ROUTE_PALETTE = ["#6f3dba", "#1e88e5", "#00a39b", "#f2a516", "#e4572e", "#8e24aa", "#43a047", "#d81b60", "#3949ab", "#00acc1", "#6d4c41", "#7cb342"];
const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
function subPath(g, f0, f1) {                     // polyline between two fractions of the lane length
  const a = Math.max(0, f0) * g.total, b = Math.min(1, f1) * g.total, out = [sample(g, f0).pos];
  for (let i = 1; i < g.cum.length - 1; i++) if (g.cum[i] > a && g.cum[i] < b) out.push(g.pts[i]);
  out.push(sample(g, f1).pos); return out;
}
// lane split into its road and sea legs (indices from the backend: sea_start / sea_end)
function legsOf(l, g) {
  if (g.seaA < 0 || g.seaB <= g.seaA) return [{ lane: l, mode: "ROAD", pts: g.pts }];
  return [{ lane: l, mode: "ROAD", pts: g.pts.slice(0, g.seaA + 1) }, { lane: l, mode: "SEA", pts: g.pts.slice(g.seaA, g.seaB + 1) },
    { lane: l, mode: "ROAD", pts: g.pts.slice(g.seaB) }].filter(x => x.pts.length > 1);
}
function sample(g, f) {
  const t = Math.max(0, Math.min(1, f)) * g.total;
  let i = 1; while (i < g.cum.length - 1 && g.cum[i] < t) i++;
  const a = g.pts[i - 1], b = g.pts[i], k = (t - g.cum[i - 1]) / ((g.cum[i] - g.cum[i - 1]) || 1);
  return { pos: [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k], sea: i - 1 >= g.seaA && i - 1 < g.seaB };
}
const trackFrac = (tr, day) => { // piecewise-linear interpolation of [[t, fraction], ...]
  if (day <= tr[0][0]) return tr[0][1];
  for (let i = 1; i < tr.length; i++) if (day <= tr[i][0]) { const [t0, f0] = tr[i - 1], [t1, f1] = tr[i]; return f0 + (f1 - f0) * ((day - t0) / ((t1 - t0) || 1)); }
  return tr[tr.length - 1][1];
};

// Label placement with collision handling (screen space, priority order). Each label tries above / below / right / left
// of its mark; it is dropped only when every slot overlaps an already placed, higher-priority label or mark.
const LABEL_SLOTS = [[0, -1, "middle", "bottom"], [0, 1, "middle", "top"], [1, 0, "start", "center"], [-1, 0, "end", "center"]];
function placeLabels(items, vp, marks) {
  const placed = [], boxes = marks.map(([x, y]) => [x - 22, y - 16, x + 22, y + 16]);    // keep clear of the 3D sites
  const hit = b => boxes.some(o => b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1]);
  for (const it of [...items].sort((a, b) => b.priority - a.priority)) {
    const [x, y] = vp.project(it.position);
    if (x < -50 || y < -50 || x > vp.width + 50 || y > vp.height + 50) continue;
    const w = it.text.length * it.size * 0.62 + 12, h = it.size + 6, gap = it.gap;
    for (const [dx, dy, anchor, base] of LABEL_SLOTS) {
      const cx = x + dx * (gap + (dx ? w / 2 : 0)), cy = y + dy * (gap + (dy ? h / 2 : 0));
      const b = [cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2];
      if (!hit(b)) { boxes.push(b); placed.push({ ...it, offset: [dx * gap, dy * gap], anchor, base }); break; }
    }
  }
  return placed;
}

function DeckOverlay(props) {
  const overlay = useControl(() => new MapboxOverlay({ interleaved: false, ...props }));
  overlay.setProps(props);
  return null;
}

// T3 status vs promise date: delayed = past the promise date and not received; at risk = ETA later than (promise - buffer);
// on time otherwise. buffer = approved config lane_at_risk_buffer_days.
const RANK = { ok: 0, risk: 1, late: 2, dis: 2 };
export const status3 = (day, eta, prom, buf) => (day > prom ? "late" : eta > prom - buf ? "risk" : "ok");

const NetworkTwinMap = forwardRef(function NetworkTwinMap({ data, theme, simDayRef, selected, onSelect, view = "asia", follow, affected, layers,
  spotlight, onStats, renderTip, health, hidden, hiddenSup, alerting, riskEnc = false, disruptions = null, filterFn = null, laneVisible = null }, ref) {
  const mapRef = useRef(), wrap = useRef();
  const [base, setBase] = useState("street");
  const [vs, setVs] = useState({ longitude: 98, latitude: 16, zoom: 2.6, pitch: 52, bearing: -8 });
  const [tick, setTick] = useState(0);
  const [tip, setTip] = useState(null);
  const night = theme === "dark";
  const C = useMemo(() => ({
    sea: rgb(token("--chart-c1")), road: rgb(token("--chart-c2")), ok: rgb(token("--chart-c4")), late: rgb(token("--depth-0")), dis: rgb(token("--brand-orange")),
    sel: rgb(token("--brand-purple")), sup: rgb(token("--depth-1")), plant: rgb(token("--depth-3")), port: rgb(token("--text-secondary")),
    ink: rgb(token("--brand-white")), text: rgb(token("--text-primary")), halo: rgb(token("--dr-surface"), 230), watch: rgb(token("--brand-orange")),
    fills: { ok: token("--chart-c4"), late: token("--depth-0"), dis: token("--brand-orange"), risk: token("--brand-orange") }, inkHex: token("--brand-white"),
    risk: rgb(token("--brand-orange")), idle: rgb(token("--text-muted") || token("--text-secondary")),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [theme]);
  const geoms = useMemo(() => Object.fromEntries(data.lanes.map(l => [l.id, laneGeom(l)])), [data]);
  const nodes = useMemo(() => Object.fromEntries(data.nodes.map(n => [n.id, n])), [data]);
  const tracked = useMemo(() => data.shipments.filter(s => s.track), [data]);
  const aff = useMemo(() => new Set(affected || []), [affected]);

  // animation: re-render at ~30 fps while the clock moves (or for the alert pulse)
  useEffect(() => { let raf, last = 0; const loop = t => { if (t - last > 33) { last = t; setTick(x => x + 1); } raf = requestAnimationFrame(loop); }; raf = requestAnimationFrame(loop); return () => cancelAnimationFrame(raf); }, []);

  const fit = b => mapRef.current?.fitBounds(b, { padding: 40, duration: 900 });
  // Relief for the Terrain and Satellite basemaps: hillshaded elevation and sky. (3D terrain mode is not used: the deck.gl overlay
  // cannot follow MapLibre 6 terrain, and flat relief keeps every vehicle and site exactly on its coordinates.)
  const applyRelief = () => {
    const m = mapRef.current?.getMap?.(); if (!m || !m.isStyleLoaded()) return;
    const want = base === "satellite";
    try {
      m.setSky?.({ "sky-color": night ? "#0b1020" : "#9cc3ee", "horizon-color": night ? "#1d2440" : "#e9f1fb", "fog-color": night ? "#0b1020" : "#eef3f9",
        "sky-horizon-blend": 0.5, "horizon-fog-blend": 0.3, "fog-ground-blend": 0, "atmosphere-blend": 0.35 });
      if (want) {
        if (!m.getSource("dem-shade")) m.addSource("dem-shade", DEM);
        if (!m.getLayer("hillshade")) {
          const firstSymbol = m.getStyle().layers.find(l => l.type === "symbol")?.id;
          m.addLayer({ id: "hillshade", type: "hillshade", source: "dem-shade",
            paint: { "hillshade-exaggeration": 0.3, "hillshade-shadow-color": night ? "#0b0f1a" : "#5a6478", "hillshade-highlight-color": "#ffffff" } }, firstSymbol);
        }
        m.setSky?.({ "sky-color": night ? "#0b1020" : "#a8c8ef", "horizon-color": night ? "#1d2440" : "#eef3fb", "fog-color": night ? "#0b1020" : "#f1f4f9",
          "sky-horizon-blend": 0.6, "horizon-fog-blend": 0.6, "fog-ground-blend": 0.25, "atmosphere-blend": 0.8 });
      }
    } catch { /* style not ready yet; style.load will retry */ }
  };
  useEffect(() => {
    const m = mapRef.current?.getMap?.(); if (!m) return;
    m.on("style.load", applyRelief); applyRelief();
    return () => m.off("style.load", applyRelief);
  }, [base, night]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (VIEWS[view]) fit(VIEWS[view]); }, [view]); // eslint-disable-line
  useImperativeHandle(ref, () => {
    const m = () => mapRef.current;
    return {
      zoom: f => m()?.zoomTo(m().getZoom() + (f < 1 ? 1 : -1), { duration: 400 }),
      rotate: d => m()?.rotateTo(m().getBearing() + d, { duration: 400 }),
      tilt: d => m()?.easeTo({ pitch: Math.max(0, Math.min(75, m().getPitch() + d * 1.5)), duration: 400 }),
      north: () => m()?.resetNorth({ duration: 400 }),
      top: () => m()?.easeTo({ pitch: 0, bearing: 0, duration: 600 }),
      perspective: () => m()?.easeTo({ pitch: 52, duration: 600 }),
      side: () => m()?.easeTo({ pitch: 70, duration: 600 }),
      fit: () => { const xs = data.nodes.map(n => n.lon), ys = data.nodes.map(n => n.lat); fit([[Math.min(...xs) - 2, Math.min(...ys) - 2], [Math.max(...xs) + 2, Math.max(...ys) + 2]]); },
      reset: () => { m()?.easeTo({ pitch: 52, bearing: -8, duration: 400 }); fit(VIEWS[view] || VIEWS.asia); },
      fullscreen: () => (document.fullscreenElement ? document.exitFullscreen() : wrap.current?.requestFullscreen?.()),
    };
  }, [data, view]); // eslint-disable-line

  // ---------------------------------------------------------------- vehicles at the current sim day
  const day = simDayRef.current;
  const vehicles = [];
  const stats = { ships: 0, trucks: 0, ok: 0, late: 0, dis: 0, risk: 0, aboard: 0, live: 0, milestone: 0, estimated: 0 };
  const buf = data.lane_buffer_days ?? 2;
  const laneStat = {};
  const push = (o, id, laneId, prog, cnt, st, src, demo, gpsPos = null, extra = {}) => {
    const g = geoms[laneId]; if (!g) return;
    const p = sample(g, prog), kind = p.sea ? "ship" : "truck";
    const q = sample(g, Math.min(1, prog + 0.004)), r0 = sample(g, Math.max(0, prog - 0.004));
    const hd = Math.atan2(q.pos[1] - r0.pos[1], (q.pos[0] - r0.pos[0]) * Math.cos(p.pos[1] * Math.PI / 180)) * 180 / Math.PI;
    if ((kind === "ship" && !layers.ships) || (kind === "truck" && !layers.trucks) || layers[st] === false) return;
    if (hiddenSup && hiddenSup(o)) return;
    if (filterFn && !filterFn(o)) return;
    stats[kind === "ship" ? "ships" : "trucks"]++; stats[st]++; stats.aboard += cnt; stats[src === "LIVE" ? "live" : src === "MILESTONE" ? "milestone" : "estimated"] += cnt;
    if ((RANK[st] ?? 0) >= (RANK[laneStat[laneId]] ?? -1)) laneStat[laneId] = st;
    vehicles.push({ id, kind, st, src, demo, cnt, hd, pos: gpsPos || p.pos, prog, lane: laneId, supplier_id: o.supplier_id, dim: spotlight && o.supplier_id !== spotlight, ...extra });
  };
  const list = data.movements || data.shipments.filter(s => !s.track);
  for (const s of list) {
    if (day < s.t_depart || day >= s.t_eta) continue;
    let cnt = 1, st;
    if (s.m) {
      cnt = 0; let worst = "ok", dis = false;
      for (const x of s.m) if (day >= x[0] && day < x[1]) {
        cnt++; if (x[3]) dis = true;
        const k = riskEnc ? status3(day, x[1], x[2], buf) : day > x[2] ? "late" : "ok";
        if (RANK[k] > RANK[worst]) worst = k;
      }
      if (!cnt) continue;
      st = !riskEnc && dis ? "dis" : worst;
    } else st = riskEnc ? status3(day, s.t_eta, s.t_promised, buf) : s.disrupted ? "dis" : day > s.t_promised ? "late" : "ok";
    push(s, s.id, s.lane, (day - s.t_depart) / Math.max(0.01, s.t_eta - s.t_depart), cnt, st, "ESTIMATED", false);
  }
  for (const s of tracked) {
    if (day < s.t_depart || day >= s.t_eta) continue;
    const st = riskEnc ? status3(day, s.t_eta, s.t_promised, buf) : s.disrupted ? "dis" : day > s.t_promised ? "late" : "ok";
    let gpsPos = null, extra = {};
    if (s.gps?.length) {                                    // true GPS position between pings; after the last ping: along the route
      const g = s.gps, last = g[g.length - 1];
      if (day >= g[0][0] && day <= last[0]) {
        let i = 1; while (i < g.length - 1 && g[i][0] < day) i++;
        const a = g[i - 1], b = g[i] || a, k = (day - a[0]) / ((b[0] - a[0]) || 1);
        gpsPos = [a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
      }
      extra = { lastPingAgoH: Math.max(0, (day - last[0]) * 24), stale: day - last[0] > 0.25, vehicle: s.vehicle };
    }
    push(s, s.id, s.lane, trackFrac(s.track, day), 1, st, s.pos_source, !!s.demo, gpsPos, extra);
  }
  const statsRef = useRef(0);
  useEffect(() => { const t = performance.now(); if (onStats && t - statsRef.current > 400) { statsRef.current = t; onStats({ ...stats, offmapVessels: 0, offmapShipments: 0, consolidated: true, laneStat: { ...laneStat } }); } });

  // screen-space grouping: vehicles closer than one model length merge into a counted badge, so models never pile up.
  // Greedy by distance (not a grid, which split neighbours across cells). Radius shrinks as you zoom in.
  let marks = vehicles, clusters = [];
  const atSite = {};
  // models grow when you zoom in (up to 2x), so close-ups show the detail; grouping radius grows with them
  const zf = Math.min(2, Math.max(1, 1 + (vs.zoom - 4.5) * 0.22));
  if (wrap.current && vehicles.length > 1) {
    const r = wrap.current.getBoundingClientRect();
    const vp = new WebMercatorViewport({ ...vs, width: r.width || 800, height: r.height || 600 });
    const R = (vs.zoom < 4 ? 66 : vs.zoom < CLUSTER_ZOOM ? 54 : 36) * zf;
    const sites = data.nodes.filter(n => n.kind !== "port").map(n => ({ id: n.id, xy: vp.project([n.lon, n.lat]) }));
    const groups = [];
    for (const v of vehicles) {
      if (v.id === selected) continue;
      const [x, y] = vp.project(v.pos);
      const site = sites.find(q => Math.hypot(q.xy[0] - x, q.xy[1] - y) < 30);
      if (site) { atSite[site.id] = (atSite[site.id] || 0) + 1; continue; }     // loading / unloading at the site
      const g = groups.find(q => Math.hypot(q.x - x, q.y - y) < R);
      if (g) { g.items.push(v); g.x = (g.x * (g.items.length - 1) + x) / g.items.length; g.y = (g.y * (g.items.length - 1) + y) / g.items.length; }
      else groups.push({ x, y, items: [v] });
    }
    marks = vehicles.filter(v => v.id === selected);
    for (const { items: c } of groups) {
      if (c.length === 1) { marks.push(c[0]); continue; }
      const st = c.some(v => v.st === "dis") ? "dis" : c.some(v => v.st === "late") ? "late" : c.some(v => v.st === "risk") ? "risk" : "ok";
      const ships = c.filter(v => v.kind === "ship").length;
      clusters.push({ pos: [c.reduce((a, v) => a + v.pos[0], 0) / c.length, c.reduce((a, v) => a + v.pos[1], 0) / c.length], n: c.length,
        cnt: c.reduce((a, v) => a + v.cnt, 0), st, ships, trucks: c.length - ships });
    }
  }

  // ---------------------------------------------------------------- labels (placed every frame on the current view)
  let labels = [];
  if (layers.labels && wrap.current) {
    const r0 = wrap.current.getBoundingClientRect();
    const vp = new WebMercatorViewport({ ...vs, width: r0.width || 800, height: r0.height || 600 });
    const ln = [...data.nodes.filter(n => n.kind !== "port" || layers.ports)];
    const items = ln.map(n => ({ id: n.id, position: [n.lon, n.lat], kind: n.kind, size: n.kind === "plant" ? 13 : 11, gap: n.kind === "plant" ? 30 : 22,
      text: (n.kind === "plant" ? n.name.split(" (")[0].replace(" Electronics", "") : n.kind === "port" ? n.name.replace(" port", "") : n.id)
        + (atSite[n.id] ? ` · ${atSite[n.id]} at dock` : ""),
      priority: n.kind === "plant" ? 100 : alerting?.has(n.id) ? 60 : health?.[n.id] === "RISK" ? 50 : n.kind === "supplier" ? 40 : 10 }));
    for (const e of disruptions?.events || []) items.push({ id: `dis-${e.id ?? e.lat}`, position: [e.lon, e.lat], size: 10.5, gap: 10, dis: e.severity,
      text: e.type, priority: e.severity === "CRITICAL" ? 45 : e.severity === "HIGH" ? 30 : 5 });
    labels = placeLabels(items, vp, ln.map(n => vp.project([n.lon, n.lat])));
  }

  // ---------------------------------------------------------------- T3 encodings
  const shownLanes = laneVisible ? data.lanes.filter(laneVisible) : data.lanes;
  const supFill = n => {
    const h = n.score?.health; if (!riskEnc || !h) return C.sup;
    return h === "AT_RISK" ? C.late : h === "WATCH" ? C.risk : C.ok;
  };
  const supRadius = n => (riskEnc && n.score ? 6 + Math.min(11, Math.sqrt(n.score.disruption_hours || 0) * 2.2) : 7);
  const laneColor = l => {
    if (aff.has(l.supplier_id)) return C.late;
    if (!riskEnc) return l.mode === "SEA" ? C.sea : C.road;
    const st = laneStat[l.id];
    return st === "late" ? C.late : st === "risk" ? C.risk : st === "ok" ? C.ok : C.idle;
  };
  const laneWidth = l => (aff.has(l.supplier_id) ? 3 : !riskEnc ? 2 : laneStat[l.id] === "late" ? 2.8 : laneStat[l.id] === "risk" ? 2.4 : laneStat[l.id] ? 2 : 1.4);
  const SEVC = { CRITICAL: C.late, HIGH: C.risk, MEDIUM: C.sea, LOW: C.idle };
  const events = disruptions?.events || [];

  // ---------------------------------------------------------------- deck.gl layers
  const sel = selected && (data.movements?.find(x => x.id === selected) || data.shipments.find(x => x.id === selected));
  const supNodes = data.nodes.filter(n => n.kind === "supplier"), plantNodes = data.nodes.filter(n => n.kind === "plant"), portNodes = data.nodes.filter(n => n.kind === "port");
  const hcol = n => ({ HEALTHY: C.ok, WATCH: C.watch, RISK: C.late }[health?.[n.id]] || C.sup);
  const pulse = (performance.now() % 1600) / 1600;
  // constant on-screen size for the 3D models: metres per pixel at the current zoom
  const mpp = 40075016.686 * Math.cos(vs.latitude * Math.PI / 180) / (512 * 2 ** vs.zoom);
  const px = (len, want) => (mpp * want * zf) / len;
  const stc = st => (st === "dis" ? C.dis : st === "late" ? C.late : st === "risk" ? C.risk : C.ok);
  const now = performance.now() / 1000;
  const supIds = [...new Set(data.lanes.map(l => l.supplier_id))].sort();
  const routeRGB = l => hex(ROUTE_PALETTE[supIds.indexOf(l.supplier_id) % ROUTE_PALETTE.length]);
  const dimL = l => spotlight && l.supplier_id !== spotlight;
  const casing = l => (aff.has(l.supplier_id) ? C.late : riskEnc && laneStat[l.id] ? stc(laneStat[l.id]) : [255, 255, 255]);
  const legs = layers.lanes ? shownLanes.flatMap(l => (geoms[l.id] ? legsOf(l, geoms[l.id]) : [])) : [];
  // a glowing pulse runs along every route from supplier to plant (direction of flow); two pulses per route
  const comets = layers.lanes ? shownLanes.flatMap(l => { const g = geoms[l.id]; if (!g) return [];
    const sp = 0.045 * Math.min(2.5, 9000 / Math.max(800, g.total));          // similar on-screen pace on long and short routes
    return [0, 0.5].map(k => { const f = (now * sp + k + (supIds.indexOf(l.supplier_id) * 0.137)) % 1; return { l, f, path: subPath(g, f - 0.05, f) }; }); }) : [];
  const ships = marks.filter(v => v.kind === "ship"), trucks = marks.filter(v => v.kind === "truck");
  const vehicleLayers = (kind, list, len, want) => [
    new SimpleMeshLayer({ id: `shadow-${kind}`, data: list, mesh: MODELS[kind].shadow, getPosition: v => v.pos, getOrientation: v => [0, v.hd || 0, 0],
      getScale: v => (v.id === selected ? [1.45, 1.45, 1.45] : [1, 1, 1]), getColor: v => [255, 255, 255, v.dim ? 18 : 60], sizeScale: px(len, want),
      material: false, parameters: { depthWriteEnabled: false }, updateTriggers: { getPosition: tick, getOrientation: tick, getScale: selected, getColor: tick } }),
    new SimpleMeshLayer({ id: `veh-${kind}-body`, data: list, mesh: MODELS[kind].body, getPosition: v => v.pos, getOrientation: v => [0, v.hd || 0, 0],
      getScale: v => (v.id === selected ? [1.45, 1.45, 1.45] : [1, 1, 1]), getColor: v => [255, 255, 255, v.dim ? 70 : 255], sizeScale: px(len, want),
      pickable: true, material: { ambient: 0.42, diffuse: 0.78, shininess: 48, specularColor: [110, 110, 110] },
      updateTriggers: { getPosition: tick, getOrientation: tick, getScale: selected, getColor: tick } }),
    new SimpleMeshLayer({ id: `veh-${kind}-accent`, data: list, mesh: MODELS[kind].accent, getPosition: v => v.pos, getOrientation: v => [0, v.hd || 0, 0],
      getScale: v => (v.id === selected ? [1.45, 1.45, 1.45] : [1, 1, 1]), getColor: v => [...stc(v.st).slice(0, 3), v.dim ? 70 : 255], sizeScale: px(len, want),
      pickable: true, material: { ambient: 0.95, diffuse: 0.3, shininess: 8, specularColor: [20, 20, 20] },
      updateTriggers: { getPosition: tick, getOrientation: tick, getScale: selected, getColor: tick } }),
  ];
  // ports face the water (sea_bearing from the backend): cranes reach over the sea, the yard sits on land behind the berth
  const orient = n => (n.sea_bearing != null ? [0, 90 - n.sea_bearing, 0] : [0, -20, 0]);
  const placeAt = (n, s) => {
    if (n.sea_bearing == null) return [n.lon, n.lat];
    const m = 10 * s, b = (n.sea_bearing * Math.PI) / 180;              // quay edge (model x = +10) on the berth point
    return [n.lon - (Math.sin(b) * m) / (111320 * Math.cos((n.lat * Math.PI) / 180)), n.lat - (Math.cos(b) * m) / 111320];
  };
  const landmark = (id, list, model, color, want) => { const s = px(30, want); return [
    new SimpleMeshLayer({ id: `${id}-shadow`, data: list, mesh: MODELS[model].shadow, getPosition: n => placeAt(n, s), getOrientation: orient,
      getColor: [255, 255, 255, 55], sizeScale: s, material: false, parameters: { depthWriteEnabled: false }, updateTriggers: { getPosition: s } }),
    new SimpleMeshLayer({ id: `${id}-body`, data: list, mesh: MODELS[model].body, getPosition: n => placeAt(n, s), getOrientation: orient,
      getColor: [255, 255, 255, 255], sizeScale: s, material: { ambient: 0.42, diffuse: 0.78, shininess: 30, specularColor: [60, 60, 60] }, updateTriggers: { getPosition: s } }),
    new SimpleMeshLayer({ id: `${id}-accent`, data: list, mesh: MODELS[model].accent, getPosition: n => placeAt(n, s), getOrientation: orient,
      getColor: color, sizeScale: s, material: { ambient: 0.95, diffuse: 0.3 }, updateTriggers: { getColor: [health, theme, riskEnc], getPosition: s } }),
  ]; };
  const L = [
    events.length > 0 && new ScatterplotLayer({ id: "disruptions", data: events, getPosition: e => [e.lon, e.lat], radiusUnits: "meters",
      getRadius: e => e.radius_km * 1000, radiusMinPixels: 8, getFillColor: e => [...(SEVC[e.severity] || C.idle).slice(0, 3), 26], stroked: true,
      getLineColor: e => [...(SEVC[e.severity] || C.idle).slice(0, 3), 150], lineWidthUnits: "pixels", getLineWidth: 1.2, pickable: true,
      updateTriggers: { getFillColor: theme, getLineColor: theme } }),
    // metro-style routes: outline = status (white when nothing is wrong), core = the supplier's own colour,
    // road legs solid, sea legs dotted (nautical), animated pulse = direction of flow
    layers.lanes && new PathLayer({ id: "lanes-casing", data: shownLanes, getPath: l => geoms[l.id].pts, widthUnits: "pixels",
      getWidth: l => (aff.has(l.supplier_id) || laneStat[l.id] === "late" ? 7 : 6.2), getColor: l => [...casing(l).slice(0, 3), dimL(l) ? 30 : 200],
      jointRounded: true, capRounded: true, updateTriggers: { getColor: [spotlight, affected, theme, tick, riskEnc], getWidth: [affected, tick] } }),
    layers.lanes && new PathLayer({ id: "lanes", data: legs.filter(x => x.mode === "ROAD"), getPath: x => x.pts, widthUnits: "pixels", getWidth: 4.2,
      getColor: x => [...routeRGB(x.lane), dimL(x.lane) ? 50 : 255], jointRounded: true, capRounded: true, pickable: true,
      updateTriggers: { getColor: [spotlight, tick] } }),
    layers.lanes && new PathLayer({ id: "lanes-sea", data: legs.filter(x => x.mode === "SEA"), getPath: x => x.pts, widthUnits: "pixels", getWidth: 4.2,
      getColor: x => [...routeRGB(x.lane), dimL(x.lane) ? 50 : 255], jointRounded: true, capRounded: true, dashJustified: true,
      getDashArray: [2.2, 1.6], extensions: [new PathStyleExtension({ dash: true })], pickable: true,
      updateTriggers: { getColor: [spotlight, tick] } }),
    comets.length > 0 && new PathLayer({ id: "lane-comet", data: comets, getPath: c => c.path, widthUnits: "pixels", getWidth: 5.5,
      getColor: c => { const k = routeRGB(c.l); return [Math.min(255, k[0] + 90), Math.min(255, k[1] + 90), Math.min(255, k[2] + 90), dimL(c.l) ? 30 : 235]; },
      jointRounded: true, capRounded: true, updateTriggers: { getPath: tick, getColor: [tick, spotlight] } }),
    comets.length > 0 && new ScatterplotLayer({ id: "lane-comet-head", data: comets, getPosition: c => c.path[c.path.length - 1], radiusUnits: "pixels", getRadius: 4,
      getFillColor: c => [255, 255, 255, dimL(c.l) ? 40 : 255], stroked: true, getLineColor: c => [...routeRGB(c.l), 255], lineWidthUnits: "pixels", getLineWidth: 2,
      updateTriggers: { getPosition: tick, getFillColor: [tick, spotlight] } }),
    sel && geoms[sel.lane] && new PathLayer({ id: "sel-lane", data: [sel], getPath: s => geoms[s.lane].pts, getColor: [...C.sel.slice(0, 3), 220], widthUnits: "pixels", getWidth: 6, jointRounded: true }),
    layers.ports && new ScatterplotLayer({ id: "ports", data: portNodes, getPosition: n => [n.lon, n.lat], getRadius: 16, radiusUnits: "pixels",
      getFillColor: [...C.port.slice(0, 3), 2], pickable: true }),
    layers.ports && new ScatterplotLayer({ id: "port-pins", data: portNodes, getPosition: n => [n.lon, n.lat], getRadius: 3.5, radiusUnits: "pixels",
      getFillColor: [255, 255, 255, 255], stroked: true, getLineColor: [31, 47, 89, 255], lineWidthUnits: "pixels", getLineWidth: 2, parameters: { depthCompare: "always" } }),
    new ScatterplotLayer({ id: "alert-pulse", data: supNodes.filter(n => alerting?.has(n.id)), getPosition: n => [n.lon, n.lat], radiusUnits: "pixels",
      getRadius: 10 + pulse * 16, filled: false, stroked: true, lineWidthUnits: "pixels", getLineWidth: 2.5, getLineColor: [...C.late.slice(0, 3), Math.round(220 * (1 - pulse))],
      updateTriggers: { getRadius: tick, getLineColor: tick } }),
    new ScatterplotLayer({ id: "suppliers", data: filterFn ? supNodes.filter(n => !laneVisible || shownLanes.some(l => l.supplier_id === n.id)) : supNodes,
      getPosition: n => [n.lon, n.lat], getRadius: n => Math.max(18, supRadius(n) + 8), radiusUnits: "pixels", getFillColor: n => [...supFill(n).slice(0, 3), 2], stroked: false,
      getLineColor: n => (riskEnc ? C.ink : hcol(n)), lineWidthUnits: "pixels", getLineWidth: 0, pickable: true, opacity: 1,
      updateTriggers: { getLineColor: [health, theme, riskEnc], getFillColor: [theme, riskEnc], getRadius: riskEnc } }),
    ...landmark("m-sup", filterFn ? supNodes.filter(n => !laneVisible || shownLanes.some(l => l.supplier_id === n.id)) : supNodes, "warehouse",
      n => (riskEnc ? supFill(n) : hcol(n)), 48),
    ...(layers.ports ? landmark("m-port", portNodes, "port", C.port, 40) : []),
    new ScatterplotLayer({ id: "plants", data: plantNodes, getPosition: n => [n.lon, n.lat], getRadius: 24, radiusUnits: "pixels", getFillColor: [...C.plant.slice(0, 3), 2],
      stroked: false, pickable: true }),
    ...landmark("m-plant", plantNodes, "factory", C.plant, 60),
    ...vehicleLayers("ship", ships, MODELS.ship.length, 66),
    ...vehicleLayers("truck", trucks, MODELS.truck.length, 44),
    new TextLayer({ id: "vehicle-count", data: marks.filter(v => v.cnt > 1), getPosition: v => v.pos, getText: v => String(v.cnt), getSize: 11, sizeUnits: "pixels",
      getPixelOffset: [12, -12], getColor: C.ink, background: true, getBackgroundColor: C.sel, backgroundPadding: [4, 1], fontFamily: "Inter, system-ui, sans-serif",
      fontWeight: 800, parameters: { depthCompare: "always" }, updateTriggers: { getPosition: tick } }),
    new ScatterplotLayer({ id: "clusters-halo", data: clusters, getPosition: c => c.pos, radiusUnits: "pixels", getRadius: c => 19 + Math.min(10, Math.sqrt(c.n) * 2.4),
      getFillColor: c => [...stc(c.st).slice(0, 3), 55], updateTriggers: { getPosition: tick, getRadius: tick, getFillColor: tick } }),
    new ScatterplotLayer({ id: "clusters", data: clusters, getPosition: c => c.pos, radiusUnits: "pixels", getRadius: c => 13 + Math.min(8, Math.sqrt(c.n) * 1.6),
      getFillColor: [255, 255, 255, 245], stroked: true, getLineColor: c => stc(c.st), lineWidthUnits: "pixels", getLineWidth: 3,
      pickable: true, updateTriggers: { getPosition: tick, getRadius: tick, getLineColor: tick } }),
    new TextLayer({ id: "cluster-count", data: clusters, getPosition: c => c.pos, getText: c => String(c.n), getSize: 12.5, sizeUnits: "pixels", getColor: [31, 47, 89, 255],
      fontFamily: "Inter, system-ui, sans-serif", fontWeight: 800, parameters: { depthCompare: "always" }, updateTriggers: { getPosition: tick, getText: tick } }),
    new TextLayer({ id: "cluster-kind", data: clusters, getPosition: c => c.pos, getText: c => (c.ships && c.trucks ? `${c.ships} ship · ${c.trucks} truck` : c.ships ? `${c.ships} ships` : `${c.trucks} trucks`),
      getSize: 9.5, sizeUnits: "pixels", getPixelOffset: c => [0, 20 + Math.min(8, Math.sqrt(c.n) * 1.6)], getColor: [31, 47, 89, 255], background: true,
      getBackgroundColor: [255, 255, 255, 225], backgroundPadding: [4, 1], fontFamily: "Inter, system-ui, sans-serif", fontWeight: 700, parameters: { depthCompare: "always" },
      updateTriggers: { getPosition: tick, getText: tick, getPixelOffset: tick } }),
    labels.length > 0 && new TextLayer({ id: "labels", data: labels, getPosition: l => l.position, getText: l => l.text, getSize: l => l.size, sizeUnits: "pixels",
      getPixelOffset: l => l.offset, getTextAnchor: l => l.anchor, getAlignmentBaseline: l => l.base,
      getColor: l => (l.dis ? (SEVC[l.dis] || C.text) : C.text),
      background: true, getBackgroundColor: C.halo, backgroundPadding: [5, 2], fontFamily: "Inter, system-ui, sans-serif", fontWeight: 700, parameters: { depthCompare: "always" },
      updateTriggers: { getPixelOffset: tick, getTextAnchor: tick, getAlignmentBaseline: tick, getColor: theme } }),
  ].filter(Boolean);

  // follow the selected vehicle
  const selPos = vehicles.find(v => v.id === selected)?.pos;
  const followT = useRef(0);
  const loaded = useRef(false), followId = useRef(null);
  useEffect(() => {
    if (!follow) { followId.current = null; return; }
    if (!selPos || !loaded.current) return;
    if (followId.current !== selected) {                     // first time on this vehicle: fly in close
      followId.current = selected; followT.current = performance.now() + 1200;
      mapRef.current?.easeTo({ center: selPos, zoom: Math.max(mapRef.current.getZoom(), 8), pitch: 48, duration: 1600 });
      return;
    }
    if (performance.now() - followT.current > 600) { followT.current = performance.now(); mapRef.current?.easeTo({ center: selPos, duration: 550 }); }
  });

  const onHover = info => {
    const o = info.object, lid = info.layer?.id;
    if (!o) { setTip(null); return; }
    if (lid?.startsWith("veh-")) setTip({ id: o.id, kind: o.kind, prog: o.prog, count: o.cnt, gps: o.vehicle ? { ago: o.lastPingAgoH, stale: o.stale, vehicle: o.vehicle } : null, st: o.st, x: info.x, y: info.y });
    else if (["suppliers", "plants", "ports"].includes(lid)) setTip({ node: o, x: info.x, y: info.y });
    else if (lid === "disruptions") setTip({ disruption: o, x: info.x, y: info.y });
    else if (lid === "lanes" || lid === "lanes-sea") setTip({ lane: o.lane || o, laneStatus: laneStat[(o.lane || o).id] || null, x: info.x, y: info.y });
    else setTip(null);
  };
  const onClick = info => {
    const o = info.object; if (!o) return;
    const id = info.layer?.id;
    if (id?.startsWith("veh-")) onSelect?.({ type: "shipment", id: o.id });
    else if (id === "lanes" || id === "lanes-sea") onSelect?.({ type: "lane", id: (o.lane || o).id });
    else if (id === "clusters") mapRef.current?.easeTo({ center: o.pos, zoom: Math.max(vs.zoom + 2, CLUSTER_ZOOM + 0.2), duration: 600 });
    else if (["suppliers", "plants", "ports"].includes(id)) onSelect?.({ type: "node", id: o.id });
  };
  const r = wrap.current?.getBoundingClientRect();
  return (
    <div ref={wrap} className="twin-map" style={{ position: "absolute", inset: 0 }}>
      <Map ref={mapRef} {...vs} onMove={e => setVs(e.viewState)} mapStyle={base === "satellite" ? (STYLE.hybrid || STYLE.satellite) : night ? STYLE.dark : STYLE.light}
        maxPitch={75} style={{ position: "absolute", inset: 0 }} attributionControl={{ compact: true }} dragRotate touchPitch
        onLoad={() => { fit(VIEWS[view] || VIEWS.asia); applyRelief(); setTimeout(() => { loaded.current = true; }, 950); if (import.meta.env.DEV) window.__twinMap = mapRef.current?.getMap?.(); }}>
        <DeckOverlay layers={L} effects={[LIGHTS]} onHover={onHover} onClick={onClick} getCursor={({ isHovering }) => (isHovering ? "pointer" : "grab")} />
      </Map>
      <div className="twin-base" role="group" aria-label="Basemap">
        {[["street", "Map"], ["satellite", "Satellite"]].map(([k, l]) => <button key={k} className={base === k ? "on" : ""} aria-pressed={base === k} onClick={() => setBase(k)}>{l}</button>)}
      </div>
      {tip && r && renderTip && (
        <div className="node-tip map3d-tip" style={{ left: Math.min(tip.x + 16, r.width - 290), top: Math.min(tip.y + 14, r.height - 160) }}>{renderTip(tip)}</div>
      )}
    </div>
  );
});
export default NetworkTwinMap;
