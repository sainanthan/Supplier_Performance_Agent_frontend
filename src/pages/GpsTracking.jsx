// GPS tracking: every truck and vessel that is on the Network Tracker map today, in one list. Click a vehicle to open the
// Network Tracker zoomed onto it (selected, followed, details open). Below: the GPS devices registered for live tracking
// (register, start / end a trip, driver link) — their positions show as "Live" on the Network Tracker.
import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, ChevronRight, Clock, Copy, Navigation, Package, Play, Plus, RotateCw, Search, Ship, Square, Truck, X } from "lucide-react";
import { api } from "../api";
import { PageHead } from "../components/ui";
import { fmt, useLoad } from "../util";

/* numbers glide to their new value instead of jumping */
function useCount(target, ms = 900) {
  const [v, setV] = useState(0), from = useRef(0);
  useEffect(() => {
    const n = Number(target); if (!Number.isFinite(n)) { setV(target); return undefined; }
    const a = Number(from.current) || 0, t0 = performance.now(); let id = 0;
    const step = now => { const x = Math.min(1, (now - t0) / ms), e = 1 - (1 - x) ** 3; setV(a + (n - a) * e); if (x < 1) id = requestAnimationFrame(step); else from.current = n; };
    id = requestAnimationFrame(step);
    return () => cancelAnimationFrame(id);
  }, [target, ms]);
  return v;
}
function Count({ value }) { const v = useCount(value); return <>{Number.isFinite(Number(value)) ? fmt(v, 0) : value}</>; }

const ago = iso => {
  if (!iso) return "never";
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
};
const LIVE_MIN = 15;
const isLive = v => v.trip_id && v.last_ping && Date.now() - new Date(v.last_ping).getTime() < LIVE_MIN * 60000;
const DAY_MS = 86400000;
const ST = { ok: ["On track", "ok"], risk: ["At risk", "risk"], late: ["Late", "late"], dis: ["Disrupted", "dis"] };
const SRC = { LIVE: "Live GPS", MILESTONE: "Milestones", ESTIMATED: "Estimated" };
const short = n => (n?.name || "").split(" (")[0].replace(" Electronics Plant", " plant");

/* the vehicles the Network Tracker draws "today": consolidated truck / vessel runs, plus GPS / milestone-tracked shipments
   (shipments riding on the same registered vehicle are grouped into one row) */
function networkVehicles(d) {
  if (!d) return [];
  const day = Math.max(0, Math.min(d.days, d.t_now ?? d.t_as_of)), buf = d.lane_buffer_days ?? 2;
  const nodes = Object.fromEntries(d.nodes.map(n => [n.id, n])), lanes = Object.fromEntries((d.lanes || []).map(l => [l.id, l]));
  const dateOf = t => new Date(new Date(d.start).getTime() + t * DAY_MS);
  const status = (eta, prom, dis) => (dis ? "dis" : day > prom ? "late" : eta > prom - buf ? "risk" : "ok");
  const out = [];
  for (const m of d.movements || []) {
    if (day < m.t_depart || day >= m.t_eta) continue;
    const aboard = (m.m || []).filter(x => day >= x[0] && day < x[1]);
    if (!aboard.length) continue;
    const rank = { ok: 0, risk: 1, late: 2, dis: 3 };
    const st = aboard.map(x => status(x[1], x[2], x[3])).reduce((a, b) => (rank[b] > rank[a] ? b : a), "ok");
    out.push({ id: m.id, focus: m.id, mode: lanes[m.lane]?.mode || m.mode, supplier: nodes[m.supplier_id], supplier_id: m.supplier_id, plant: nodes[m.plant_id],
      st, src: m.position || "ESTIMATED", count: aboard.length, prog: (day - m.t_depart) / Math.max(0.01, m.t_eta - m.t_depart),
      eta: dateOf(Math.max(...aboard.map(x => x[1]))), label: (lanes[m.lane]?.mode || m.mode) === "SEA" ? `Vessel · Sailing ${m.id.split("-").pop().replace(/^S/, "")}` : `Truck · Trip ${m.id.split("-").pop().replace(/^S/, "")}`,
      sub: m.id.replace(/^M-/, "") });
  }
  const byVeh = {};
  for (const s of d.shipments) {
    if (!s.track || day < s.t_depart || day >= s.t_eta) continue;
    const key = s.vehicle?.vehicle_id || s.id, st = status(s.t_eta, s.t_promised, s.disrupted);
    const row = byVeh[key] || (byVeh[key] = { id: key, focus: s.id, mode: lanes[s.lane]?.mode || "ROAD", supplier: nodes[s.supplier_id], supplier_id: s.supplier_id,
      plant: nodes[s.plant_id], st, src: s.pos_source || "MILESTONE", count: 0, prog: (day - s.t_depart) / Math.max(0.01, s.t_eta - s.t_depart), eta: dateOf(s.t_eta),
      label: s.vehicle ? s.vehicle.registration : `${(lanes[s.lane]?.mode || "ROAD") === "SEA" ? "Vessel" : "Truck"} · ${s.po_id}`, sub: s.vehicle ? `${s.vehicle.vehicle_id} · ${s.vehicle.carrier || "GPS device"}` : s.id,
      gpsAgoH: s.vehicle?.last_ping_t != null ? Math.max(0, (day - s.vehicle.last_ping_t) * 24) : null });
    row.count++;
    if ({ ok: 0, risk: 1, late: 2, dis: 3 }[st] > { ok: 0, risk: 1, late: 2, dis: 3 }[row.st]) row.st = st;
  }
  out.push(...Object.values(byVeh));
  return out.sort((a, b) => ({ dis: 0, late: 1, risk: 2, ok: 3 }[a.st] - { dis: 0, late: 1, risk: 2, ok: 3 }[b.st]) || (a.src === "LIVE" ? -1 : 1) - (b.src === "LIVE" ? -1 : 1));
}

function Secret({ s, onClose, copy }) {
  return <div className="gp-secret">
    <b><CheckCircle2 size={15} /> {s.vehicle_id}: driver link ready</b>
    <p>Send this link to the driver (it contains the vehicle's private key). Copy it now: the key is not shown again.</p>
    <code>{s.driver_link}</code>
    <div className="gp-acts">
      <button className="primary chip-btn" onClick={() => copy(s.driver_link)}><Copy size={12} /> Copy driver link</button>
      <button className="ghost chip-btn" onClick={() => copy(s.device_key)}><Copy size={12} /> Copy device key</button>
      <button className="ghost chip-btn" onClick={onClose}>Done</button>
    </div>
  </div>;
}

export default function GpsTracking({ nav }) {
  const trk = useLoad(() => api.tracker({}), []);
  const v = useLoad(() => api.vehicles(), []);
  const open = useLoad(() => api.predLate().catch(() => null), []);
  const [q, setQ] = useState(""), [mode, setMode] = useState(""), [stf, setStf] = useState("");
  const [sel, setSel] = useState(null), [msg, setMsg] = useState(""), [secret, setSecret] = useState(null);
  const [adding, setAdding] = useState(false), [form, setForm] = useState({ kind: "TRUCK", registration: "", carrier: "", device_type: "PHONE" });
  const [picking, setPicking] = useState(false), [pick, setPick] = useState([]), [lq, setLq] = useState("");
  useEffect(() => { const t = setInterval(() => v.reload(), 60000); return () => clearInterval(t); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const all = useMemo(() => networkVehicles(trk.data), [trk.data]);
  const rows = all.filter(r => (!mode || r.mode === mode) && (!stf || r.st === stf)
    && (!q || `${r.label} ${r.sub} ${r.supplier?.name} ${r.plant?.name}`.toLowerCase().includes(q.toLowerCase())));
  const cnt = k => all.filter(r => r.st === k).length;

  /* open the Network Tracker zoomed onto this vehicle */
  const showOnMap = id => { try { sessionStorage.setItem("nt.focus", JSON.stringify({ id })); } catch { /* storage unavailable */ } nav("tracker"); };

  const flash = m => { setMsg(m); setTimeout(() => setMsg(""), 5000); };
  const run = async (p, ok) => { try { const r = await p; if (ok) flash(ok); v.reload(); return r; } catch (e) { flash(e.message); return null; } };
  const copy = t => navigator.clipboard?.writeText(t).then(() => flash("Copied."), () => {});
  const devices = v.data || [];
  const cur = devices.find(x => x.vehicle_id === sel);
  const register = async () => {
    const r = await run(api.createVehicle(form), "Vehicle registered.");
    if (r) { setSecret(r); setSel(r.vehicle_id); setAdding(false); setForm({ ...form, registration: "", carrier: "" }); }
  };
  const lines = useMemo(() => (open.data?.items || []).map(x => ({ id: `${x.po_id}-${x.po_line}`, ...x }))
    .filter(x => !lq || `${x.id} ${x.supplier_name} ${x.material_name}`.toLowerCase().includes(lq.toLowerCase())).slice(0, 60), [open.data, lq]);
  const startTrip = async () => {
    const r = await run(api.startTrip(cur.vehicle_id, pick), `Trip started on ${cur.registration}: the driver can now share location.`);
    if (r) { setPicking(false); setPick([]); }
  };
  const devRow = id => all.find(r => r.id === id);

  return <div className="gp">
    <PageHead eyebrow="Logistics" title="GPS tracking"
      sub="Every truck and vessel on the network today. Click a vehicle to see it on the Network Tracker map." />

    <div className="gp-kpis">
      {[["On the network", all.length, "trucks and vessels in transit today", ""], ["Trucks", all.filter(r => r.mode === "ROAD").length, "on the road", ""],
        ["Vessels", all.filter(r => r.mode === "SEA").length, "at sea", ""], ["Late or at risk", cnt("late") + cnt("risk") + cnt("dis"), `${cnt("late")} late · ${cnt("dis")} disrupted`, "warn"],
        ["Live GPS", all.filter(r => r.src === "LIVE").length, "reporting their position", "live"]].map(([l, val, s, k], i) =>
        <div key={l} className={"gp-kpi" + (k ? ` ${k}` : "")} style={{ "--d": `${i * 70}ms` }}><span>{k === "live" ? <><i className="gp-pulse" />{l}</> : l}</span><b><Count value={val} /></b><em>{s}</em></div>)}
    </div>

    <section className="card gv">
      <header className="gv-h">
        <div><h3>Vehicles on the network</h3><span className="muted">As on the Network Tracker map today{trk.data?.today ? ` (${trk.data.today})` : ""}. Click one to open it on the map.</span></div>
        <label className="gp-search"><Search size={13} /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Search vehicle, supplier or plant" aria-label="Search vehicles" /></label>
      </header>
      <div className="gv-filters">
        <div className="seg">{[["", "All"], ["ROAD", "Trucks"], ["SEA", "Vessels"]].map(([k, l]) => <button key={l} className={mode === k ? "on" : ""} onClick={() => setMode(k)}>{l}</button>)}</div>
        <div className="seg">{[["", "Any status"], ["late", `Late (${cnt("late")})`], ["risk", `At risk (${cnt("risk")})`], ["dis", `Disrupted (${cnt("dis")})`], ["ok", `On track (${cnt("ok")})`]].map(([k, l]) =>
          <button key={k} className={stf === k ? "on" : ""} onClick={() => setStf(k)}>{l}</button>)}</div>
        <span className="muted">{rows.length} of {all.length}</span>
      </div>
      {trk.err ? <div className="err">{trk.err}</div> : trk.loading ? <div className="skeleton" style={{ height: 260 }} /> : !rows.length
        ? <div className="gp-empty"><Truck size={22} /><b>No vehicles match</b><span>Change the filters to see more.</span></div>
        : <div className="gv-table" role="table" aria-label="Vehicles on the network">
          <div className="gv-row head" role="row"><span>Vehicle</span><span>Route</span><span>Status</span><span>Progress</span><span>Arrives</span><span>Position</span><span /></div>
          {rows.map((r, i) => {
            const I = r.mode === "SEA" ? Ship : Truck;
            return <button key={r.id} className={`gv-row st-${r.st}`} role="row" onClick={() => showOnMap(r.focus)} style={{ "--d": `${Math.min(i, 20) * 25}ms` }}
              title={`Show ${r.label} on the Network Tracker`}>
              <span className="gv-veh"><i className={`gv-ic ${r.mode === "SEA" ? "sea" : "road"}`}><I size={16} /></i><span><b>{r.label}</b><em>{r.sub}</em></span></span>
              <span className="gv-route"><b>{short(r.supplier) || r.supplier_id}</b><em>to {short(r.plant)}</em></span>
              <span><span className={`gv-st ${ST[r.st][1]}`}>{ST[r.st][0]}</span></span>
              <span className="gv-prog"><span className="gv-bar"><i style={{ width: `${Math.round(Math.min(1, Math.max(0, r.prog)) * 100)}%` }} /></span><em>{Math.round(Math.min(1, Math.max(0, r.prog)) * 100)}% · {r.count} shipment{r.count === 1 ? "" : "s"}</em></span>
              <span className="gv-eta">{r.eta.toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}</span>
              <span className={`gv-src s-${r.src}`}>{r.src === "LIVE" && <i />}{SRC[r.src] || r.src}{r.gpsAgoH != null ? <em>{r.gpsAgoH < 1 ? `${Math.round(r.gpsAgoH * 60)} min ago` : `${fmt(r.gpsAgoH, 1)} h ago`}</em> : null}</span>
              <span className="gv-go">View on map <ChevronRight size={14} /></span>
            </button>;
          })}
        </div>}
    </section>

    {secret && <Secret s={secret} onClose={() => setSecret(null)} copy={copy} />}
    {msg && <div className="gp-msg">{msg}</div>}

    <section className="card gd">
      <header className="gv-h">
        <div><h3>GPS devices</h3><span className="muted">Trucks and vessels that report their own position. Start a trip and give the driver the link; the vehicle then shows as Live GPS above and on the map.</span></div>
        <button className="primary chip-btn" onClick={() => setAdding(a => !a)}>{adding ? <><X size={13} /> Cancel</> : <><Plus size={13} /> Register vehicle</>}</button>
      </header>
      {adding && <div className="gp-form">
        <label>Type<select value={form.kind} onChange={e => setForm({ ...form, kind: e.target.value })}><option value="TRUCK">Truck</option><option value="VESSEL">Vessel</option></select></label>
        <label>Registration / IMO<input value={form.registration} onChange={e => setForm({ ...form, registration: e.target.value })} placeholder="TN-09-AB-1234" autoFocus /></label>
        <label>Carrier<input value={form.carrier} onChange={e => setForm({ ...form, carrier: e.target.value })} placeholder="Transporter name" /></label>
        <label>Reports by<select value={form.device_type} onChange={e => setForm({ ...form, device_type: e.target.value })}>
          <option value="PHONE">Driver's phone</option><option value="TELEMATICS">Telematics device</option><option value="AIS">Ship AIS</option><option value="SIMULATOR">Simulator (demo)</option></select></label>
        <button className="primary" disabled={form.registration.trim().length < 3} onClick={register}>Register</button>
      </div>}
      {v.err ? <div className="err">{v.err}</div> : v.loading ? <div className="skeleton" style={{ height: 120 }} /> : !devices.length
        ? <div className="gp-empty"><Truck size={22} /><b>No GPS devices yet</b><span>Register the first truck to get its driver link.</span></div>
        : <div className="gd-list">{devices.map(x => {
          const onNet = devRow(x.vehicle_id), on = sel === x.vehicle_id;
          return <div key={x.vehicle_id} className={"gd-item" + (on ? " on" : "")} style={{ opacity: x.active ? 1 : 0.55 }}>
            <button className="gd-main" onClick={() => setSel(on ? null : x.vehicle_id)} aria-expanded={on}>
              <span className={"gp-dot " + (isLive(x) ? "live" : x.trip_id ? "trip" : "idle")} />
              <span className="gp-vt"><b>{x.registration}</b><em>{x.vehicle_id} · {x.kind === "VESSEL" ? "vessel" : "truck"}{x.carrier ? ` · ${x.carrier}` : ""}</em></span>
              <span className="gp-vs">{isLive(x) ? "Live" : x.trip_id ? `On trip · ${ago(x.last_ping)}` : "Idle"}</span>
            </button>
            {onNet && <button className="ghost chip-btn" onClick={() => showOnMap(onNet.focus)}><Navigation size={12} /> View on map</button>}
          </div>; })}</div>}

      {cur && <div className="gd-detail">
        <div className="gp-acts">
          {cur.active && !cur.trip_id && <button className="primary chip-btn" onClick={() => setPicking(p => !p)}><Play size={12} /> Start trip</button>}
          {cur.trip_id && <button className="ghost chip-btn" onClick={() => run(api.endTrip(cur.vehicle_id), "Trip ended.")}><Square size={12} /> End trip</button>}
          <button className="ghost chip-btn" title="Issue a new driver link; the old one stops working" onClick={async () => { const r = await run(api.rotateVehicleKey(cur.vehicle_id), "New driver link issued."); if (r) setSecret(r); }}><RotateCw size={12} /> New driver link</button>
          <span className="muted"><Clock size={12} /> Last position {ago(cur.last_ping)} · {fmt(cur.pings || 0, 0)} positions on this trip</span>
        </div>
        {picking && <div className="gp-pick">
          <div className="gp-pick-h"><b>Which open PO lines is {cur.registration} carrying?</b><span>{pick.length} selected</span></div>
          <label className="gp-search"><Search size={13} /><input value={lq} onChange={e => setLq(e.target.value)} placeholder="Search PO line, supplier or material" /></label>
          <div className="gp-lines">{open.loading ? <div className="skeleton" style={{ height: 120 }} /> : lines.map(x => {
            const on = pick.includes(x.id);
            return <label key={x.id} className={"gp-line" + (on ? " on" : "")}>
              <input type="checkbox" checked={on} onChange={() => setPick(p => (on ? p.filter(y => y !== x.id) : [...p, x.id]))} />
              <b>{x.id}</b><span>{x.supplier_name} · {x.material_name}</span><em>due {x.promised_date}</em></label>; })}
            {!open.loading && !lines.length && <div className="muted">No open PO lines match.</div>}</div>
          <div className="gp-acts"><button className="primary chip-btn" disabled={!pick.length} onClick={startTrip}><Play size={12} /> Start trip with {pick.length || "no"} line{pick.length === 1 ? "" : "s"}</button>
            <button className="ghost chip-btn" onClick={() => setPicking(false)}>Cancel</button></div>
        </div>}
        {!picking && <p className="muted" style={{ margin: 0 }}><Package size={12} /> {cur.trip_id ? `On trip #${cur.trip_id}. ` : "No trip running. "}
          {devRow(cur.vehicle_id) ? "Use View on map to follow it on the Network Tracker." : "It appears on the map once it is on a trip and sharing its position."}</p>}
      </div>}
    </section>
  </div>;
}
