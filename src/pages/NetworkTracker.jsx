import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Filter, Expand, Focus, Maximize, Anchor, Bot, Handshake, ShieldCheck, Sparkles, Layers3, ArrowDown, ArrowUp, Box, Compass, Crosshair, Eye, Layers, Minus, Plus, RotateCcw as RotL, RotateCw as RotR, Map as MapIcon, Network as NetIcon, Radio, Tag, ArrowDownToLine, Clock, Factory, History, MapPin, Package, Pause, Play, RotateCcw, Ship, SlidersHorizontal, Truck, TriangleAlert, Zap } from "lucide-react";
import { api } from "../api";
import { Sparkline } from "../components/ui";
const Network360Scene = lazy(() => import("../components/Network360Scene"));
// Health comes from the server (config health_bands); AT_RISK is shown as RISK on the map.
const statusOf = c => (c.health === "AT_RISK" ? "RISK" : c.health || "WATCH");
const HEALTH = { HEALTHY: ["Healthy", "var(--chart-c4)"], WATCH: ["Watch", "var(--brand-orange)"], RISK: ["At risk", "var(--depth-0)"] };
import SupplyMap from "../components/SupplyMap";
import TwinNetwork3D from "../components/TwinNetwork3D";
const Map3D = lazy(() => import("../components/Map3D"));
const NetworkTwinMap = lazy(() => import("../components/NetworkTwinMap"));     // T2 (flag network_twin_v2)
const PlantTwin = lazy(() => import("../components/PlantTwin"));                 // T4 (flag plant_twin)
import { fmt, inr, pct, useLoad } from "../util";
import TrackerLegend from "../components/TrackerLegend";
import { DisruptionFeed, EMPTY_TF, laneRecordsRequest, RecordsModal, shipmentSourceRequest, SupplierDetail, TwinFilterBar, ago } from "../components/TwinPanels";
const ShipmentTwin = lazy(() => import("../components/TwinViews").then(m => ({ default: m.ShipmentTwin })));
const SupplierTwin = lazy(() => import("../components/TwinViews").then(m => ({ default: m.SupplierTwin })));
const PortTwin = lazy(() => import("../components/TwinViews").then(m => ({ default: m.PortTwin })));
import "../tracker.css";

/* Supply Network Control Tower: a live, replayable map of every supplier -> plant shipment (digital shadow),
   with twin disruptions overlaid on forecast shipments. Layout follows an operational twin:
   simulation control (left) · live scene (centre) · summary, selection and lanes (right). */

const SPEEDS = [1, 5, 10, 20];                  // x 0.25 days per second
const DAY_MS = 86400000;
const dateOf = (start, t) => new Date(new Date(start).getTime() + t * DAY_MS);
const fmtDate = d => d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

function Bar({ label, value, max, color = "var(--brand-purple)", suffix }) {
  const p = max ? Math.min(100, (100 * value) / max) : 0;
  return (
    <div className="nt-bar">
      <div className="row-flex" style={{ justifyContent: "space-between" }}><span>{label}</span><b>{suffix ?? `${fmt(value, 0)}/${fmt(max, 0)}`}</b></div>
      <div className="bar"><i style={{ width: `${p}%`, background: color }} /></div>
    </div>
  );
}

export default function NetworkTracker({ theme, openSupplier, ask, features, user }) {
  const [scn, setScn] = useState({ scope: "", delay_days: 0, outage_days: 0 });
  const [applied, setApplied] = useState(scn);
  const trk = useLoad(() => api.tracker(applied.scope ? applied : {}), [applied.scope, applied.delay_days, applied.outage_days]);
  const net3d = { data: null };                         // network graph view removed: no fetch
  const [fresh, setFresh] = useState(null);                       // T3: live GPS refresh (bypasses the client cache)
  useEffect(() => { setFresh(null); }, [trk.data]);
  const data = fresh || trk.data;
  const [records, setRecords] = useState(null);                   // T3: source-records modal request
  const [plantView, setPlantView] = useState(null);               // T4: plant twin overlay (plant id)
  const [tf, setTf] = useState(EMPTY_TF);
  const [twin3d, setTwin3d] = useState(null);          // full-screen 3D digital twin: {kind: "ship" | "supplier", id}                         // T3: twin filters
  // full-view map: controls, filters and the arriving table open on demand
  const [panel, setPanel] = useState(false), [showF, setShowF] = useState(false), [arrOpen, setArrOpen] = useState(false);
  const feed = useLoad(() => (features?.twin_disruptions ? api.disruptions().catch(() => null) : Promise.resolve(null)), [features?.twin_disruptions]);
  useEffect(() => {                                               // poll for new GPS pings every 30 s while GPS tracking is on
    if (!features?.gps_tracking) return;
    const id = setInterval(() => api.trackerFresh(applied.scope ? applied : {}).then(setFresh).catch(() => {}), 30000);
    return () => clearInterval(id);
  }, [features?.gps_tracking, applied]);
  const bs = useLoad(() => api.bootstrap({}), []);
  const mats = useLoad(() => api.materials(), []);
  const cards = bs.data?.scorecard, ov = bs.data?.overview, pulse = bs.data?.pulse, allAlerts = bs.data?.alerts || [];
  const health = useMemo(() => Object.fromEntries((cards || []).map(c => [c.supplier_id, statusOf(c)])), [cards]);
  const alerting = useMemo(() => new Set(allAlerts.filter(a => a.supplier_id && ["CRITICAL", "HIGH"].includes(a.severity)).map(a => a.supplier_id)), [allAlerts]);
  const healthCount = useMemo(() => Object.values(health).reduce((m, k) => ({ ...m, [k]: (m[k] || 0) + 1 }), {}), [health]);
  const [hidden, setHidden] = useState(new Set());     // health statuses filtered out
  const [category, setCategory] = useState("");
  const catOf = useMemo(() => Object.fromEntries((mats.data || []).map(m => [m.material_id, m.material_category])), [mats.data]);
  const categories = useMemo(() => [...new Set((mats.data || []).map(m => m.material_category))].sort(), [mats.data]);
  const [supTab, setSupTab] = useState("overview");

  const simDay = useRef(0);
  const [day, setDay] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(5);
  const [tab, setTab] = useState("dis");
  const [view, setView] = useState("asia");          // camera / map region
  const scene = "3d";                                  // Twin map only (other scenes were removed from the page)
  const [follow, setFollow] = useState(false);
  const [layers, setLayers] = useState({ ships: true, trucks: true, lanes: true, labels: true, ports: true, ok: true, late: true, dis: true, risk: true });
  const [focus, setFocus] = useState(null);          // drill-down: { kind: plant | port | supplier, id }
  const [spotlight, setSpotlight] = useState("");
  const [mapStats, setMapStats] = useState({ ships: 0, trucks: 0, late: 0, ok: 0, dis: 0 });
  const mapApi = useRef(null);
  const [sel, setSel] = useState(null);
  const [showPlan, setShowPlan] = useState(true);
  const [filters, setFilters] = useState({ plant: "", mode: "", onlyLate: false, showForecast: true });
  const speedRef = useRef(speed); speedRef.current = speed;
  const playRef = useRef(playing); playRef.current = playing;

  // start at "today" (as-of) so the map opens on the live picture
  // The clock opens on TODAY (wall clock, clamped to the timeline); the data cut-off is a separate marker.
  const tNow = data ? Math.max(0, Math.min(data.days, data.t_now ?? data.t_as_of)) : 0;
  useEffect(() => { if (data && simDay.current === 0) { simDay.current = tNow; setDay(tNow); } }, [data]); // eslint-disable-line

  // simulation clock: advances the shared ref every frame; React panels refresh 5x per second
  useEffect(() => {
    let raf, last = performance.now(), acc = 0;
    const loop = now => {
      const dt = (now - last) / 1000; last = now;
      if (playRef.current && data) {
        simDay.current = Math.min(data.days, simDay.current + dt * 0.25 * speedRef.current);
        if (winStart.current != null && simDay.current > tNow) simDay.current = winStart.current;   // 1D/1W/1M/3M loop up to today
        if (simDay.current >= data.days) setPlaying(false);
      }
      acc += dt;
      if (acc > 0.2) { acc = 0; setDay(simDay.current); }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [data]);

  const winStart = useRef(null);
  const [win, setWin] = useState(null);
  const jump = t => { winStart.current = null; setWin(null); simDay.current = t; setDay(t); };
  // GPS Tracking page hand-off: open with one vehicle selected, followed and zoomed in, at today
  useEffect(() => {
    if (!data) return;
    let f = null;
    try { f = JSON.parse(sessionStorage.getItem("nt.focus") || "null"); sessionStorage.removeItem("nt.focus"); } catch { /* storage unavailable */ }
    if (!f?.id) return;
    setPlaying(false); jump(tNow); setFocus(null); setSel(f.id); setFollow(true);
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps
  const lanes = useMemo(() => Object.fromEntries((data?.lanes || []).map(l => [l.id, l])), [data]);
  // T3 filters: supplier, plant, material group, risk level (approved health bands), transport mode, ETA date range
  const tOf = d => (d && data ? (new Date(d) - new Date(data.start)) / DAY_MS : null);
  const twinFilter = useMemo(() => {
    if (!Object.values(tf).some(Boolean) || !data) return null;
    const a = tOf(tf.from), b = tOf(tf.to);
    return o => (!tf.supplier || o.supplier_id === tf.supplier) && (!tf.plant || o.plant_id === tf.plant)
      && (!tf.mode || lanes[o.lane]?.mode === tf.mode) && (!tf.risk || health[o.supplier_id] === tf.risk)
      && (!tf.category || (o.material_ids || [o.material_id]).some(m => catOf[m] === tf.category))
      && (a == null || o.t_eta >= a) && (b == null || o.t_eta <= b + 1);
  }, [tf, data, lanes, health, catOf]); // eslint-disable-line
  const twinLane = useMemo(() => {
    if (!twinFilter) return null;
    const keep = new Set(data.shipments.filter(twinFilter).map(s => s.lane));
    return l => keep.has(l.id);
  }, [twinFilter, data]);
  const nodes = useMemo(() => Object.fromEntries((data?.nodes || []).map(n => [n.id, n])), [data]);

  const st = useMemo(() => {
    if (!data) return null;
    const out = { production: 0, transit: 0, delivered: 0, late: 0, disrupted: 0, value: 0, onTime: 0, arriving: [], recent: [], transitDays: [], byLane: {} };
    for (const s of data.shipments) {
      if (filters.plant && s.plant_id !== filters.plant) continue;
      if (twinFilter && !twinFilter(s)) continue;              // the map filters apply to the table and counts too
      const lane = out.byLane[s.lane] || (out.byLane[s.lane] = { transit: 0, late: 0 });
      if (day >= s.t_po && day < s.t_depart) out.production++;
      else if (day >= s.t_depart && day < s.t_eta) {
        out.transit++; lane.transit++; out.value += s.value_inr;
        if (day > s.t_promised) { out.late++; lane.late++; }
        if (s.disrupted) out.disrupted++;
        if (s.t_eta - day <= 7) out.arriving.push(s);
      } else if (day >= s.t_eta) {
        out.delivered++; out.transitDays.push(s.t_eta - s.t_depart);
        if (s.t_eta <= s.t_promised) out.onTime++;
        if (day - s.t_eta < 3) out.recent.push(s);
      }
    }
    out.total = data.shipments.filter(s => (!filters.plant || s.plant_id === filters.plant) && (!twinFilter || twinFilter(s))).length;
    out.arriving.sort((a, b) => a.t_eta - b.t_eta);
    out.recent.sort((a, b) => b.t_eta - a.t_eta);
    out.events = [];
    for (const s of data.shipments) {
      if (filters.plant && s.plant_id !== filters.plant) continue;
      if (twinFilter && !twinFilter(s)) continue;              // the map filters apply to the table and counts too
      if (s.t_depart <= day && s.t_depart > day - 2) out.events.push({ t: s.t_depart, kind: "depart", s });
      if (s.t_eta <= day && s.t_eta > day - 2) out.events.push({ t: s.t_eta, kind: s.t_eta > s.t_promised ? "late-arrive" : "arrive", s });
      if (s.t_promised <= day && s.t_promised > day - 2 && s.t_eta > s.t_promised && s.t_depart <= s.t_promised) out.events.push({ t: s.t_promised, kind: "turned-late", s });
    }
    out.events.sort((a, b) => b.t - a.t);
    out.plantInbound = {};
    for (const [k, v] of Object.entries(out.byLane)) { const pl = k.split(">")[1]; out.plantInbound[pl] = (out.plantInbound[pl] || 0) + v.transit; }
    out.avgTransit = out.transitDays.length ? out.transitDays.reduce((a, b) => a + b, 0) / out.transitDays.length : null;
    return out;
  }, [data, day, filters.plant, twinFilter]);

  const selMove = data?.movements?.find(m => m.id === sel);       // T1: consolidated vessel / truck run
  const selected = data?.shipments.find(s => s.id === sel);
  const v2 = (data?.version || 1) >= 2;
  const v3 = data?.version === 3;                                       // T2 twin map available
  const twinScene = v3 && features?.network_twin_v2;
  const SRC = { LIVE: "Live (GPS)", MILESTONE: "Milestone-based", ESTIMATED: "Estimated position" };
  const status = !data ? "Loading" : playing ? "Running" : "Paused";
  // Actual = up to the data cut-off (real receipts); Now = today; after the cut-off positions use promised / forecast dates.
  const phase = !data ? "" : Math.abs(day - tNow) <= 0.5 ? "Now" : day <= data.t_as_of + 0.5 ? "Actual" : "Forecast";
  const date = data ? dateOf(data.start, day) : null;
  const affected = useMemo(() => data?.scenario?.affected || [], [data]);   // stable identity: the map redraws lanes only when this really changes
  const suppliers = (data?.nodes || []).filter(n => n.kind === "supplier");
  const seaLanes = (data?.lanes || []).filter(l => l.mode === "SEA"), roadLanes = (data?.lanes || []).filter(l => l.mode === "ROAD");
  const avg = a => (a.length ? a.reduce((x, l) => x + l.transit_days, 0) / a.length : 0);

  const legOf = (s, prog) => {
    const lane = lanes[s.lane]; if (!lane) return "";
    const plant = lane.stops[lane.stops.length - 1].name.split(" (")[0];
    if (lane.mode !== "SEA") return `Road to ${plant}`;
    const port = lane.stops[1]?.name || "port";
    if (prog < 0.04) return `Road to ${port}`;
    const entry = lane.stops[2]?.name || "Chennai port";
    if (prog > 0.93) return `Road from ${entry} to ${plant}`;
    return `At sea · ${port} → ${entry}`;
  };
  const plantLabels = useMemo(() => ({
    "IN-TN-01": `Chennai plant · ${st?.plantInbound?.["IN-TN-01"] || 0} inbound`,
    "IN-KA-01": `Bengaluru plant · ${st?.plantInbound?.["IN-KA-01"] || 0} inbound`,
  }), [st?.plantInbound?.["IN-TN-01"], st?.plantInbound?.["IN-KA-01"]]); // eslint-disable-line
  const STL = { ok: "On time", risk: "At risk", late: "Delayed", dis: "Disrupted" };
  const renderTip = tip => {
    if (tip.node) {
      const n = tip.node, sc = n.score, b = data.risk_bands;
      return (<>
        <div className="tip-h"><b>{n.kind === "supplier" ? `${n.id} · ${n.name}` : n.name}</b>{sc && <span className={`pill ${sc.health === "AT_RISK" ? "sev-CRITICAL" : sc.health === "WATCH" ? "sev-HIGH" : "sev-LOW"}`}>{sc.health.replace("_", " ")}</span>}</div>
        {n.kind === "supplier" && <div className="tip-r">{n.site}{n.assumed_site ? " (assumed site)" : ""} · {n.country}</div>}
        {sc && <>
          <div className="tip-r">Risk score <b>{fmt(sc.risk_score, 0)}</b> · bands: watch ≥ {b?.watch}, at risk ≥ {b?.risk} (approved config)</div>
          <div className="tip-r">OTIF {pct(sc.otif_pct)} · PPM {fmt(sc.incoming_ppm, 0)} · grade {sc.grade} · {sc.past_due_lines} past due</div>
          <div className="tip-r">Marker size = disruption {fmt(sc.disruption_hours, 1)} h</div></>}
        <div className="tip-f">click for details{features?.twin_side_panel ? " & source records" : ""}</div>
      </>);
    }
    if (tip.lane) {
      const l = tip.lane;
      return (<>
        <div className="tip-h"><b>{l.supplier_id} → {l.plant_id}</b>{tip.laneStatus && <span className={`pill ${tip.laneStatus === "late" ? "sev-CRITICAL" : tip.laneStatus === "risk" ? "sev-HIGH" : "sev-LOW"}`}>{STL[tip.laneStatus]}</span>}</div>
        <div className="tip-r">{l.mode} · {fmt(l.distance_km, 0)} km · {fmt(l.transit_days, 1)} d · on-time {l.on_time_pct ?? "–"}% (received lines)</div>
        <div className="tip-r">{(l.segments || []).map(g => `${g.mode.toLowerCase()} ${fmt(g.km, 0)} km (${g.provider})`).join(" + ")}</div>
        <div className="tip-f">{tip.laneStatus ? "worst in-transit shipment vs promise date" : "nothing in transit now"}{features?.twin_side_panel ? " · click for PO records" : ""}</div>
      </>);
    }
    if (tip.disruption) {
      const e = tip.disruption;
      return (<>
        <div className="tip-h"><b>⚠ {e.type}</b><span className={`pill sev-${e.severity}`}>{e.severity}</span></div>
        <div className="tip-m">{e.title}</div>
        <div className="tip-r">Radius {fmt(e.radius_km, 0)} km · {e.lanes?.length || 0} lane(s) affected{e.starts ? ` · from ${String(e.starts).slice(0, 10)}` : ""}</div>
        <div className="tip-f">Source: {e.provider} · refreshed {ago(e.fetched_at)}</div>
      </>);
    }
    const mv = data.movements?.find(x => x.id === tip.id);
    if (mv) {
      const lane = lanes[mv.lane], aboard = mv.m.filter(x => day >= x[0] && day < x[1]);
      const late = aboard.filter(x => day > x[2]).length, dis = aboard.some(x => x[3]);
      return (<>
        <div className="tip-h"><span className={`tip-ic ${tip.kind}`}>{tip.kind === "ship" ? <Ship size={13} /> : <Truck size={13} />}</span>
          <b>{tip.kind === "ship" ? "Vessel" : "Truck run"} · {aboard.length} shipment{aboard.length === 1 ? "" : "s"}</b>
          <span className={`pill ${dis ? "sev-HIGH" : late ? "sev-CRITICAL" : "sev-LOW"}`}>{dis ? "Disrupted" : late ? `${late} late` : "On track"}</span></div>
        <div className="tip-r">{nodes[mv.supplier_id]?.name} → {mv.plant_id === "IN-TN-01" ? "Chennai plant" : "Bengaluru plant"}</div>
        <div className="tip-r">{legOf(mv, tip.prog)} · {lane?.distance_km ? `${fmt(lane.distance_km, 0)} km lane` : ""}</div>
        <div className="tip-r">{mv.material_ids.length} material{mv.material_ids.length === 1 ? "" : "s"} · arrivals {fmtDate(dateOf(data.start, Math.min(...aboard.map(x => x[1])))).slice(0, 6)} – {fmtDate(dateOf(data.start, Math.max(...aboard.map(x => x[1])))).slice(0, 6)}</div>
        <div className="tip-f"><span className="pill st">Estimated position</span> consolidated · click to list PO lines</div>
      </>);
    }
    const s = data.shipments.find(x => x.id === tip.id); if (!s) return null;
    const delta = Math.round(s.t_eta - s.t_promised);
    return (<>
      <div className="tip-h"><span className={`tip-ic ${tip.kind}`}>{tip.kind === "ship" ? <Ship size={13} /> : <Truck size={13} />}</span><b>{s.po_id}</b>
        <span className={`pill ${s.disrupted ? "sev-HIGH" : day > s.t_promised ? "sev-CRITICAL" : "sev-LOW"}`}>{s.disrupted ? "Disrupted" : day > s.t_promised ? "Late" : "On track"}</span></div>
      <div className="tip-m">{data.materials[s.material_id]}</div>
      <div className="tip-r">{nodes[s.supplier_id]?.name} → {s.plant_id === "IN-TN-01" ? "Chennai plant" : "Bengaluru plant"}</div>
      <div className="tip-r">{legOf(s, tip.prog)} · {Math.round(tip.prog * 100)}% done</div>
      <div className="tip-r">ETA {fmtDate(dateOf(data.start, s.t_eta))} · {delta > 0 ? `${delta} d after promise` : delta < 0 ? `${-delta} d early` : "on promise date"}{tip.st && features?.twin_risk_encoding ? ` · ${STL[tip.st]}` : ""}</div>
      {tip.gps && <div className="tip-r"><b>GPS</b> {tip.gps.vehicle?.registration} ({tip.gps.vehicle?.device_type === "MANUAL" ? "reported by supplier" : tip.gps.vehicle?.device_type?.toLowerCase()}) · last ping {tip.gps.ago < 1 ? `${Math.round(tip.gps.ago * 60)} min` : `${fmt(tip.gps.ago, 1)} h`} ago{tip.gps.stale ? " · stale: position estimated along route" : ""}</div>}
      <div className="tip-f">{fmt(s.qty, 0)} units · {inr(s.value_inr)} · {v2 && <span className={`pill ${s.pos_source === "LIVE" ? "sev-LOW" : "st"}`}>{SRC[s.pos_source || "ESTIMATED"]}{s.demo ? " · DEMO" : ""}</span>} click for details</div>
    </>);
  };
  const shipState = s => (day < s.t_depart ? "In production" : day < s.t_eta ? (day > s.t_promised ? "Late in transit" : "In transit") : "Delivered");

  const showSide = !!(focus || selMove || selected);
  return (
    <div className="nt">
      {twin3d && data && <Suspense fallback={null}>{twin3d.kind === "ship"
        ? <ShipmentTwin data={data} id={twin3d.id} focus={twin3d.focus} day={day} onClose={() => setTwin3d(null)} onSupplier={id => setTwin3d({ kind: "supplier", id })} />
        : twin3d.kind === "port"
        ? <PortTwin data={data} pid={twin3d.id} day={day} events={features?.twin_disruptions ? feed.data?.events || [] : []} onClose={() => setTwin3d(null)}
            onShipment={id => { setSel(id); setTwin3d({ kind: "ship", id }); }} onSupplier={id => setTwin3d({ kind: "supplier", id })} />
        : <SupplierTwin data={data} sid={twin3d.id} day={day} onClose={() => setTwin3d(null)} onShipment={id => { setSel(id); setTwin3d({ kind: "ship", id }); }} />}</Suspense>}
      {records && <RecordsModal request={records} onClose={() => setRecords(null)} />}
      <div className={"nt-grid" + (panel ? "" : " no-left") + (showSide ? "" : " no-side")}>
        {/* ---- left: simulation control ---- */}
        {panel && <aside className="nt-col">
          <section className="nt-panel">
            <h4>Simulation control</h4>
            <div className="row-flex" style={{ justifyContent: "space-between", alignItems: "flex-end" }}>
              <div><div className="nt-lbl"><Clock size={12} /> Network clock</div><div className="nt-clock">{date ? fmtDate(date) : "–"}</div>
                <div className="muted">Day {fmt(day, 1)} of {data?.days ?? "–"} · today {data?.today ? fmtDate(new Date(data.today)) : "–"}</div>
                <div className="muted" style={{ fontSize: 11 }} title="Receipts are recorded up to the data cut-off. After it, shipments move on their promised / forecast dates until the next data load.">
                  Data cut-off {data?.as_of ? fmtDate(new Date(data.as_of)) : "–"}{day > (data?.t_as_of ?? 0) + 0.5 ? " · after it: forecast dates" : " · actual receipts"}</div></div>
              <span className={`pill ${phase === "Forecast" ? "sev-HIGH" : phase === "Now" ? "sev-LOW" : "st"}`}>{phase}</span>
            </div>
            <div className="nt-speeds">{SPEEDS.map(x => <button key={x} className={speed === x ? "on" : ""} onClick={() => setSpeed(x)}>{x}×</button>)}</div>
            <div className="row-flex" style={{ flexWrap: "nowrap" }}>
              <button className="primary grow row-flex" style={{ justifyContent: "center" }} onClick={() => setPlaying(p => !p)} disabled={!data}>
                {playing ? <><Pause size={15} /> Pause</> : <><Play size={15} /> Run</>}</button>
              <button className="ghost row-flex" onClick={() => { setPlaying(false); jump(0); }}><RotateCcw size={14} /> Reset</button>
            </div>
            <div className="nt-win">{[["1D", 1], ["1W", 7], ["1M", 30], ["3M", 90]].map(([l, n]) => (
              <button key={l} className={win === l ? "on" : ""} onClick={() => { if (data) { jump(Math.max(0, tNow - n)); winStart.current = Math.max(0, tNow - n); setWin(l); setPlaying(true); } }} title={`Replay the last ${l}, looping up to today`}>{l}</button>))}</div>
            <input className="nt-scrub" type="range" min={0} max={data?.days || 1} step={0.25} value={day} onChange={e => { setPlaying(false); jump(Number(e.target.value)); }} />
            <div className="row-flex" style={{ justifyContent: "space-between" }}>
              <span className="muted">{data?.start}</span>
              <button className="ghost chip-btn" onClick={() => { setPlaying(false); jump(tNow); }} title="Today (wall clock)">Today</button>
              <button className="ghost chip-btn" onClick={() => { setPlaying(false); jump(data.t_as_of); }} title="Last day with recorded receipts">Data cut-off</button>
              <span className="muted">{data?.end}</span>
            </div>
          </section>

          <div className="nt-tabs">
            {[["dis", "Disruptions", Zap, affected.length || null], ["hist", "History", History, st?.recent.length]].map(([k, l, I, n]) => (
              <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}><I size={16} />{l}{n ? <em>{n}</em> : null}</button>))}
          </div>

          {tab === "dis" && features?.twin_disruptions && <DisruptionFeed feed={feed} reload={feed.reload}
            canManage={["ADMIN", "PROCUREMENT"].includes(user?.role)} isAdmin={user?.role === "ADMIN"} />}
          {tab === "dis" && (
            <section className="nt-panel">
              <h4>Twin disruption overlay</h4>
              <p className="muted" style={{ marginTop: 0 }}>Applies to forecast shipments (after {data?.as_of}). Affected lanes turn red; shifted shipments turn orange.</p>
              <label className="tw-field">Scope
                <select value={scn.scope} onChange={e => setScn({ ...scn, scope: e.target.value })}>
                  <option value="">No disruption</option><option value="OVERSEAS">All overseas suppliers</option><option value="ALL">All suppliers</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name} ({s.country})</option>)}
                </select></label>
              <label className="tw-slider"><span><b>Shipping delay</b><em>{scn.delay_days} d</em></span>
                <input type="range" min={0} max={30} value={scn.delay_days} onChange={e => setScn({ ...scn, delay_days: Number(e.target.value) })} /></label>
              <label className="tw-slider"><span><b>Supplier outage</b><em>{scn.outage_days} d</em></span>
                <input type="range" min={0} max={30} value={scn.outage_days} onChange={e => setScn({ ...scn, outage_days: Number(e.target.value) })} /></label>
              <div className="row-flex" style={{ marginTop: 8 }}>
                <button className="primary" onClick={() => { setApplied(scn); setPlaying(false); }}>Apply to map</button>
                <button className="ghost" onClick={() => { const z = { scope: "", delay_days: 0, outage_days: 0 }; setScn(z); setApplied(z); }}>Clear</button>
              </div>
              {data?.scenario && <div className="nt-note"><TriangleAlert size={14} /> {data.shipments.filter(s => s.disrupted).length} forecast shipments shifted for {affected.join(", ")}. Press Run to watch them arrive late.</div>}
              <button className="ghost chip-btn" style={{ marginTop: 10 }} onClick={() => ask(`Using the digital twin, quantify the plant and revenue impact if ${scn.scope || "Global Pack Solutions"} has a ${scn.outage_days || 14}-day outage and ${scn.delay_days} days of shipping delay.`)}>Ask agent for impact →</button>
            </section>)}

          {tab === "hist" && (
            <section className="nt-panel">
              <h4>Delivered in the last 3 days</h4>
              <div className="nt-list">{(st?.recent || []).slice(0, 40).map(s => (
                <button key={s.id} className={`nt-row ${sel === s.id ? "on" : ""}`} onClick={() => setSel(s.id)}>
                  <span className="grow ellipsis"><b>{s.po_id}</b> · {s.supplier_id} → {s.plant_id}</span>
                  <span className={`pill ${s.t_eta <= s.t_promised ? "sev-LOW" : "sev-CRITICAL"}`}>{s.t_eta <= s.t_promised ? "On time" : "Late"}</span>
                </button>))}
                {st?.recent.length === 0 && <div className="muted">No deliveries in the last 3 days.</div>}
              </div>
            </section>)}
        </aside>}

        {/* ---- centre: toolbar (filters) · live scene · events strip ---- */}
        <div className="nt-center">
        {showF && features?.twin_filters && twinScene && scene === "3d" && data && (
          <TwinFilterBar value={tf} onChange={setTf} suppliers={suppliers} categories={categories} extraState={{ view, layers }}
            onApplyView={pl => { setTf({ ...EMPTY_TF, ...(pl.filters || {}) }); if (pl.view) setView(pl.view); if (pl.layers) setLayers(x => ({ ...x, ...pl.layers })); }} />)}
        {(scene === "3d" || scene === "classic") && data && (
          <div className="mp-layers nt-toolbar">
            <button className={`nt-tbtn ${panel ? "on" : ""}`} onClick={() => setPanel(v => !v)} aria-pressed={panel} title="Simulation, disruptions and history"><SlidersHorizontal size={13} /> Controls</button>
            <button className="nt-tbtn run" onClick={() => setPlaying(p => !p)} disabled={!data} title={playing ? "Pause the simulation" : "Run the simulation"}>{playing ? <Pause size={13} /> : <Play size={13} />} {playing ? "Pause" : "Run"}</button>
            <span className="nt-date">{date ? fmtDate(date) : "–"}</span>
            {features?.twin_filters && <button className={`nt-tbtn ${showF ? "on" : ""}`} onClick={() => setShowF(v => !v)} aria-pressed={showF}>
              <Filter size={13} /> Filters{Object.values(tf).filter(Boolean).length ? <em>{Object.values(tf).filter(Boolean).length}</em> : null}</button>}
            <span className="mp-sep" />
            <span className="mp-title"><Layers size={13} /> Show</span>
            {[["ships", "Ships", Ship, mapStats.ships], ["trucks", "Trucks", Truck, mapStats.trucks], ["labels", "Labels", Tag], ["ports", "Ports", Anchor]].map(([k, l, I, n]) => (
              <button key={k} className={`mp-chip ${layers[k] ? "on" : ""} ${k}`} onClick={() => setLayers(x => ({ ...x, [k]: !x[k] }))} title={`Show / hide ${l.toLowerCase()}`} aria-pressed={layers[k]}>
                <I size={13} /> {l}{n !== undefined && <em>{n}</em>}</button>))}
            <span className="mp-sep" />
            <span className="mp-title">Status</span>
            {(twinScene && scene === "3d" && features?.twin_risk_encoding
              ? [["ok", "On time", "var(--chart-c4)", mapStats.ok], ["risk", "At risk", "var(--brand-orange)", mapStats.risk], ["late", "Delayed", "var(--depth-0)", mapStats.late]]
              : [["ok", "On track", "var(--chart-c4)", mapStats.ok], ["late", "Late", "var(--depth-0)", mapStats.late], ["dis", "Disrupted", "var(--brand-orange)", mapStats.dis]]).map(([k, l, c, n]) => (
              <button key={k} className={`mp-chip status ${layers[k] ? "on" : ""}`} style={{ "--c": c }} onClick={() => setLayers(x => ({ ...x, [k]: !x[k] }))} aria-pressed={layers[k]} title={`Show / hide ${l.toLowerCase()} shipments`}>
                <i />{l}<em>{n}</em></button>))}
            {Object.values(layers).some(v => !v) && <button className="mp-chip reset" onClick={() => setLayers({ ships: true, trucks: true, lanes: true, labels: true, ports: true, ok: true, late: true, dis: true, risk: true })}>Show all</button>}
            {spotlight && <button className="mp-chip on spot" onClick={() => setSpotlight("")}><Eye size={13} /> {spotlight} ×</button>}
          </div>)}
        <main className="nt-stage card">
          {(() => {
            const onPick = x => {
              if (x.type === "shipment") { setSel(x.id); setFocus(null); if (features?.tracker_3d_twins) setTwin3d({ kind: "ship", id: x.id }); return; }
              if (x.type === "lane") { if (features?.twin_side_panel && lanes[x.id]) setRecords(laneRecordsRequest(lanes[x.id])); return; }
              const kind = x.id?.startsWith("SUP-") ? "supplier" : x.id?.startsWith("PORT") ? "port" : "plant";
              if (kind === "plant" && features?.plant_twin) setPlantView(x.id);
              if (kind === "supplier" && features?.tracker_3d_twins) setTwin3d({ kind: "supplier", id: x.id });
              if (kind === "port" && features?.tracker_3d_twins) setTwin3d({ kind: "port", id: x.id });
              setFocus({ kind, id: x.id });
            };
            if (scene === "twin") return data && cards ? (
              <Suspense fallback={<div className="skeleton" style={{ position: "absolute", inset: 0 }} />}>
                <Network360Scene ref={mapApi} data={data} cards={cards} theme={theme} simDayRef={simDay}
                  filters={{ status: new Set(["HEALTHY", "WATCH", "RISK"].filter(k => !hidden.has(k))), plant: filters.plant, road: layers.trucks, sea: layers.ships, category, catOf }}
                  statusOf={id => health[id] || "WATCH"} selected={focus?.kind === "supplier" ? focus.id : null}
                  onSelectSupplier={id => { setFocus({ kind: "supplier", id }); setSupTab("overview"); }} onPickShipment={id => { setSel(id); setFocus(null); }}
                  inbound={{ "IN-TN-01": st?.plantInbound?.["IN-TN-01"] || 0, "IN-KA-01": st?.plantInbound?.["IN-KA-01"] || 0, port: mapStats.ships || 0 }} />
              </Suspense>) : <div className="skeleton" style={{ position: "absolute", inset: 0 }} />;
            if (scene === "net") return <TwinNetwork3D net={net3d.data} theme={theme} onSelect={n => n.kind === "supplier" && openSupplier(n.id)} />;
            if (!data) return <div className="skeleton" style={{ position: "absolute", inset: 0 }} />;
            if (scene === "3d" && twinScene) return (
              <Suspense fallback={<div className="skeleton" style={{ position: "absolute", inset: 0 }} />}>
                <NetworkTwinMap ref={mapApi} data={data} theme={theme} simDayRef={simDay} selected={sel} onSelect={onPick} view={view} follow={follow && !!sel}
                  affected={affected} layers={layers} spotlight={spotlight || null} onStats={setMapStats} renderTip={renderTip} health={health} hidden={hidden}
                  hiddenSup={hidden.size || category ? (s => hidden.has(health[s.supplier_id]) || (category && !(s.material_ids || [s.material_id]).some(m => catOf[m] === category))) : null}
                  alerting={alerting} riskEnc={!!features?.twin_risk_encoding} disruptions={features?.twin_disruptions ? feed.data : null}
                  filterFn={features?.twin_filters ? twinFilter : null} laneVisible={features?.twin_filters ? twinLane : null} />
              </Suspense>);
            if (scene === "3d" || scene === "classic") return (
              <Suspense fallback={<div className="skeleton" style={{ position: "absolute", inset: 0 }} />}>
                <Map3D ref={mapApi} data={data} theme={theme} simDayRef={simDay} selected={sel} onSelect={onPick} view={view} follow={follow && !!sel}
                  affected={affected} layers={layers} spotlight={spotlight || null} plantLabels={plantLabels} onStats={setMapStats} renderTip={renderTip} health={health} hidden={hidden}
                  hiddenSup={hidden.size || category ? (s => hidden.has(health[s.supplier_id]) || (category && !(s.material_ids || [s.material_id]).some(m => catOf[m] === category))) : null}
                  alerting={v2 ? alerting : null} />
              </Suspense>);
            return <SupplyMap data={data} theme={theme} simDayRef={simDay} selected={sel} view={view === "malacca" ? "asia" : view} filters={filters} affected={affected} onSelect={onPick} />;
          })()}
          {(scene === "3d" || scene === "classic" || scene === "twin") && data && (<>
            <div className="mp-pad" role="toolbar" aria-label="Camera controls">
              <button title="Zoom in" onClick={() => mapApi.current?.zoom(0.75)}><Plus size={16} /></button>
              <button title="Zoom out" onClick={() => mapApi.current?.zoom(1.33)}><Minus size={16} /></button>
              <i />
              <button title="Rotate left" onClick={() => mapApi.current?.rotate(-30)}><RotL size={15} /></button>
              <button title="Rotate right" onClick={() => mapApi.current?.rotate(30)}><RotR size={15} /></button>
              <button title="Tilt up (more top-down)" onClick={() => mapApi.current?.tilt(-12)}><ArrowUp size={15} /></button>
              <button title="Tilt down (more side-on)" onClick={() => mapApi.current?.tilt(12)}><ArrowDown size={15} /></button>
              <button title="Face north" onClick={() => mapApi.current?.north()}><Compass size={15} /></button>
              <i />
              <button className="txt" title="Top-down view" onClick={() => { setFollow(false); mapApi.current?.top(); }}>Top</button>
              <button className="txt" title="Tilted 3D view" onClick={() => { setFollow(false); mapApi.current?.perspective(); }}>3D</button>
              <button className="txt" title="Low side view" onClick={() => { setFollow(false); mapApi.current?.side(); }}>Side</button>
              <i />
              <button className={follow ? "on" : ""} disabled={!sel} title={sel ? "Follow the selected vehicle" : "Select a vehicle first"} onClick={() => setFollow(f => !f)}><Crosshair size={15} /></button>
              {scene === "3d" && twinScene && <>
                <i />
                <button title="Fit to network" onClick={() => mapApi.current?.fit?.()}><Expand size={15} /></button>
                <button title="Reset view" onClick={() => mapApi.current?.reset?.()}><Focus size={15} /></button>
                <button title="Full screen" onClick={() => mapApi.current?.fullscreen?.()}><Maximize size={15} /></button>
              </>}
            </div>
            <div className="mp-hint">Drag: rotate · Right-drag: pan · Scroll: zoom</div>
            {v2 && (scene === "3d" || scene === "classic") && <>
              {data.demo_data
                ? <div className="nt-banner demo" role="alert" title="Synthetic milestones / GPS pings from scripts/gen_milestones.py are loaded (source = SYNTHETIC). Remove with --clear.">
                    <TriangleAlert size={13} /> <b>Simulated demo data</b> · synthetic milestones &amp; GPS are loaded · not real tracking</div>
                : null}
              <TrackerLegend v3={v3 && scene === "3d" && twinScene} riskEnc={twinScene && scene === "3d" && !!features?.twin_risk_encoding} bands={data.risk_bands}
                buffer={data.lane_buffer_days} feed={twinScene && scene === "3d" && features?.twin_disruptions ? feed.data : null} gps={!!features?.gps_tracking} />
              {view === "india" && mapStats.offmapVessels > 0 && <button className="nt-offmap" onClick={() => { setView("asia"); }} title="Show the full sea lanes">
                <Ship size={13} /> {mapStats.offmapVessels} vessel{mapStats.offmapVessels === 1 ? "" : "s"} · {mapStats.offmapShipments} shipments at sea beyond this view <b>→</b></button>}
            </>}
          </>)}
          {trk.err && <div className="err nt-float">{trk.err}</div>}
          {plantView && features?.plant_twin && data && (
            <div className="pt-overlay">
              <Suspense fallback={<div className="skeleton" style={{ height: 420 }} />}>
                <PlantTwin plantId={plantView} date={dateOf(data.start, Math.floor(day)).toISOString().slice(0, 10)} onBack={() => setPlantView(null)}
                  openRecords={setRecords} onPickShipment={id => { setSel(id); setFocus(null); }} />
              </Suspense>
            </div>)}
        </main>
        {data && (
          <section className="nt-arrive">
            <button className="nt-arrive-h" onClick={() => setArrOpen(v => !v)} aria-expanded={arrOpen}><ArrowDownToLine size={14} /> <b>Arriving in the next 7 days</b><span className="nt-tag">{st?.arriving.length || 0}</span>
              {(st?.arriving || []).filter(x => x.t_eta > x.t_promised).length > 0 && <span className="pill sev-CRITICAL">{(st?.arriving || []).filter(x => x.t_eta > x.t_promised).length} late</span>}
              <span className="muted">{arrOpen ? (features?.tracker_3d_twins ? "click a row to open its ship / truck in 3D" : "click a row to see the shipment") : "show table"}</span><ChevronDown size={14} className={"nt-chev" + (arrOpen ? " up" : "")} /></button>
            {arrOpen && <div className="nt-arrive-tbl">
              <table className="tbl">
                <thead><tr><th>PO</th><th>Material</th><th>Supplier</th><th>Plant</th><th>Mode</th><th>ETA</th><th>Promised</th><th className="num">Value</th><th>Status</th></tr></thead>
                <tbody>{(st?.arriving || []).slice(0, 60).map(s => {
                  const late = s.t_eta > s.t_promised;
                  const open3d = () => {
                    setSel(s.id); setFocus(null);
                    if (!features?.tracker_3d_twins) return;
                    const mv = (data.movements || []).find(m => (m.shipment_ids || []).includes(s.id));
                    setTwin3d({ kind: "ship", id: mv ? mv.id : s.id, focus: s.id });
                  };
                  return <tr key={s.id} className={"click" + (sel === s.id ? " on" : "")} onClick={open3d} tabIndex={0}
                    onKeyDown={e => e.key === "Enter" && open3d()} title="Open the 3D view of the ship / truck carrying this order">
                    <td><b>{s.po_id}</b></td><td className="ellipsis" style={{ maxWidth: 220 }}>{data.materials[s.material_id]}</td>
                    <td>{s.supplier_id} <span className="muted">{nodes[s.supplier_id]?.name}</span></td><td>{s.plant_id === "IN-TN-01" ? "Chennai" : "Bengaluru"}</td>
                    <td>{lanes[s.lane]?.mode === "SEA" ? "Sea" : "Road"}</td>
                    <td>{fmtDate(dateOf(data.start, s.t_eta)).slice(0, 6)}</td><td>{fmtDate(dateOf(data.start, s.t_promised)).slice(0, 6)}</td>
                    <td className="num">{inr(s.value_inr)}</td>
                    <td><span className={`pill ${late ? "sev-CRITICAL" : "sev-LOW"}`}>{late ? `${Math.round(s.t_eta - s.t_promised)} d late` : "On time"}</span></td>
                  </tr>;
                })}
                {(st?.arriving || []).length === 0 && <tr><td colSpan={9} className="muted">Nothing due in the next 7 days.</td></tr>}</tbody>
              </table>
            </div>}
          </section>)}
        </div>

        {/* ---- right: details of what was clicked (hidden until something is selected, so the map gets the space) ---- */}
        {showSide && <aside className="nt-col nt-side">
          {focus && data && (() => {
            const inT = s => day >= s.t_depart && day < s.t_eta;
            const label = id => (id === "IN-TN-01" ? "Chennai Electronics Plant" : id === "IN-KA-01" ? "Bengaluru Electronics Plant" : nodes[id]?.name || id);
            let ships = [], title = "", sub = "", rows = [], actions = null, extra = null;
            if (focus.kind === "plant") {
              ships = data.shipments.filter(s => s.plant_id === focus.id);
              title = label(focus.id); sub = `${focus.id} · inbound plant`;
              const bySup = {};
              ships.filter(inT).forEach(s => { bySup[s.supplier_id] = (bySup[s.supplier_id] || 0) + 1; });
              rows = Object.entries(bySup).sort((a, b) => b[1] - a[1]).map(([k, v]) => [`${k} · ${nodes[k]?.name || ""}`, `${v} moving`, () => setFocus({ kind: "supplier", id: k })]);
              actions = <>{features?.plant_twin && <button className="primary chip-btn" onClick={() => setPlantView(focus.id)}><Factory size={12} /> Open plant twin</button>}
                <button className="ghost chip-btn" onClick={() => ask(`What is inbound to ${label(focus.id)} (${focus.id}) this week, which shipments are late, and which materials are at risk of running short?`)}>Ask agent about this plant</button></>;
            } else if (focus.kind === "port") {
              const pn = nodes[focus.id]?.name;
              const viaLanes = (data.lanes || []).filter(l => l.stops.some(x => x.name === pn));
              ships = data.shipments.filter(s => viaLanes.some(l => l.id === s.lane));
              title = pn; sub = focus.id === "PORT-CHENNAI" ? "Import gateway for all overseas lanes" : "Origin port";
              rows = viaLanes.map(l => [`${l.supplier_id} → ${l.plant_id.slice(3)}`, `${fmt(l.transit_days, 1)} d · on-time ${l.on_time_pct ?? "–"}%`, () => setFocus({ kind: "supplier", id: l.supplier_id })]);
            } else {
              const n = nodes[focus.id];
              ships = data.shipments.filter(s => s.supplier_id === focus.id);
              title = n?.name; sub = `${focus.id} · ${n?.site}${n?.assumed_site ? " (assumed site)" : ""} · ${n?.country} · tier ${n?.risk_tier}`;
              rows = (data.lanes || []).filter(l => l.supplier_id === focus.id).map(l => [`${l.mode === "SEA" ? "Sea" : "Road"} to ${l.plant_id.slice(3)}`, `${fmt(l.distance_km, 0)} km · ${fmt(l.transit_days, 1)} d · on-time ${l.on_time_pct ?? "–"}%`, null]);
              actions = <><button className="ghost chip-btn" onClick={() => openSupplier(focus.id)}>Open scorecard →</button>
                <button className="ghost chip-btn" onClick={() => setSpotlight(focus.id)}><Eye size={12} /> Focus on map</button></>;
              const sc = (cards || []).find(c => c.supplier_id === focus.id);
              if (sc) {
                const hs = health[focus.id], sa = allAlerts.filter(a => a.supplier_id === focus.id);
                const top = sa.slice(0, 2).map(a => a.title.toLowerCase());
                const insight = hs === "HEALTHY" ? `${sc.supplier_name} is among the more reliable suppliers (risk ${fmt(sc.risk_score, 0)}/100). Keep monitoring${top.length ? `; watch: ${top.join(", ")}` : ""}.`
                  : hs === "WATCH" ? `${sc.supplier_name} needs attention: OTIF ${pct(sc.otif_pct)}, ${fmt(sc.overdue_capa, 0)} overdue CAPA${top.length ? `; ${top.join(", ")}` : ""}. Agree a recovery plan.`
                  : `${sc.supplier_name} is a priority risk: OTIF ${pct(sc.otif_pct)}, ${sc.past_due_lines} PO lines past due, ${fmt(sc.overdue_capa, 0)} overdue CAPA. Raise a corrective action and test a dual-source scenario.`;
                extra = (<>
                  <div className="nt-p-tabs">{[["overview", "Overview"], ["performance", "Performance"], ["insights", "Insights"]].map(([k, l]) => (
                    <button key={k} className={supTab === k ? "on" : ""} onClick={() => setSupTab(k)}>{l}</button>))}</div>
                  {supTab === "overview" && <div className="nt-health-card">
                    <div className="row-flex" style={{ justifyContent: "space-between" }}><span className="muted">Status</span>
                      <span className="pill" style={{ background: HEALTH[hs][1], color: "var(--on-accent)" }}>{HEALTH[hs][0]}</span></div>
                    <div className="nt-bar"><div className="row-flex" style={{ justifyContent: "space-between" }}><span>On-time delivery (OTIF)</span><b>{pct(sc.otif_pct)}</b></div><div className="bar"><i style={{ width: `${sc.otif_pct || 0}%`, background: "var(--chart-c1)" }} /></div></div>
                    <div className="nt-bar"><div className="row-flex" style={{ justifyContent: "space-between" }}><span>Quality score · PPM {fmt(sc.incoming_ppm, 0)}</span><b>{fmt(sc.scores.quality, 0)}/100</b></div><div className="bar"><i style={{ width: `${sc.scores.quality || 0}%`, background: "var(--chart-c4)" }} /></div></div>
                    <div className="nt-bar"><div className="row-flex" style={{ justifyContent: "space-between" }}><span>Supplier risk score</span><b>{fmt(sc.risk_score, 0)}/100</b></div><div className="bar"><i style={{ width: `${sc.risk_score || 0}%`, background: HEALTH[hs][1] }} /></div></div>
                    <div className="muted">Grade {sc.grade} ({fmt(sc.composite_score)}) · spend {inr(sc.spend_inr)}</div>
                  </div>}
                  {supTab === "performance" && <div className="nt-facts">
                    {[["In-full", pct(sc.in_full_pct)], ["Lead-time var.", `${fmt(sc.avg_lead_time_variance_days)} d`], ["Open NCR", fmt(sc.open_ncr)], ["Overdue CAPA", fmt(sc.overdue_capa)],
                      ["Price var.", pct(sc.price_variance_pct)], ["Disruption", `${fmt(sc.disruption_hours)} h`]].map(([k, v]) => <div key={k}><span>{k}</span><b>{v}</b></div>)}</div>}
                  {supTab === "insights" && <div className="nt-drill-list">{sa.length === 0 ? <div className="muted">No active risk alerts.</div> : sa.slice(0, 6).map(a => (
                    <div key={a.id} className="nt-row" style={{ display: "block" }}><b>{a.title}</b><div className="muted">{a.recommended_action}</div></div>))}</div>}
                  <div className="nt-ai"><div><Sparkles size={13} /> AI insight</div><p>{insight}</p>
                    <button className="primary chip-btn" onClick={() => ask(`Analyse ${sc.supplier_name} (${sc.supplier_id}) and recommend corrective actions with the expected impact.`)}><Bot size={12} /> Ask Copilot</button></div>
                </>);
              }
            }
            const moving = ships.filter(inT), lateN = moving.filter(s => day > s.t_promised).length;
            const due7 = moving.filter(s => s.t_eta - day <= 7).length, val = moving.reduce((a, s) => a + s.value_inr, 0);
            const done = ships.filter(s => s.t_eta <= day), onT = done.length ? (100 * done.filter(s => s.t_eta <= s.t_promised).length) / done.length : null;
            const next = moving.slice().sort((a, b) => a.t_eta - b.t_eta).slice(0, 5);
            return (
              <section className="nt-panel nt-drill">
                <h4>{focus.kind === "plant" ? <Factory size={13} /> : focus.kind === "port" ? <Anchor size={13} /> : <Package size={13} />} {focus.kind} details
                  <button className="ghost chip-btn" style={{ marginLeft: "auto" }} onClick={() => setFocus(null)}>×</button></h4>
                <div className="nt-sel"><div className="nt-sel-mat">{title}</div><div className="muted">{sub}</div></div>
                {extra}
                {features?.twin_side_panel && focus.kind === "supplier" && (
                  <SupplierDetail sid={focus.id} sc={(cards || []).find(c => c.supplier_id === focus.id)} data={data} day={day}
                    alerts={allAlerts.filter(a => a.supplier_id === focus.id)} openRecords={setRecords} onPickShipment={id => { setSel(id); setFocus(null); }} />)}
                <div className="nt-facts">
                  <div><span>Moving now</span><b>{moving.length}</b></div><div><span>Late in transit</span><b style={{ color: lateN ? "var(--depth-0)" : undefined }}>{lateN}</b></div>
                  <div><span>Due in 7 days</span><b>{due7}</b></div><div><span>Value in transit</span><b>{inr(val)}</b></div>
                  <div><span>Delivered so far</span><b>{done.length}</b></div><div><span>On-time arrival</span><b>{onT == null ? "–" : pct(onT)}</b></div>
                </div>
                {rows.length > 0 && <div className="nt-drill-list">{rows.map(([a, b, go], i) => (
                  <button key={i} className="nt-row" disabled={!go} onClick={go || undefined}><span className="grow ellipsis"><b>{a}</b></span><span className="muted">{b}</span></button>))}</div>}
                {next.length > 0 && <><div className="nt-sub-h">Next arrivals</div><div className="nt-drill-list">{next.map(s => (
                  <button key={s.id} className="nt-row" onClick={() => { setSel(s.id); setFocus(null); }}>
                    <span className="grow ellipsis"><b>{s.po_id}</b> · {data.materials[s.material_id]}</span>
                    <span className={day > s.t_promised ? "delta bad" : "muted"}>{fmtDate(dateOf(data.start, s.t_eta)).slice(0, 6)}</span></button>))}</div></>}
                {actions && <div className="row-flex" style={{ marginTop: 10 }}>{actions}</div>}
              </section>);
          })()}
          {!focus && selMove && <section className="nt-panel">
            {features?.tracker_3d_twins && <button className="primary chip-btn nt-3d" style={{ marginBottom: 8 }} onClick={() => setTwin3d({ kind: "ship", id: selMove.id })}>Open 3D twin</button>}
            <h4>{selMove.mode === "SEA" ? "Vessel" : "Truck run"} · {selMove.count} PO lines <span className="pill st">Estimated position</span>
              <button className="ghost chip-btn" style={{ marginLeft: "auto" }} onClick={() => setSel(null)}>×</button></h4>
            <div className="muted" style={{ marginBottom: 8 }}>{selMove.supplier_id} · {nodes[selMove.supplier_id]?.name} → {selMove.plant_id} · {lanes[selMove.lane]?.stops.map(x => x.name.split(" (")[0]).join(" → ")}</div>
            <div className="nt-facts">
              <div><span>Aboard now</span><b>{selMove.m.filter(x => day >= x[0] && day < x[1]).length}</b></div>
              <div><span>Units</span><b>{fmt(selMove.qty, 0)}</b></div>
              <div><span>Value</span><b>{inr(selMove.value_inr)}</b></div>
            </div>
            <div className="nt-sub-h">PO lines on this {selMove.mode === "SEA" ? "vessel" : "truck run"}</div>
            <div className="nt-drill-list">{selMove.shipment_ids.map(id => data.shipments.find(x => x.id === id)).filter(Boolean).map(x => (
              <button key={x.id} className="nt-row" onClick={() => setSel(x.id)}>
                <span className="grow ellipsis"><b>{x.po_id}</b> · {data.materials[x.material_id]}</span>
                <span className={x.t_eta > x.t_promised ? "delta bad" : "muted"}>{fmtDate(dateOf(data.start, x.t_eta)).slice(0, 6)}</span></button>))}</div>
          </section>}
          {!focus && !selMove && selected && <section className="nt-panel">
            <h4><button className="ghost chip-btn nt-close" onClick={() => setSel(null)} aria-label="Close details">×</button>Selected shipment {selected && <span className={`pill ${selected.disrupted ? "sev-HIGH" : day > selected.t_promised && day < selected.t_eta ? "sev-CRITICAL" : "st"}`}>{shipState(selected)}</span>}</h4>
            {!selected ? <div className="nt-empty"><MapPin size={22} /><b>Nothing selected</b><span>Click any ship, truck, plant, port or supplier on the map (or a live event) to drill into its details.</span></div> : (() => {
              const lane = lanes[selected.lane];
              const prog = Math.max(0, Math.min(1, (day - selected.t_depart) / Math.max(0.01, selected.t_eta - selected.t_depart)));
              return (<>
                <div className="nt-sel">
                  <div className="row-flex" style={{ justifyContent: "space-between" }}><b>{selected.po_id} · line {selected.id.split("-").pop()}</b><span className="muted">{lane.mode} · {selected.incoterm}</span></div>
                  <div className="nt-sel-mat">{data.materials[selected.material_id]}</div>
                  <div className="muted">{selected.material_id} · {fmt(selected.qty, 0)} units · {inr(selected.value_inr)}</div>
                  {v2 && <div className="row-flex" style={{ gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                    <span className={`pill ${selected.pos_source === "LIVE" ? "sev-LOW" : "st"}`}>{SRC[selected.pos_source || "ESTIMATED"]}</span>
                    {selected.demo && <span className="pill sev-HIGH">Simulated demo data</span>}
                    {lane.segments && <span className="muted" style={{ fontSize: 11 }}>Route: {lane.segments.map(g => `${g.mode.toLowerCase()} ${fmt(g.km, 0)} km (${g.provider})`).join(" + ")}{lane.route_quality === "APPROXIMATE" ? " · approximate" : ""}</span>}
                  </div>}
                </div>
                <div className="nt-stops">
                  {lane.stops.map((s, i) => {
                    const at = i / (lane.stops.length - 1);
                    const done = prog >= at - 1e-6 && day >= selected.t_depart;
                    return (<div key={i} className={`nt-stop ${done ? "done" : ""}`}><i>{s.kind === "port" ? <Anchor size={11} /> : s.kind === "plant" ? <Factory size={11} /> : <Package size={11} />}</i>
                      <span>{s.name}</span></div>);
                  })}
                </div>
                <div className="bar" style={{ margin: "8px 0" }}><i style={{ width: `${prog * 100}%`, background: "var(--brand-purple)" }} /></div>
                <div className="nt-facts">
                  <div><span>Now</span><b>{day < selected.t_depart ? "Being produced" : day >= selected.t_eta ? "Delivered" : legOf(selected, prog)}</b></div>
                  <div><span>Progress</span><b>{Math.round(prog * 100)}%</b></div>
                  <div><span>Days left</span><b>{day >= selected.t_eta ? "0" : fmt(Math.max(0, selected.t_eta - Math.max(day, selected.t_depart)), 1)}</b></div>
                  <div><span>Distance left</span><b>{fmt(lane.distance_km * (1 - prog), 0)} km</b></div>
                  <div><span>vs promise</span><b style={{ color: selected.t_eta > selected.t_promised ? "var(--depth-0)" : "var(--chart-c4)" }}>
                    {selected.t_eta > selected.t_promised ? `${Math.round(selected.t_eta - selected.t_promised)} d late` : `${Math.round(selected.t_promised - selected.t_eta)} d early`}</b></div>
                  <div><span>Lane on-time</span><b>{lane.on_time_pct ?? "–"}%</b></div>
                </div>
                <div className="nt-kvs">
                  <span>Ordered</span><b>{fmtDate(dateOf(data.start, selected.t_po))}</b>
                  <span>Departed</span><b>{fmtDate(dateOf(data.start, selected.t_depart))}</b>
                  <span>ETA</span><b>{fmtDate(dateOf(data.start, selected.t_eta))}</b>
                  <span>Promised</span><b style={{ color: selected.t_eta > selected.t_promised ? "var(--depth-0)" : "var(--chart-c4)" }}>{fmtDate(dateOf(data.start, selected.t_promised))}</b>
                </div>
                <div className="row-flex" style={{ marginTop: 10 }}>
                  {scene === "3d" && <button className={`chip-btn ${follow ? "primary" : "ghost"}`} onClick={() => setFollow(f => !f)}><Crosshair size={12} /> {follow ? "Following" : "Follow on map"}</button>}
                  {features?.tracker_3d_twins && <button className="primary chip-btn nt-3d" onClick={() => setTwin3d({ kind: "ship", id: selected.id })}>Open 3D twin</button>}
                  {features?.twin_side_panel && <button className="primary chip-btn" onClick={() => setRecords(shipmentSourceRequest(selected))}>View source records (PO / GRN)</button>}
                  <button className="ghost chip-btn" onClick={() => setFocus({ kind: "supplier", id: selected.supplier_id })}>{selected.supplier_id} details</button>
                  <button className="ghost chip-btn" onClick={() => setFocus({ kind: "plant", id: selected.plant_id })}>Plant details</button>
                </div>
              </>);
            })()}
          </section>}

        </aside>}
      </div>
    </div>
  );
}
