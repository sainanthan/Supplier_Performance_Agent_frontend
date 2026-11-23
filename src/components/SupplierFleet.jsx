// Supplier portal: report vehicles and GPS positions by hand. One form dispatches open PO lines on a truck / vessel
// (registering it on the fly) with an optional first position; each vehicle on the road then takes quick position
// updates (pick a place, use this device's location, or type lat/lon) and an "Arrived" click. Positions appear on the
// customer's network map as LIVE, labelled as reported by the supplier.
import { useMemo, useState } from "react";
import { CheckCircle2, Crosshair, MapPin, Navigation, PackageCheck, Plus, Send, Ship, Truck } from "lucide-react";
import { api } from "../api";
import { Card, Empty } from "./ui";
import { fmt, useLoad } from "../util";

const nowLocal = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
const ago = ts => { if (!ts) return "never"; const m = (Date.now() - new Date(ts)) / 60000; return m < 1 ? "just now" : m < 60 ? `${Math.round(m)} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`; };
const EMPTY_POS = { place: "", lat: "", lon: "", speed: "", note: "" };

// place pick + "use my location" + lat/lon + note: shared by the dispatch form and each vehicle's update row
function PositionFields({ pos, set, places, compact }) {
  const [busy, setBusy] = useState(false), [gErr, setGErr] = useState("");
  const pick = name => { const p = places.find(x => x.name === name); set({ ...pos, place: name, lat: p ? p.lat : pos.lat, lon: p ? p.lon : pos.lon, note: p ? name : pos.note }); };
  const locate = () => {
    if (!navigator.geolocation) { setGErr("This browser cannot share its location"); return; }
    setBusy(true); setGErr("");
    navigator.geolocation.getCurrentPosition(
      g => { setBusy(false); set({ ...pos, place: "", lat: +g.coords.latitude.toFixed(5), lon: +g.coords.longitude.toFixed(5),
        speed: g.coords.speed != null ? Math.round(g.coords.speed * 3.6) : pos.speed, note: pos.note || "Device location" }); },
      e => { setBusy(false); setGErr(e.code === 1 ? "Location permission denied" : "Could not get the location"); },
      { enableHighAccuracy: true, timeout: 10000 });
  };
  return <div className={"fl-pos" + (compact ? " compact" : "")}>
    <label className="fl-f wide">Where is it now?
      <div className="fl-row">
        <select value={pos.place} onChange={e => pick(e.target.value)} aria-label="Pick a known place">
          <option value="">Pick a place…</option>{places.map(p => <option key={p.name}>{p.name}</option>)}
        </select>
        <button type="button" className="ghost chip-btn" onClick={locate} disabled={busy}><Crosshair size={12} /> {busy ? "Locating…" : "Use my location"}</button>
      </div>
    </label>
    <label className="fl-f">Latitude<input inputMode="decimal" placeholder="12.7400" value={pos.lat} onChange={e => set({ ...pos, place: "", lat: e.target.value })} /></label>
    <label className="fl-f">Longitude<input inputMode="decimal" placeholder="77.8300" value={pos.lon} onChange={e => set({ ...pos, place: "", lon: e.target.value })} /></label>
    <label className="fl-f sm">Speed km/h<input inputMode="numeric" placeholder="opt." value={pos.speed} onChange={e => set({ ...pos, speed: e.target.value })} /></label>
    <label className="fl-f wide">Note<input placeholder="e.g. Krishnagiri toll, customs cleared" maxLength={200} value={pos.note} onChange={e => set({ ...pos, note: e.target.value })} /></label>
    {gErr && <span className="fl-err">{gErr}</span>}
  </div>;
}

const posBody = (p, ts) => {
  const lat = parseFloat(p.lat), lon = parseFloat(p.lon);
  if (isNaN(lat) || isNaN(lon)) return null;
  return { lat, lon, ts: ts ? new Date(ts).toISOString() : null, speed_kmh: p.speed === "" ? null : Number(p.speed), note: p.note || null };
};

// "lat, lon[, time][, note]" per line -> positions (for drivers who send several positions at once by message)
function parseBulk(txt) {
  return txt.split("\n").map(l => l.trim()).filter(Boolean).map(l => {
    const [la, lo, a, ...rest] = l.split(/\s*[,;\t]\s*/);
    const t = a && !isNaN(Date.parse(a)) ? new Date(a).toISOString() : null;
    return { lat: parseFloat(la), lon: parseFloat(lo), ts: t, note: (t ? rest : [a, ...rest]).filter(Boolean).join(", ") || null };
  }).filter(p => !isNaN(p.lat) && !isNaN(p.lon));
}

function VehicleCard({ v, places, onDone }) {
  const [pos, setPos] = useState(EMPTY_POS), [ts, setTs] = useState(""), [bulk, setBulk] = useState("");
  const [busy, setBusy] = useState(false), [msg, setMsg] = useState(""), [err, setErr] = useState("");
  const act = async (fn, ok) => { setBusy(true); setErr(""); setMsg(""); try { const r = await fn(); setMsg(typeof ok === "function" ? ok(r) : ok); onDone(); } catch (e) { setErr(e.message); } finally { setBusy(false); } };
  const send = () => { const b = posBody(pos, ts); if (!b) { setErr("Enter latitude and longitude, pick a place, or use your location"); return; }
    act(() => api.fleetPositions(v.vehicle_id, { positions: [b] }), r => r.accepted ? "Position sent" : `Not accepted: ${r.reasons.join("; ")}`).then(() => { setPos(EMPTY_POS); setTs(""); }); };
  const sendBulk = () => { const ps = parseBulk(bulk); if (!ps.length) { setErr("No valid lines. Use: lat, lon, time, note"); return; }
    act(() => api.fleetPositions(v.vehicle_id, { positions: ps }), r => `${r.accepted} position(s) accepted${r.rejected ? `, ${r.rejected} rejected (${r.reasons.join("; ")})` : ""}`).then(() => setBulk("")); };
  const lp = v.last_position, Icon = v.kind === "VESSEL" ? Ship : Truck;
  return <div className="fl-veh">
    <div className="fl-veh-h">
      <span className="fl-veh-ic"><Icon size={16} /></span>
      <div className="fl-veh-t"><b>{v.registration}</b><span>{[v.carrier, v.driver_name, v.driver_phone].filter(Boolean).join(" · ") || v.kind.toLowerCase()}</span></div>
      {v.trip_id ? <span className="pill sev-LOW">on the road · {v.shipment_ids?.length} PO line{v.shipment_ids?.length === 1 ? "" : "s"}</span> : <span className="pill st">idle</span>}
    </div>
    {v.trip_id && <>
      <div className="fl-last"><MapPin size={13} />{lp ? <span><b>{lp.note || `${fmt(lp.lat, 4)}, ${fmt(lp.lon, 4)}`}</b> · {ago(lp.ts)}{lp.speed_kmh != null ? ` · ${fmt(lp.speed_kmh, 0)} km/h` : ""} · {v.pings} position{v.pings === 1 ? "" : "s"} reported</span>
        : <span className="muted">No position yet: send the first one below.</span>}</div>
      <div className="fl-lines">{(v.shipment_ids || []).map(s => <code key={s}>{s.replace(/-(\d+)$/, "/$1")}</code>)}</div>
      <PositionFields pos={pos} set={setPos} places={places} compact />
      <div className="fl-actions">
        <label className="fl-f sm">Time (if not now)<input type="datetime-local" value={ts} max={nowLocal()} onChange={e => setTs(e.target.value)} /></label>
        <button className="primary chip-btn" onClick={send} disabled={busy}><Send size={12} /> Send position</button>
        <button className="ghost chip-btn" onClick={() => confirm(`Mark ${v.registration} as arrived? Tracking for this trip stops.`) && act(() => api.fleetArrived(v.vehicle_id), "Marked as arrived")} disabled={busy}><PackageCheck size={12} /> Arrived</button>
      </div>
      <details className="fl-bulk"><summary>Paste several positions at once</summary>
        <textarea rows={3} value={bulk} onChange={e => setBulk(e.target.value)} placeholder={"One per line: lat, lon, time, note\n12.80, 78.40, 2026-11-18 09:30, Krishnagiri toll\n12.93, 79.13, 2026-11-18 12:10, Vellore bypass"} />
        <button className="ghost chip-btn" onClick={sendBulk} disabled={busy || !bulk.trim()}><Send size={12} /> Send {parseBulk(bulk).length || ""} positions</button>
      </details>
    </>}
    {msg && <div className="fl-ok"><CheckCircle2 size={13} /> {msg}</div>}
    {err && <div className="fl-err">{err}</div>}
  </div>;
}

export default function SupplierFleet() {
  const f = useLoad(() => api.fleet(), []);
  const d = f.data, vehicles = d?.vehicles || [], lines = d?.open_lines || [], places = d?.places || [];
  const [vid, setVid] = useState(""), [nv, setNv] = useState({ kind: "TRUCK", registration: "", carrier: "", driver_name: "", driver_phone: "" });
  const [sel, setSel] = useState([]), [q, setQ] = useState(""), [dep, setDep] = useState(nowLocal()), [pos, setPos] = useState(EMPTY_POS);
  const [busy, setBusy] = useState(false), [msg, setMsg] = useState(""), [err, setErr] = useState("");
  const isNew = !vid;
  const shown = useMemo(() => { const k = q.trim().toLowerCase(); return lines.filter(l => !k || `${l.po_id}/${l.po_line} ${l.material_name} ${l.plant_id}`.toLowerCase().includes(k)); }, [lines, q]);
  const toggle = id => setSel(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
  const canGo = sel.length && (!isNew || nv.registration.trim().length >= 3);

  const dispatch = async () => {
    setErr(""); setMsg("");
    const p = pos.lat !== "" || pos.lon !== "" ? posBody(pos, null) : null;
    if ((pos.lat !== "" || pos.lon !== "") && !p) { setErr("Latitude / longitude must be numbers"); return; }
    setBusy(true);
    try {
      const r = await api.fleetDispatch({ vehicle_id: vid || null, vehicle: isNew ? nv : null, shipment_ids: sel,
        departed_at: dep ? new Date(dep).toISOString() : null, position: p });
      setMsg(`Dispatched ${sel.length} PO line${sel.length > 1 ? "s" : ""} on ${isNew ? nv.registration.toUpperCase() : vehicles.find(v => v.vehicle_id === vid)?.registration}${r.position?.accepted ? " with its first position" : ""}. Your customer now sees it live on their map.`);
      setSel([]); setPos(EMPTY_POS); setNv({ ...nv, registration: "", driver_name: "", driver_phone: "" }); setVid(""); setDep(nowLocal());
      f.reload();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  if (f.err) return <Card title="Vehicles & GPS" icon={Navigation}><div className="err">{f.err}</div></Card>;
  const onRoad = vehicles.filter(v => v.trip_id);
  return <>
    <Card title="Dispatch a shipment" icon={Navigation} sub="Tell your customer which vehicle carries which PO lines, and where it is. Takes under a minute.">
      <div className="fl-form">
        <div className="fl-step"><span>1</span><b>Vehicle</b></div>
        <div className="fl-grid">
          <label className="fl-f">Vehicle<select value={vid} onChange={e => setVid(e.target.value)}>
            <option value="">+ New vehicle</option>{vehicles.map(v => <option key={v.vehicle_id} value={v.vehicle_id}>{v.registration}{v.trip_id ? " (on the road)" : ""}</option>)}
          </select></label>
          {isNew && <>
            <div className="fl-f">Type<div className="seg fl-seg">{["TRUCK", "VESSEL"].map(k => <button key={k} type="button" className={nv.kind === k ? "on" : ""} onClick={() => setNv({ ...nv, kind: k })}>
              {k === "TRUCK" ? <Truck size={12} /> : <Ship size={12} />} {k === "TRUCK" ? "Truck" : "Vessel"}</button>)}</div></div>
            <label className="fl-f">{nv.kind === "TRUCK" ? "Registration no." : "Vessel name / IMO"} *<input value={nv.registration} placeholder={nv.kind === "TRUCK" ? "TN 70 AB 1234" : "MSC Aurora / 9876543"} onChange={e => setNv({ ...nv, registration: e.target.value })} /></label>
            <label className="fl-f">Carrier / transporter<input value={nv.carrier} placeholder="optional" onChange={e => setNv({ ...nv, carrier: e.target.value })} /></label>
            <label className="fl-f">Driver name<input value={nv.driver_name} placeholder="optional" onChange={e => setNv({ ...nv, driver_name: e.target.value })} /></label>
            <label className="fl-f">Driver phone<input value={nv.driver_phone} placeholder="optional" inputMode="tel" onChange={e => setNv({ ...nv, driver_phone: e.target.value.replace(/[^0-9 +()-]/g, "") })} /></label>
          </>}
          <label className="fl-f">Departed at<input type="datetime-local" value={dep} max={nowLocal()} onChange={e => setDep(e.target.value)} /></label>
        </div>

        <div className="fl-step"><span>2</span><b>PO lines on board</b><em>{sel.length} selected</em>
          <input className="fl-search" placeholder="Search PO, material, plant…" value={q} onChange={e => setQ(e.target.value)} /></div>
        {!lines.length ? <Empty icon={PackageCheck} title="No open PO lines to dispatch" /> :
          <div className="fl-pick">{shown.map(l => <label key={l.id} className={"fl-line" + (sel.includes(l.id) ? " on" : "")}>
            <input type="checkbox" checked={sel.includes(l.id)} onChange={() => toggle(l.id)} />
            <div><b>{l.po_id}/{l.po_line}</b><span>{l.material_name} · {fmt(l.ordered_qty, 0)} units → {l.plant_id}</span></div>
            <div className="fl-line-r"><span className={l.delivery_status === "PAST_DUE" ? "late" : ""}>due {l.promised_date}</span>
              {l.vehicle_id && <em>on {vehicles.find(v => v.vehicle_id === l.vehicle_id)?.registration || l.vehicle_id}</em>}</div>
          </label>)}</div>}

        <div className="fl-step"><span>3</span><b>Current position</b><em>optional, you can also send it later</em></div>
        <PositionFields pos={pos} set={setPos} places={places} />

        <div className="fl-submit">
          {err && <span className="fl-err">{err}</span>}
          {msg && <span className="fl-ok"><CheckCircle2 size={13} /> {msg}</span>}
          <button className="primary" onClick={dispatch} disabled={!canGo || busy}><Plus size={14} /> {busy ? "Saving…" : "Dispatch & start tracking"}</button>
        </div>
      </div>
    </Card>

    <Card title={`Vehicles on the road (${onRoad.length})`} icon={Truck} sub="Send a position whenever the driver calls in, or use your phone's location. Mark Arrived at our gate.">
      {!onRoad.length ? <Empty icon={Truck} title="No vehicles on the road">Dispatch a shipment above to start.</Empty> :
        <div className="fl-vehs">{onRoad.map(v => <VehicleCard key={v.vehicle_id} v={v} places={places} onDone={f.reload} />)}</div>}
    </Card>
  </>;
}
