import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Anchor, ArrowLeft, Building2, CalendarClock, Factory, MapPin, Package, Ship, ShieldCheck, Truck, User, X } from "lucide-react";
import { api } from "../api";
import { fmt, inr, pct, useLoad } from "../util";
import { useDialog } from "./useDialog";
import { tipStyle } from "./SupplierDrawer";
import { CampusScene, MAT_COLORS, PortScene, ShipScene, TruckScene } from "./TwinScenes";
import WhyLatePanel from "./WhyLate";

/* Premium full-screen digital-twin views opened from the network map.
   ShipmentTwin: the ship / truck with every PO line on board drawn as cargo (colour = material), live position on its route,
   ETA vs promise and the manifest.  SupplierTwin: the supplier's site in 3D with profile, owners, materials supplied and the
   history of deliveries. Esc or "Back to map" returns to the map. */
const DAY = 86400000;
const dateAt = (start, t) => new Date(new Date(start).getTime() + t * DAY);
const dmy = d => d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

function Shell({ kind, title, crumbs, onClose, scene, legend, overlay, hover, children }) {
  const ref = useDialog(onClose);
  return createPortal(
    <div className="tw3" role="dialog" aria-modal="true" aria-label={title} ref={ref} tabIndex={-1}>
      <header className="tw3-top">
        <button className="tw3-back" onClick={onClose}><ArrowLeft size={15} /> Back to map</button>
        <div className="tw3-crumbs"><span>Network map</span>{crumbs.map(c => <span key={c}>{c}</span>)}</div>
        <span className="tw3-badge">{kind}</span>
        <button className="tw3-x" onClick={onClose} aria-label="Close"><X size={16} /></button>
      </header>
      <div className="tw3-body">
        <div className="tw3-stage">{scene}{legend && <div className="tw3-legend">{legend}</div>}{overlay}
          {hover && <div className="tw3-hover"><i style={{ background: hover.color }} /><div><b>{hover.name}</b><span>{hover.sub}</span></div></div>}<div className="tw3-hint">Drag to orbit · scroll to zoom · hover cargo for details</div></div>
        <aside className="tw3-panel">{children}</aside>
      </div>
    </div>, document.body);
}

// ---------------------------------------------------------------- shipment (ship / truck)
export function ShipmentTwin({ data, id, focus, day, onClose, onSupplier }) {
  const [hover, setHover] = useState(null);
  const [why, setWhy] = useState(null);
  const mv = data.movements?.find(m => m.id === id);
  const lines = useMemo(() => (mv ? mv.shipment_ids.map(x => data.shipments.find(s => s.id === x)).filter(Boolean) : [data.shipments.find(s => s.id === id)].filter(Boolean)), [data, id, mv]);
  const head = mv || lines[0];
  if (!head) return null;
  const lane = data.lanes.find(l => l.id === head.lane);
  const prog = Math.max(0, Math.min(1, (day - head.t_depart) / Math.max(0.01, head.t_eta - head.t_depart)));
  // current leg from the routed segments, weighted by travel TIME (a sea leg takes far longer per km than a road leg)
  const segs = lane?.segments || [{ mode: lane?.mode || "ROAD", days: 1 }];
  const w = g => g.days ?? g.km ?? 1, tot = segs.reduce((s, g) => s + w(g), 0) || 1;
  let acc = 0, leg = segs[0];
  for (const g of segs) { if (prog * tot <= acc + w(g)) { leg = g; break; } acc += w(g); leg = g; }
  const isSea = (leg?.mode || lane?.mode) === "SEA";
  const late = lines.filter(s => s.t_eta > s.t_promised), status = day > Math.min(...lines.map(s => s.t_promised)) ? "late" : late.length ? "risk" : "ok";
  const mats = [...new Set(lines.map(s => s.material_id))];
  const color = m => MAT_COLORS[mats.indexOf(m) % MAT_COLORS.length];
  // one container (sea) or pallet (road) per ~600 units of each PO line, stacked up to 3 high: the deck shows the real volume on board
  const cargo = [];
  for (const s of lines) {
    const n = Math.max(1, Math.min(isSea ? 18 : 6, Math.round(s.qty / 600)));
    const info = { color: color(s.material_id), name: data.materials[s.material_id] || s.material_id, sub: `${s.po_id} · ${fmt(s.qty, 0)} units · ${inr(s.value_inr)}` };
    for (let k = 0; k < n; k += 3) cargo.push({ key: `${s.id}|${k}`, line: s.id, h: Math.min(3, n - k), ...info });
    if (cargo.length >= (isSea ? 45 : 14)) break;
  }
  // a liner carries other shippers' boxes too: fill the deck with grey containers so ours (coloured) stand out
  if (isSea) for (let k = 0; cargo.length < 36; k++) cargo.splice((k * 7) % (cargo.length + 1), 0, { key: `other-${k}`, filler: true, color: k % 3 ? "#9aa3b5" : "#7d8699", h: 1 + (k * 5) % 3 });
  const sup = data.nodes.find(n => n.id === head.supplier_id);
  const eta = dateAt(data.start, head.t_eta), promised = dateAt(data.start, Math.min(...lines.map(s => s.t_promised)));
  const daysLeft = Math.max(0, head.t_eta - Math.max(day, head.t_depart));
  const value = lines.reduce((s, x) => s + (x.value_inr || 0), 0), qty = lines.reduce((s, x) => s + (x.qty || 0), 0);
  const stops = lane?.stops || [];
  const stLabel = { ok: ["On track", "ok"], risk: ["At risk", "warn"], late: ["Delayed", "bad"] }[status];
  return (
    <Shell kind={isSea ? "Vessel digital twin" : "Truck digital twin"} title="Shipment digital twin" onClose={onClose}
      crumbs={[`${sup?.name || head.supplier_id} → ${head.plant_id === "IN-TN-01" ? "Chennai" : "Bengaluru"}`, isSea ? "Container vessel" : "Road freight"]}
      hover={hover} scene={isSea ? <ShipScene cargo={cargo} status={status} onHoverItem={setHover} /> : <TruckScene cargo={cargo} status={status} onHoverItem={setHover} />}
      legend={[...mats.slice(0, 8).map(m => <span key={m}><i style={{ background: color(m) }} />{data.materials[m] || m}</span>),
        ...(isSea ? [<span key="other" className="muted-chip"><i style={{ background: "#9aa3b5" }} />other shippers' cargo</span>] : [])]}>
      <div className="tw3-hero">
        <span className={`tw3-ic ${isSea ? "sea" : "road"}`}>{isSea ? <Ship size={22} /> : <Truck size={22} />}</span>
        <div><b>{isSea ? "Container vessel" : "Freight truck"} · {lines.length} PO line{lines.length > 1 ? "s" : ""} on board</b>
          <span>{sup?.name} ({head.supplier_id}) · {lane?.mode === "SEA" ? "sea + road" : "road"} · {fmt(lane?.distance_km, 0)} km</span></div>
        <span className={`tw3-st ${stLabel[1]}`}>{stLabel[0]}</span>
      </div>
      <div className="tw3-kpis">
        <div><span>Materials</span><b>{mats.length}</b></div>
        <div><span>Units</span><b>{fmt(qty, 0)}</b></div>
        <div><span>Cargo value</span><b>{inr(value)}</b></div>
        <div><span>ETA</span><b>{dmy(eta)}</b><em>{daysLeft ? `${fmt(daysLeft, 1)} days left` : "arriving"}</em></div>
      </div>
      <div className={`tw3-eta ${status}`}><CalendarClock size={14} /> Promised {dmy(promised)} · {head.t_eta > Math.min(...lines.map(s => s.t_promised))
        ? <b>{Math.round(head.t_eta - Math.min(...lines.map(s => s.t_promised)))} days late vs promise</b> : <b>on time vs promise</b>}</div>

      <h4><MapPin size={14} /> Journey · {Math.round(prog * 100)}% · now: {leg?.mode === "SEA" ? "at sea" : lane?.mode === "SEA" && prog > 0.5 ? "on the road from the port" : "on the road"}</h4>
      <div className="tw3-route">
        <div className="tw3-track"><i style={{ width: `${prog * 100}%` }} /><span className="tw3-dot" style={{ left: `${prog * 100}%` }}>{isSea ? <Ship size={12} /> : <Truck size={12} />}</span></div>
        <div className="tw3-stops">{stops.map((s, i) => <div key={i} className={prog >= i / Math.max(1, stops.length - 1) ? "done" : ""}>
          <span>{s.kind === "port" ? <Anchor size={11} /> : s.kind === "plant" ? <Factory size={11} /> : <Building2 size={11} />}</span><b>{s.name.split(" (")[0]}</b></div>)}</div>
      </div>

      {(() => { const f = focus && lines.find(s => s.id === focus); if (!f) return null; const lt = f.t_eta > f.t_promised;
        return <div className={`tw3-focus ${lt ? "late" : "ok"}`}>
          <Package size={15} />
          <div><b>You opened {f.po_id} · {data.materials[f.material_id] || f.material_id}</b>
            <span>{fmt(f.qty, 0)} units · {inr(f.value_inr)} · ETA {dmy(dateAt(data.start, f.t_eta))} · promised {dmy(dateAt(data.start, f.t_promised))}
              {lines.length > 1 ? ` · travelling with ${lines.length - 1} other PO line${lines.length > 2 ? "s" : ""}` : ""}</span></div>
          <span className={`tw3-st sm ${lt ? "bad" : "ok"}`}>{lt ? `${Math.round(f.t_eta - f.t_promised)} d late` : "on time"}</span>
          {lt && <button className="ghost chip-btn tw3-why" onClick={() => setWhy({ po: f.po_id, line: Number(f.id.split("-").pop()) })}>Why late?</button>}
        </div>; })()}

      <h4><Package size={14} /> Manifest · what we are going to receive</h4>
      <div className="tw3-manifest">{[...lines].sort((a, b) => (b.id === focus) - (a.id === focus)).map(s => {
        const lt = s.t_eta > s.t_promised;
        return <div key={s.id} className={"tw3-line" + (s.id === focus ? " focus" : "")}>
          <i style={{ background: color(s.material_id) }} />
          <div className="tw3-line-m"><b>{data.materials[s.material_id] || s.material_id}</b><span>{s.material_id} · {s.po_id} line {s.id.split("-").pop()} · {s.incoterm}</span></div>
          <div className="tw3-line-n"><b>{fmt(s.qty, 0)}</b><span>{inr(s.value_inr)}</span></div>
          <span className={`tw3-st sm ${lt ? "bad" : "ok"}`}>{lt ? `${Math.round(s.t_eta - s.t_promised)} d late` : "on time"}</span>
          {lt && <button className="ghost chip-btn tw3-why" onClick={() => setWhy({ po: s.po_id, line: Number(s.id.split("-").pop()) })}>Why?</button>}
        </div>;
      })}</div>
      <button className="tw3-cta" onClick={() => onSupplier(head.supplier_id)}><Building2 size={15} /> Open {sup?.name} digital twin</button>
      {why && <WhyLatePanel po={why.po} line={why.line} onClose={() => setWhy(null)} />}
    </Shell>
  );
}

// ---------------------------------------------------------------- supplier site
export function SupplierTwin({ data, sid, day, onClose, onShipment }) {
  const d = useLoad(() => api.trackerSupplierTwin(sid), [sid]);
  const [metric, setMetric] = useState("value_inr");
  const node = data.nodes.find(n => n.id === sid);
  const x = d.data, p = x?.profile || {}, sc = x?.scorecard || {};
  const mats = x?.materials || [];
  const matIds = mats.map(m => m.material_id);
  const colorOf = id => MAT_COLORS[Math.max(0, matIds.indexOf(id)) % MAT_COLORS.length];
  const top = matIds.slice(0, 6);
  const months = useMemo(() => {
    const by = {};
    for (const r of x?.monthly || []) { const k = r.month; by[k] = by[k] || { month: k }; const key = top.includes(r.material_id) ? r.material_id : "other"; by[k][key] = (by[k][key] || 0) + Number(r[metric] || 0); }
    return Object.values(by).sort((a, b) => a.month.localeCompare(b.month));
  }, [x, metric]); // eslint-disable-line react-hooks/exhaustive-deps
  const inTransit = data.shipments.filter(s => s.supplier_id === sid && day >= s.t_depart && day < s.t_eta);
  const moving = (data.movements || []).filter(m => m.supplier_id === sid && day >= m.t_depart && day < m.t_eta);
  const health = sc.health || node?.score?.health;
  const hcls = health === "AT_RISK" ? "bad" : health === "HEALTHY" ? "ok" : "warn";
  return (
    <Shell kind="Supplier digital twin" title={`${p.supplier_name || sid} digital twin`} onClose={onClose}
      crumbs={[node?.name || sid, x?.site?.city || node?.site || ""]}
      scene={x ? <CampusScene name={p.supplier_name} health={health} grade={sc.grade} materials={mats} /> : <div className="skeleton" style={{ position: "absolute", inset: 0 }} />}
      legend={mats.slice(0, 8).map(m => <span key={m.material_id}><i style={{ background: colorOf(m.material_id) }} />{m.material_name}</span>)}
      overlay={x && <div className="tw3-sign"><b>{p.supplier_name}</b><span>Grade {sc.grade || "–"} · {String(health || "").replace("_", " ").toLowerCase()} · {inTransit.length} PO lines in transit</span></div>}>
      {d.err && <div className="err">{d.err}</div>}
      {!x && !d.err && <div className="skeleton" style={{ height: 420 }} />}
      {x && <>
        <div className="tw3-hero">
          <span className="tw3-ic sup"><Factory size={22} /></span>
          <div><b>{p.supplier_name}</b><span>{sid} · {x.site?.city || node?.site}, {p.country} · {p.material_category?.toLowerCase()}</span></div>
          <span className={`tw3-st ${hcls}`}>{String(health || "").replace("_", " ").toLowerCase() || "–"}</span>
        </div>
        <div className="tw3-kpis five">
          <div><span>Grade</span><b>{sc.grade || "–"}</b><em>score {fmt(sc.composite_score)}</em></div>
          <div><span>OTIF</span><b>{pct(sc.otif_pct)}</b></div>
          <div><span>Incoming PPM</span><b>{fmt(sc.incoming_ppm, 0)}</b></div>
          <div><span>Spend</span><b>{inr(sc.spend_inr)}</b></div>
          <div><span>In transit now</span><b>{inTransit.length}</b><em>{moving.length} vehicle(s)</em></div>
        </div>

        <h4><User size={14} /> Owner & company</h4>
        <div className="tw3-owner">
          <div><span>Company</span><b>{p.supplier_name}</b></div>
          <div><span>Site (assumed)</span><b>{x.site?.city || "–"}, {p.country}</b></div>
          <div><span>Status</span><b>{String(p.approved_status || "").toLowerCase()} · risk tier {String(p.risk_tier || "").toLowerCase()}</b></div>
          <div><span>Certification</span><b>{p.quality_certification || "–"}</b></div>
          <div><span>Payment terms</span><b>{p.payment_terms || "–"}</b></div>
          <div><span>Standard lead time</span><b>{p.standard_lead_time_days} days</b></div>
          <div><span>Supplier contact</span><b>{x.contact?.email || x.portal_users?.[0]?.display_name || "not recorded"}</b></div>
          <div><span>Our owners</span><b>{x.owners.map(o => `${o.display_name} (${o.role.toLowerCase()})`).join(", ") || "–"}</b></div>
        </div>

        <h4><Package size={14} /> Materials supplied</h4>
        <div className="tw3-mats">{mats.map(m => (
          <div key={m.material_id} className="tw3-mat">
            <i style={{ background: colorOf(m.material_id) }} />
            <div className="tw3-line-m"><b>{m.material_name}</b><span>{m.material_id} · {m.lines} PO lines · OTIF {pct(m.otif_pct)}{m.defects ? ` · ${fmt(m.defects, 1)} defects` : ""}{m.past_due ? ` · ${m.past_due} past due` : ""}</span></div>
            <div className="tw3-line-n"><b>{fmt(m.qty_received, 0)}</b><span>{inr(m.value_inr)}</span></div>
          </div>))}</div>

        <h4><CalendarClock size={14} /> History of materials sent
          <span className="seg tw3-seg">{[["value_inr", "Value"], ["qty", "Units"]].map(([k, l]) => <button key={k} className={metric === k ? "on" : ""} onClick={() => setMetric(k)}>{l}</button>)}</span></h4>
        <ResponsiveContainer width="100%" height={190}>
          <BarChart data={months} margin={{ top: 6, right: 6, left: -6, bottom: 0 }}>
            <CartesianGrid stroke="var(--dr-border)" vertical={false} />
            <XAxis dataKey="month" tick={{ fontSize: 11, fill: "var(--text-secondary)" }} />
            <YAxis tick={{ fontSize: 10.5, fill: "var(--text-secondary)" }} tickFormatter={v => (metric === "value_inr" ? `₹${(v / 1e7).toFixed(1)}Cr` : fmt(v / 1000, 0) + "k")} />
            <Tooltip {...tipStyle} formatter={(v, k) => [metric === "value_inr" ? inr(v) : fmt(v, 0), mats.find(m => m.material_id === k)?.material_name || "Other materials"]} />
            {top.map(id => <Bar key={id} dataKey={id} stackId="a" fill={colorOf(id)} />)}
            <Bar dataKey="other" stackId="a" fill="#b8bfcc" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>

        <h4><ShieldCheck size={14} /> Recent deliveries</h4>
        <div className="tw3-recent">{x.recent.map(r => (
          <div key={`${r.po_id}-${r.po_line}`} className="tw3-line">
            <i style={{ background: colorOf(r.material_id) }} />
            <div className="tw3-line-m"><b>{r.material_name}</b><span>{r.po_id}/{r.po_line} · {r.plant_id} · {r.receipt_date ? `received ${String(r.receipt_date).slice(0, 10)}` : `promised ${String(r.promised_date).slice(0, 10)}`}</span></div>
            <div className="tw3-line-n"><b>{fmt(r.received_qty, 0)}</b><span>{inr(r.receipt_value_inr)}</span></div>
            <span className={`tw3-st sm ${r.delivery_status === "PAST_DUE" ? "bad" : r.otif ? "ok" : "warn"}`}>{r.delivery_status === "PAST_DUE" ? "past due" : r.otif ? "OTIF" : `${Math.max(0, r.delay_days || 0)} d late`}</span>
          </div>))}</div>
        {moving.length > 0 && <button className="tw3-cta" onClick={() => onShipment(moving[0].id)}><Ship size={15} /> Follow a vehicle in transit from this supplier</button>}
      </>}
    </Shell>
  );
}

// ---------------------------------------------------------------- port
const km = (a, b) => { const R = 6371, r = Math.PI / 180, dLa = (b[0] - a[0]) * r, dLo = (b[1] - a[1]) * r;
  return 2 * R * Math.asin(Math.sqrt(Math.sin(dLa / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLo / 2) ** 2)); };
/** day offset at which a shipment calls at this port: origin port = end of the first road leg, entry port = end of the sea leg.
    Leg times come from the routed segments, scaled to the shipment's own departure -> ETA window. */
function portCall(s, lane, role) {
  const segs = lane?.segments || [];
  const tot = segs.reduce((a, g) => a + (g.days || 0), 0) || 1, f = (s.t_eta - s.t_depart) / tot;
  const upto = role === "origin" ? (segs[0]?.days || 0) : (segs[0]?.days || 0) + (segs[1]?.days || 0);
  return s.t_depart + upto * f;
}
export function PortTwin({ data, pid, day, onClose, onShipment, onSupplier, events = [] }) {
  const node = data.nodes.find(n => n.id === pid) || {};
  const lanes = data.lanes.filter(l => l.origin_port === pid || l.entry_port === pid);
  const role = lanes.some(l => l.entry_port === pid) ? "entry" : "origin";
  const laneOf = Object.fromEntries(lanes.map(l => [l.id, l]));
  const calls = useMemo(() => data.shipments.filter(s => laneOf[s.lane]).map(s => {
    const l = laneOf[s.lane], r = l.entry_port === pid ? "entry" : "origin";
    return { ...s, at: portCall(s, l, r), role: r };
  }), [data, pid]); // eslint-disable-line react-hooks/exhaustive-deps
  const next7 = calls.filter(c => c.at >= day && c.at < day + 7).sort((a, b) => a.at - b.at);
  const nowAt = (data.movements || []).filter(m => laneOf[m.lane] && day >= m.t_depart && day < m.t_eta).map(m => {
    const l = laneOf[m.lane], r = l.entry_port === pid ? "entry" : "origin", at = portCall(m, l, r);
    return { ...m, at, gap: at - day };
  }).filter(m => Math.abs(m.gap) <= 3).sort((a, b) => Math.abs(a.gap) - Math.abs(b.gap));
  const months = useMemo(() => {
    const by = {};
    for (const c of calls) { const k = dateAt(data.start, c.at).toISOString().slice(0, 7); by[k] = by[k] || { month: k, value: 0, lines: 0 }; by[k].value += c.value_inr || 0; by[k].lines += 1; }
    return Object.values(by).sort((a, b) => a.month.localeCompare(b.month));
  }, [calls, data.start]);
  const value = calls.reduce((a, c) => a + (c.value_inr || 0), 0);
  const lateNext = next7.filter(c => c.t_eta > c.t_promised).length;
  const near = events.map(e => ({ ...e, dist: km([node.lat, node.lon], [e.lat, e.lon]) })).filter(e => e.dist < 800).sort((a, b) => a.dist - b.dist);
  const sups = [...new Set(lanes.map(l => l.supplier_id))];
  const status = near.some(e => ["CRITICAL", "HIGH"].includes(e.severity)) ? "late" : lateNext ? "risk" : "ok";
  const stLabel = { ok: ["Flowing", "ok"], risk: ["Late arrivals", "warn"], late: ["Disruption nearby", "bad"] }[status];
  const plantName = id => data.nodes.find(n => n.id === id)?.name?.split(" (")[0] || id;
  return (
    <Shell kind="Port digital twin" title={`${node.name} digital twin`} onClose={onClose}
      crumbs={[node.name || pid, node.terminal || ""]}
      scene={<PortScene name={node.name || "Port"} status={status} />}
      legend={[<span key="r"><i style={{ background: "#c0392b" }} />ship-to-shore cranes working the berth</span>, <span key="y"><i style={{ background: "#e8b71c" }} />yard gantries</span>]}
      overlay={<div className="tw3-sign"><b>{node.name}</b><span>{role === "entry" ? "India entry port" : "Origin port"} · {lanes.length} route{lanes.length === 1 ? "" : "s"} · {next7.length} PO lines next 7 days</span></div>}>
      <div className="tw3-hero">
        <span className="tw3-ic sea"><Anchor size={22} /></span>
        <div><b>{node.name}</b><span>{node.terminal} · {node.country}{node.locode ? ` · UN/LOCODE ${node.locode}` : ""}</span></div>
        <span className={`tw3-st ${stLabel[1]}`}>{stLabel[0]}</span>
      </div>
      <div className="tw3-kpis five">
        <div><span>Role</span><b>{role === "entry" ? "Import" : "Export"}</b><em>{role === "entry" ? "India entry port" : "supplier's origin port"}</em></div>
        <div><span>Suppliers</span><b>{sups.length}</b><em>{lanes.length} route(s)</em></div>
        <div><span>PO lines via port</span><b>{fmt(calls.length, 0)}</b><em>{inr(value)}</em></div>
        <div><span>Next 7 days</span><b>{next7.length}</b><em>{lateNext} late vs promise</em></div>
        <div><span>At / near port now</span><b>{nowAt.length}</b><em>vessel(s) within ±3 days</em></div>
      </div>

      <h4><MapPin size={14} /> Berth & position</h4>
      <div className="tw3-owner">
        <div><span>Terminal</span><b>{node.terminal || "–"}</b></div>
        <div><span>Coordinates (berth)</span><b>{fmt(node.lat, 4)}°, {fmt(node.lon, 4)}°</b></div>
        <div><span>Quay faces</span><b>{node.sea_bearing != null ? `${Math.round(node.sea_bearing)}° (towards open water)` : "–"}</b></div>
        <div><span>Handling assumed</span><b>2 days per port call</b></div>
      </div>

      <h4><Building2 size={14} /> Suppliers routed through this port</h4>
      <div className="tw3-mats">{lanes.map(l => (
        <div key={l.id} className="tw3-mat" role="button" tabIndex={0} onClick={() => onSupplier(l.supplier_id)} onKeyDown={e => e.key === "Enter" && onSupplier(l.supplier_id)} style={{ cursor: "pointer" }}>
          <i style={{ background: "#1e88e5" }} />
          <div className="tw3-line-m"><b>{l.supplier_name || l.supplier_id}</b><span>{l.supplier_id} → {plantName(l.plant_id)} · {fmt(l.transit_days, 1)} d transit · {fmt(l.distance_km, 0)} km{l.entry_port === pid ? " · enters India here" : " · loads here"}</span></div>
          <div className="tw3-line-n"><b>{l.on_time_pct != null ? `${l.on_time_pct}%` : "–"}</b><span>on time</span></div>
        </div>))}</div>

      <h4><Ship size={14} /> Vessels at or near the port now</h4>
      {nowAt.length ? <div className="tw3-manifest">{nowAt.slice(0, 8).map(m => (
        <div key={m.id} className="tw3-line" role="button" tabIndex={0} style={{ cursor: "pointer" }} onClick={() => onShipment(m.id)} onKeyDown={e => e.key === "Enter" && onShipment(m.id)}>
          <i style={{ background: m.gap < 0 ? "#6f3dba" : "#1e88e5" }} />
          <div className="tw3-line-m"><b>{laneOf[m.lane]?.supplier_name || m.supplier_id}</b><span>{(m.shipment_ids || []).length || 1} PO line(s) · {m.gap < -0.5 ? `left ${fmt(-m.gap, 1)} d ago` : m.gap > 0.5 ? `calls in ${fmt(m.gap, 1)} d` : "alongside now"}</span></div>
          <span className="tw3-st sm ok">open twin</span>
        </div>))}</div> : <div className="muted" style={{ fontSize: 12.5 }}>No vessel within 3 days of this port on the current date.</div>}

      <h4><CalendarClock size={14} /> Next 7 days through this port</h4>
      {next7.length ? <div className="tw3-recent">{next7.slice(0, 12).map(c => {
        const lt = c.t_eta > c.t_promised;
        return <div key={c.id} className="tw3-line">
          <i style={{ background: lt ? "#c0392b" : "#1f8f74" }} />
          <div className="tw3-line-m"><b>{data.materials[c.material_id] || c.material_id}</b><span>{c.po_id} · {c.supplier_id} · {c.role === "entry" ? "arrives" : "loads"} {dmy(dateAt(data.start, c.at))}</span></div>
          <div className="tw3-line-n"><b>{fmt(c.qty, 0)}</b><span>{inr(c.value_inr)}</span></div>
          <span className={`tw3-st sm ${lt ? "bad" : "ok"}`}>{lt ? `${Math.round(c.t_eta - c.t_promised)} d late` : "on time"}</span>
        </div>;
      })}</div> : <div className="muted" style={{ fontSize: 12.5 }}>Nothing scheduled through this port in the next 7 days.</div>}

      <h4><Package size={14} /> Monthly value through the port</h4>
      <ResponsiveContainer width="100%" height={170}>
        <BarChart data={months} margin={{ top: 6, right: 6, left: -6, bottom: 0 }}>
          <CartesianGrid stroke="var(--dr-border)" vertical={false} />
          <XAxis dataKey="month" tick={{ fontSize: 11, fill: "var(--text-secondary)" }} />
          <YAxis tick={{ fontSize: 10.5, fill: "var(--text-secondary)" }} tickFormatter={v => `₹${(v / 1e7).toFixed(1)}Cr`} />
          <Tooltip {...tipStyle} formatter={(v, k, p) => [`${inr(v)} · ${p.payload.lines} PO lines`, "Value"]} />
          <Bar dataKey="value" fill="#1e88e5" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>

      <h4><ShieldCheck size={14} /> Disruptions within 800 km</h4>
      {near.length ? <div className="tw3-recent">{near.slice(0, 6).map((e, i) => (
        <div key={i} className="tw3-line">
          <i style={{ background: e.severity === "CRITICAL" ? "#c0392b" : e.severity === "HIGH" ? "#d9822b" : "#8a93a6" }} />
          <div className="tw3-line-m"><b>{e.type}{e.title ? ` · ${e.title}` : ""}</b><span>{Math.round(e.dist)} km away · {String(e.severity || "").toLowerCase()}</span></div>
        </div>))}</div> : <div className="muted" style={{ fontSize: 12.5 }}>No disruption reported near this port.</div>}
    </Shell>
  );
}
