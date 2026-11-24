// GPS tracking: its own page (was a card in Settings). Register trucks / vessels, hand the driver link to the driver, start a
// trip with the open PO lines it carries, and follow each vehicle's latest positions. Positions are accepted only during an
// active trip; the Network Tracker then shows the vehicle with the "Live" label.
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Clock, Copy, Gauge, MapPinned, Navigation, Package, Play, Plus, Route, RotateCw, Search, Smartphone, Square, Truck, X } from "lucide-react";
import { km, routeProgress } from "../components/geo";
import { api } from "../api";
import { PageHead } from "../components/ui";
import { fmt, useLoad } from "../util";
const GpsLiveMap = lazy(() => import("../components/GpsLiveMap"));

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
function Count({ value, digits = 0 }) { const v = useCount(value); return <>{Number.isFinite(Number(value)) ? fmt(v, digits) : value}</>; }
/* re-renders every second so "N s ago" ticks */
function useTick(ms = 1000) { const [, set] = useState(0); useEffect(() => { const t = setInterval(() => set(x => x + 1), ms); return () => clearInterval(t); }, [ms]); }
const since = iso => { if (!iso) return "–"; const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  return s < 60 ? `${s} s ago` : s < 3600 ? `${Math.floor(s / 60)} min ${s % 60} s ago` : ago(iso); };

const ago = iso => {
  if (!iso) return "never";
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
};
const LIVE_MIN = 15;                                                   // a vehicle counts as "live" if it reported in the last 15 minutes
const isLive = v => v.trip_id && v.last_ping && Date.now() - new Date(v.last_ping).getTime() < LIVE_MIN * 60000;
const when = iso => (iso ? new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "–");

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
  const v = useLoad(() => api.vehicles(), []);
  const open = useLoad(() => api.predLate().catch(() => null), []);
  const [sel, setSel] = useState(null), [msg, setMsg] = useState(""), [secret, setSecret] = useState(null);
  const [adding, setAdding] = useState(false), [form, setForm] = useState({ kind: "TRUCK", registration: "", carrier: "", device_type: "PHONE" });
  const [picking, setPicking] = useState(false), [pick, setPick] = useState([]), [q, setQ] = useState("");
  const list = v.data || [];
  const cur = list.find(x => x.vehicle_id === sel) || list[0];
  const track = useLoad(() => (cur ? api.vehicleTrack(cur.vehicle_id).catch(() => null) : Promise.resolve(null)), [cur?.vehicle_id, cur?.trip_id, cur?.pings]);
  useEffect(() => { setPicking(false); setPick([]); setQ(""); }, [cur?.vehicle_id]);
  useEffect(() => { const t = setInterval(() => v.reload(), 60000); return () => clearInterval(t); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const flash = m => { setMsg(m); setTimeout(() => setMsg(""), 5000); };
  const run = async (p, ok) => { try { const r = await p; if (ok) flash(ok); v.reload(); return r; } catch (e) { flash(e.message); return null; } };
  const copy = t => navigator.clipboard?.writeText(t).then(() => flash("Copied."), () => {});
  const register = async () => {
    const r = await run(api.createVehicle(form), "Vehicle registered.");
    if (r) { setSecret(r); setSel(r.vehicle_id); setAdding(false); setForm({ ...form, registration: "", carrier: "" }); }
  };
  const lines = useMemo(() => (open.data?.items || []).map(x => ({ id: `${x.po_id}-${x.po_line}`, ...x }))
    .filter(x => !q || `${x.id} ${x.supplier_name} ${x.material_name}`.toLowerCase().includes(q.toLowerCase())).slice(0, 60), [open.data, q]);
  const startTrip = async () => {
    const r = await run(api.startTrip(cur.vehicle_id, pick), `Trip started on ${cur.registration}: the driver can now share location.`);
    if (r) { setPicking(false); setPick([]); }
  };

  const onTrip = list.filter(x => x.trip_id).length, live = list.filter(isLive).length;
  const pings = list.reduce((s, x) => s + (x.pings || 0), 0);
  const lastAny = list.map(x => x.last_ping).filter(Boolean).sort().at(-1);
  const t = track.data;
  useTick();
  const pts = (t?.pings || []), lastP = pts.at(-1), prog = routeProgress(t?.route, lastP ? [lastP.lat, lastP.lon] : null);
  const spd = pts.slice(-5).filter(p => p.speed_kmh != null), avgSpd = spd.length ? spd.reduce((a, p) => a + p.speed_kmh, 0) / spd.length : null;
  const driven = pts.reduce((a, p, k) => a + (k ? km([pts[k - 1].lat, pts[k - 1].lon], [p.lat, p.lon]) : 0), 0);
  const eta = prog && avgSpd ? new Date(Date.now() + (prog.left / avgSpd) * 3600000) : null;

  return <div className="gp">
    <PageHead eyebrow="Logistics" title="GPS tracking"
      sub="Register vehicles, give drivers their tracking link, and follow each trip live on the Network Tracker." />


    <div className="gp-kpis">
      {[["Vehicles", list.length, "registered"], ["On a trip", onTrip, "sharing location allowed"], ["Live now", live, `reported in the last ${LIVE_MIN} min`],
        ["Positions", pings, "on active trips"], ["Last position", lastAny ? since(lastAny) : "–", lastAny ? when(lastAny) : "no positions yet"]].map(([l, val, s], i) =>
        <div key={l} className={"gp-kpi" + (i === 2 && live ? " live" : "")} style={{ "--d": `${i * 70}ms` }}><span>{i === 2 && live ? <><i className="gp-pulse" />{l}</> : l}</span><b><Count value={val} /></b><em>{s}</em></div>)}
    </div>

    <ol className="gp-steps">
      {[[Truck, "Register the vehicle", "Registration, carrier and how it reports"], [Play, "Start a trip", "Pick the open PO lines it carries"],
        [Smartphone, "Driver shares location", "Opens the link on the phone and taps start"], [MapPinned, "Follow it live", "Shown as Live on the Network Tracker"]].map(([I, b, s], i) =>
        <li key={b}><span className="gp-n">{i + 1}</span><I size={17} /><div><b>{b}</b><em>{s}</em></div></li>)}
    </ol>

    {secret && <Secret s={secret} onClose={() => setSecret(null)} copy={copy} />}
    {msg && <div className="gp-msg">{msg}</div>}

    <div className="gp-grid">
      <section className="card gp-list">
        <header className="gp-h"><h3>Vehicles</h3><button className="primary chip-btn" onClick={() => setAdding(a => !a)}>{adding ? <><X size={13} /> Cancel</> : <><Plus size={13} /> Register vehicle</>}</button></header>
        {adding && <div className="gp-form">
          <label>Type<select value={form.kind} onChange={e => setForm({ ...form, kind: e.target.value })}><option value="TRUCK">Truck</option><option value="VESSEL">Vessel</option></select></label>
          <label>Registration / IMO<input value={form.registration} onChange={e => setForm({ ...form, registration: e.target.value })} placeholder="TN-09-AB-1234" autoFocus /></label>
          <label>Carrier<input value={form.carrier} onChange={e => setForm({ ...form, carrier: e.target.value })} placeholder="Transporter name" /></label>
          <label>Reports by<select value={form.device_type} onChange={e => setForm({ ...form, device_type: e.target.value })}>
            <option value="PHONE">Driver's phone</option><option value="TELEMATICS">Telematics device</option><option value="AIS">Ship AIS</option><option value="SIMULATOR">Simulator (demo)</option></select></label>
          <button className="primary" disabled={form.registration.trim().length < 3} onClick={register}>Register</button>
        </div>}
        {v.err ? <div className="err">{v.err}</div> : v.loading ? <div className="skeleton" style={{ height: 160 }} /> : !list.length
          ? <div className="gp-empty"><Truck size={22} /><b>No vehicles yet</b><span>Register the first truck to get its driver link.</span></div>
          : <ul className="gp-vlist">{list.map(x => <li key={x.vehicle_id}>
            <button className={"gp-v" + (cur?.vehicle_id === x.vehicle_id ? " on" : "")} onClick={() => setSel(x.vehicle_id)} style={{ opacity: x.active ? 1 : 0.55 }}>
              <span className={"gp-dot " + (isLive(x) ? "live" : x.trip_id ? "trip" : "idle")} />
              <span className="gp-vt"><b>{x.registration}</b><em>{x.vehicle_id} · {x.kind === "VESSEL" ? "vessel" : "truck"}{x.carrier ? ` · ${x.carrier}` : ""}</em></span>
              <span className="gp-vs">{isLive(x) ? "Live" : x.trip_id ? `On trip · ${ago(x.last_ping)}` : "Idle"}</span>
            </button></li>)}</ul>}
      </section>

      <section className="card gp-detail">
        {!cur ? <div className="gp-empty"><MapPinned size={22} /><b>Select a vehicle</b><span>Its trip, positions and actions appear here.</span></div> : <>
          <header className="gp-h">
            <div><h3>{cur.registration}</h3><span className="muted">{cur.vehicle_id} · {cur.kind === "VESSEL" ? "Vessel" : "Truck"} · reports by {{ PHONE: "driver's phone", TELEMATICS: "telematics", AIS: "AIS", SIMULATOR: "simulator (demo)" }[cur.device_type] || cur.device_type}{cur.carrier ? ` · ${cur.carrier}` : ""}</span></div>
            <span className={"gp-badge " + (isLive(cur) ? "live" : cur.trip_id ? "trip" : "idle")}>{isLive(cur) ? "Live" : cur.trip_id ? "On trip" : "Idle"}</span>
          </header>
          <div className="gp-acts">
            {cur.active && !cur.trip_id && <button className="primary chip-btn" onClick={() => setPicking(p => !p)}><Play size={12} /> Start trip</button>}
            {cur.trip_id && <button className="ghost chip-btn" onClick={() => run(api.endTrip(cur.vehicle_id), "Trip ended.")}><Square size={12} /> End trip</button>}
            <button className="ghost chip-btn" title="Issue a new driver link; the old one stops working" onClick={async () => { const r = await run(api.rotateVehicleKey(cur.vehicle_id), "New driver link issued."); if (r) setSecret(r); }}><RotateCw size={12} /> New driver link</button>
            <button className="ghost chip-btn" onClick={() => nav("tracker")}><Navigation size={12} /> Open Network Tracker</button>
          </div>

          {picking && <div className="gp-pick">
            <div className="gp-pick-h"><b>Which open PO lines is {cur.registration} carrying?</b><span>{pick.length} selected</span></div>
            <label className="gp-search"><Search size={13} /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Search PO line, supplier or material" /></label>
            <div className="gp-lines">{open.loading ? <div className="skeleton" style={{ height: 120 }} /> : lines.map(x => {
              const on = pick.includes(x.id);
              return <label key={x.id} className={"gp-line" + (on ? " on" : "")}>
                <input type="checkbox" checked={on} onChange={() => setPick(p => (on ? p.filter(y => y !== x.id) : [...p, x.id]))} />
                <b>{x.id}</b><span>{x.supplier_name} · {x.material_name}</span><em>due {x.promised_date}</em></label>; })}
              {!open.loading && !lines.length && <div className="muted">No open PO lines match.</div>}</div>
            <div className="gp-acts"><button className="primary chip-btn" disabled={!pick.length} onClick={startTrip}><Play size={12} /> Start trip with {pick.length || "no"} line{pick.length === 1 ? "" : "s"}</button>
              <button className="ghost chip-btn" onClick={() => setPicking(false)}>Cancel</button></div>
          </div>}

          <div className="gp-mapwrap">
            <Suspense fallback={<div className="skeleton" style={{ height: "100%" }} />}><GpsLiveMap track={t} live={isLive(cur)} /></Suspense>
            {lastP && <div className={"gp-live-chip" + (isLive(cur) ? " on" : "")}><i />{isLive(cur) ? "Live" : "Last seen"} · updated {since(lastP.ts)}</div>}
            {prog && <div className="gp-prog">
              <div className="gp-prog-h"><span>{t.route.origin?.name}</span><b>{fmt(prog.pct, 0)}% of the way</b><span>{t.route.dest?.name}</span></div>
              <div className="gp-bar"><i style={{ width: `${prog.pct}%` }} /><em style={{ left: `${prog.pct}%` }}><Truck size={11} /></em></div>
            </div>}
          </div>
          <div className="gp-stats">
            <div><Gauge size={16} /><span>Speed</span><b>{avgSpd != null ? <><Count value={avgSpd} /> <small>km/h</small></> : "–"}</b></div>
            <div><Route size={16} /><span>Driven (latest)</span><b>{pts.length > 1 ? <><Count value={driven} digits={1} /> <small>km</small></> : "–"}</b></div>
            <div><MapPinned size={16} /><span>Left to plant</span><b>{prog ? <><Count value={prog.left} /> <small>km</small></> : "–"}</b></div>
            <div><Clock size={16} /><span>Arrival estimate</span><b>{eta ? eta.toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "–"}</b></div>
          </div>
          <div className="gp-two">
            <div>
              <h4><Package size={14} /> {t?.trip ? (t.trip.ended_at ? `Cargo on trip #${t.trip.trip_id} (ended)` : `Cargo on trip #${t.trip.trip_id}`) : "Cargo"}</h4>
              {!t?.trip ? <div className="gp-empty sm"><span>No trip yet. Start one to let the driver share location.</span></div>
                : <ul className="gp-tlines">{t.lines.map(l => <li key={`${l.po_id}-${l.po_line}`}><b>{l.po_id}-{l.po_line}</b><span>{l.supplier_name} · {l.material_name}</span><em>{l.plant_id} · due {l.promised_date} · {fmt(l.ordered_qty, 0)} units</em></li>)}</ul>}
            </div>
            <div>
              <h4><Clock size={14} /> Recent updates</h4>
              {!pts.length ? <div className="gp-empty sm"><span>Waiting for the first position.</span></div>
                : <ol className="gp-feed">{pts.slice(-6).reverse().map((p, k, arr) => { const nxt = arr[k + 1];
                  return <li key={p.ts} style={{ "--d": `${k * 60}ms` }}><i className={k === 0 ? "now" : ""} /><b>{since(p.ts)}</b>
                    <span>{p.speed_kmh == null ? "position received" : `${fmt(p.speed_kmh, 0)} km/h`}{nxt ? ` · ${fmt(km([nxt.lat, nxt.lon], [p.lat, p.lon]), 1)} km since previous` : " · first in view"}</span></li>; })}</ol>}
            </div>
          </div>
        </>}
      </section>
    </div>
  </div>;
}
