import { useState } from "react";
import { Copy, MapPinned, Play, RotateCw, Square } from "lucide-react";
import { api } from "../api";
import { useLoad } from "../util";

// GPS tracking admin (flag gps_tracking): register trucks / vessels, hand the driver link (device key) to the driver or
// telematics integrator, and assign the PO-line shipments each trip carries.
const ago = iso => { if (!iso) return "never"; const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000); return m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`; };

export default function GpsAdmin({ canManage }) {
  const v = useLoad(() => api.vehicles().catch(e => { throw e; }), []);
  const [form, setForm] = useState({ kind: "TRUCK", registration: "", carrier: "", device_type: "PHONE" });
  const [secret, setSecret] = useState(null), [msg, setMsg] = useState("");
  const [trip, setTrip] = useState({ id: "", ids: "" });
  const run = async (p, ok) => { setMsg(""); try { const r = await p; if (ok) setMsg(ok); v.reload(); return r; } catch (e) { setMsg(e.message); return null; } };
  const create = async () => { const r = await run(api.createVehicle(form)); if (r) { setSecret(r); setForm({ ...form, registration: "" }); } };
  const copy = t => navigator.clipboard?.writeText(t).then(() => setMsg("Copied."), () => {});
  return (
    <div className="card" style={{ marginTop: 16 }}>
      <h3><MapPinned size={16} /> GPS tracking <span className="muted">vehicles, driver links and trips · positions accepted only during an active trip · kept for the configured retention period (default 90 days)</span></h3>
      <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
        Sources: <b>PHONE</b> (driver opens the tracker link; uses the phone's GPS with consent) · <b>TELEMATICS</b> (fleet box / provider webhook posts to
        <code> POST /api/gps/pings</code> with header <code>X-Device-Key</code>) · <b>AIS</b> (vessel integrator, same API) · <b>SIMULATOR</b> (demo; always labelled).
      </div>
      {canManage && <div className="form" style={{ gridTemplateColumns: "120px 1fr 1fr 140px auto", alignItems: "end" }}>
        <label>Kind<select value={form.kind} onChange={e => setForm({ ...form, kind: e.target.value })}><option>TRUCK</option><option>VESSEL</option></select></label>
        <label>Registration / IMO<input value={form.registration} onChange={e => setForm({ ...form, registration: e.target.value })} placeholder="TN-09-AB-1234" /></label>
        <label>Carrier<input value={form.carrier} onChange={e => setForm({ ...form, carrier: e.target.value })} /></label>
        <label>Device<select value={form.device_type} onChange={e => setForm({ ...form, device_type: e.target.value })}>{["PHONE", "TELEMATICS", "AIS", "SIMULATOR"].map(x => <option key={x}>{x}</option>)}</select></label>
        <button className="primary" disabled={form.registration.trim().length < 3} onClick={create}>Register</button>
      </div>}
      {secret && <div className="ok-note" style={{ margin: "10px 0" }}>
        <b>{secret.vehicle_id} registered.</b> Copy now - the device key is not shown again.
        <div className="row-flex" style={{ gap: 6, marginTop: 6, flexWrap: "wrap" }}>
          <code style={{ wordBreak: "break-all" }}>{secret.driver_link}</code>
          <button className="ghost chip-btn" onClick={() => copy(secret.driver_link)}><Copy size={12} /> Driver link</button>
          <button className="ghost chip-btn" onClick={() => copy(secret.device_key)}><Copy size={12} /> Device key</button>
          <button className="ghost chip-btn" onClick={() => setSecret(null)}>Done</button>
        </div>
        <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>Phones need an https address for location access (set PUBLIC_APP_URL to your https host).</div>
      </div>}
      {v.err && <div className="err">{v.err}</div>}
      <div className="tbl-wrap"><table className="tbl" style={{ marginTop: 10 }}>
        <thead><tr><th>Vehicle</th><th>Registration</th><th>Device</th><th>Active trip</th><th className="num">Pings</th><th>Last ping</th><th /></tr></thead>
        <tbody>{(v.data || []).map(x => (
          <tr key={x.vehicle_id} style={{ opacity: x.active ? 1 : 0.5 }}>
            <td><b>{x.vehicle_id}</b> <span className="muted">{x.kind.toLowerCase()}</span></td><td>{x.registration}<div className="muted">{x.carrier}</div></td>
            <td><span className={`pill ${x.device_type === "SIMULATOR" ? "sev-HIGH" : "st"}`}>{x.device_type}</span></td>
            <td>{x.trip_id ? <>#{x.trip_id} · {(x.shipment_ids || []).length} PO lines<div className="muted" style={{ fontSize: 11 }}>{(x.shipment_ids || []).slice(0, 3).join(", ")}{(x.shipment_ids || []).length > 3 ? "…" : ""}</div></> : <span className="muted">none</span>}</td>
            <td className="num">{x.pings || 0}</td><td>{ago(x.last_ping)}</td>
            <td>{canManage && x.active && <div className="row-flex" style={{ gap: 4 }}>
              <button className="ghost chip-btn" onClick={() => setTrip({ id: x.vehicle_id, ids: "" })}><Play size={11} /> Trip</button>
              {x.trip_id && <button className="ghost chip-btn" onClick={() => run(api.endTrip(x.vehicle_id), "Trip ended.")}><Square size={11} /> End</button>}
              <button className="ghost chip-btn" title="Issue a new device key (old one stops working)" onClick={async () => { const r = await run(api.rotateVehicleKey(x.vehicle_id)); if (r) setSecret({ vehicle_id: x.vehicle_id, ...r }); }}><RotateCw size={11} /></button>
            </div>}</td>
          </tr>))}
          {!(v.data || []).length && <tr><td colSpan={7} className="muted">No vehicles registered yet.</td></tr>}</tbody>
      </table></div>
      {trip.id && <div className="form" style={{ gridTemplateColumns: "1fr auto auto", alignItems: "end", marginTop: 10 }}>
        <label>Shipments on {trip.id} (PO-line ids, comma separated, e.g. POC-000412-1)<input value={trip.ids} onChange={e => setTrip({ ...trip, ids: e.target.value })} /></label>
        <button className="primary" disabled={!trip.ids.trim()} onClick={() => run(api.startTrip(trip.id, trip.ids.split(",").map(s => s.trim()).filter(Boolean)), "Trip started - the driver can now share location.").then(r => r && setTrip({ id: "", ids: "" }))}>Start trip</button>
        <button className="ghost" onClick={() => setTrip({ id: "", ids: "" })}>Cancel</button>
      </div>}
      {msg && <div className="muted" style={{ marginTop: 8 }}>{msg}</div>}
    </div>
  );
}
