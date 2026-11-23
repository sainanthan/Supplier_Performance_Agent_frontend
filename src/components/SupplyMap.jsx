import { useEffect, useMemo, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { token } from "../util";

/* Live supplier -> plant map (digital shadow of every PO line).
   Imperative Leaflet with a canvas renderer: shipments are re-positioned every animation frame from the shared
   simulation clock (simDayRef), so hundreds of moving markers stay smooth without React re-renders. */

// Esri canvas basemaps: free, no API key, with matching light/dark styles and a separate place-name layer.
const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas";
const TILES = {
  light: [`${ESRI}/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}`, `${ESRI}/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}`],
  dark: [`${ESRI}/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}`, `${ESRI}/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}`],
};
const LABEL_ZOOM = 5;   // supplier labels appear from this zoom (hover shows them earlier)
export const VIEWS = {
  asia: [[-6, 68], [40, 146]],
  india: [[8.2, 72.5], [20, 82.5]],
};

function laneGeometry(lane) {
  const pts = lane.path;
  const cum = [0];
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i][0] - pts[i - 1][0], dy = pts[i][1] - pts[i - 1][1];
    cum.push(cum[i - 1] + Math.hypot(dx, dy));
  }
  return { pts, cum, total: cum[cum.length - 1] || 1 };
}

function pointAt(g, p) {
  const target = Math.max(0, Math.min(1, p)) * g.total;
  let i = 1;
  while (i < g.cum.length - 1 && g.cum[i] < target) i++;
  const seg = g.cum[i] - g.cum[i - 1] || 1;
  const k = (target - g.cum[i - 1]) / seg;
  return [g.pts[i - 1][0] + (g.pts[i][0] - g.pts[i - 1][0]) * k, g.pts[i - 1][1] + (g.pts[i][1] - g.pts[i - 1][1]) * k];
}

export default function SupplyMap({ data, theme, simDayRef, selected, onSelect, view = "asia", filters, affected }) {
  const el = useRef(), map = useRef(), tiles = useRef(), layers = useRef({}), markers = useRef(new Map());
  const sel = useRef(selected); sel.current = selected;
  const flt = useRef(filters); flt.current = filters;
  const C = useMemo(() => ({
    sup: token("--depth-1"), plant: token("--depth-3"), port: token("--text-muted"), sea: token("--chart-c1"),
    road: token("--chart-c2"), ok: token("--chart-c4"), late: token("--depth-0"), dis: token("--brand-orange"),
    ink: token("--text-primary"), sel: token("--brand-purple"), ring: token("--surface-hi"),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [theme]);
  const geo = useMemo(() => Object.fromEntries((data?.lanes || []).map(l => [l.id, laneGeometry(l)])), [data]);
  const affectedKey = (affected || []).join(",");
  const laneMode = useMemo(() => Object.fromEntries((data?.lanes || []).map(l => [l.id, l.mode])), [data]);

  // create the map once
  useEffect(() => {
    const m = L.map(el.current, { zoomControl: false, preferCanvas: true, worldCopyJump: false, minZoom: 2, maxZoom: 10 });
    L.control.zoom({ position: "bottomright" }).addTo(m);
    m.fitBounds(VIEWS.asia);
    const zoomClass = () => el.current?.classList.toggle("z-low", m.getZoom() < LABEL_ZOOM);
    m.on("zoomend", zoomClass); zoomClass();
    map.current = m;
    layers.current.renderer = L.canvas({ padding: 0.3 });
    return () => { m.remove(); map.current = null; markers.current = new Map(); };
  }, []);

  // basemap follows the app theme
  useEffect(() => {
    const m = map.current; if (!m) return;
    if (tiles.current) tiles.current.remove();
    const [base, ref] = theme === "dark" ? TILES.dark : TILES.light;
    tiles.current = L.layerGroup([
      L.tileLayer(base, { maxZoom: 16, attribution: "Basemap &copy; Esri, HERE, Garmin, &copy; OpenStreetMap contributors" }),
      L.tileLayer(ref, { maxZoom: 16, opacity: 0.85 }),
    ]).addTo(m);
  }, [theme]);

  useEffect(() => { if (map.current) map.current.flyToBounds(VIEWS[view] || VIEWS.asia, { duration: 0.9 }); }, [view]);

  // static layers: lanes and nodes
  useEffect(() => {
    const m = map.current; if (!m || !data) return;
    if (layers.current.static) layers.current.static.remove();
    const g = L.layerGroup().addTo(m);
    const aff = new Set(affectedKey ? affectedKey.split(",") : []);
    data.lanes.forEach(l => {
      const hot = aff.has(l.supplier_id);
      L.polyline(l.path, {
        color: hot ? C.late : l.mode === "SEA" ? C.sea : C.road, weight: 1.5 + Math.min(3, l.shipments / 40),
        opacity: hot ? 0.85 : 0.5, dashArray: l.mode === "SEA" ? "6 6" : null, renderer: layers.current.renderer,
      }).bindTooltip(`<b>${l.supplier_name}</b> → ${l.plant_id}<br>${l.mode} · ${l.distance_km.toLocaleString("en-IN")} km · ~${l.transit_days} d<br>${l.shipments} shipments · on-time ${l.on_time_pct ?? "–"}%`, { sticky: true, className: "map-tip" }).addTo(g);
    });
    data.nodes.forEach(n => {
      const style = n.kind === "plant" ? { r: 10, c: C.plant } : n.kind === "supplier" ? { r: 7, c: aff.has(n.id) ? C.late : C.sup } : { r: 3.5, c: C.port };
      const mk = L.circleMarker([n.lat, n.lon], { radius: style.r, color: C.ring, weight: 2, fillColor: style.c, fillOpacity: 0.95, renderer: layers.current.renderer })
        .addTo(g);
      const label = n.kind === "plant" ? `${n.id} · ${n.id === "IN-TN-01" ? "Chennai plant" : "Bengaluru plant"}` : n.kind === "supplier" ? `${n.id} · ${n.name}<br><span>${n.site}${n.assumed_site ? " (assumed site)" : ""}</span>` : n.name;
      mk.bindTooltip(label, { permanent: n.kind !== "port", direction: n.kind === "plant" ? "right" : "top", className: `map-label ${n.kind}`, offset: [0, n.kind === "plant" ? 0 : -6] });
      if (n.kind !== "port") mk.on("click", () => onSelect?.({ type: "node", id: n.id }));
    });
    layers.current.static = g;
  }, [data, C, affectedKey]); // eslint-disable-line

  // new data (e.g. a scenario applied): rebuild shipment markers from scratch
  useEffect(() => () => { markers.current.forEach(mk => mk.remove()); markers.current = new Map(); }, [data]);

  // animation loop: place every in-transit shipment along its lane
  useEffect(() => {
    let raf;
    const tick = () => {
      const m = map.current;
      if (m && data) {
        const day = simDayRef.current;
        const f = flt.current || {};
        const live = markers.current;
        const seen = new Set();
        for (const s of data.shipments) {
          if (day < s.t_depart || day >= s.t_eta) continue;
          if (f.plant && s.plant_id !== f.plant) continue;
          if (f.mode && laneMode[s.lane] !== f.mode) continue;
          const late = day > s.t_promised;
          if (f.onlyLate && !late) continue;
          if (!f.showForecast && s.forecast && day > data.t_as_of) continue;
          seen.add(s.id);
          const g = geo[s.lane]; if (!g) continue;
          const p = (day - s.t_depart) / Math.max(0.01, s.t_eta - s.t_depart);
          const pos = pointAt(g, p);
          const color = s.disrupted ? C.dis : late ? C.late : C.ok;
          const isSel = sel.current === s.id;
          let mk = live.get(s.id);
          if (!mk) {
            mk = L.circleMarker(pos, { radius: 4.5, weight: 1.5, color: C.ring, fillColor: color, fillOpacity: 1, renderer: layers.current.renderer })
              .on("click", () => onSelect?.({ type: "shipment", id: s.id })).addTo(m);
            live.set(s.id, mk);
          } else {
            mk.setLatLng(pos);
          }
          mk.setStyle({ fillColor: color, radius: isSel ? 8 : s.forecast && day > data.t_as_of ? 3.5 : 4.5,
            color: isSel ? C.sel : C.ring, weight: isSel ? 3 : 1.2, fillOpacity: s.forecast && day > data.t_as_of ? 0.65 : 1 });
        }
        live.forEach((mk, id) => { if (!seen.has(id)) { mk.remove(); live.delete(id); } });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [data, geo, laneMode, C]); // eslint-disable-line

  // highlight the selected shipment's route
  useEffect(() => {
    const m = map.current; if (!m || !data) return;
    if (layers.current.route) { layers.current.route.remove(); layers.current.route = null; }
    const s = data.shipments.find(x => x.id === selected);
    if (s) {
      const lane = data.lanes.find(l => l.id === s.lane);
      layers.current.route = L.polyline(lane.path, { color: C.sel, weight: 5, opacity: 0.9 }).addTo(m);
    }
  }, [selected, data, C]);

  return <div ref={el} className="supply-map" />;
}
