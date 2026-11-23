import { useState } from "react";
import { ChevronDown, ChevronUp, Ship, Truck } from "lucide-react";

const ago = iso => { if (!iso) return "never"; const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000); return m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`; };

// Map legend: every visual encoding on the Network Tracker, one meaning per mark. With T3 risk encoding the thresholds
// shown are the APPROVED config values delivered with the data (health_bands, lane_at_risk_buffer_days).
export default function TrackerLegend({ v3 = false, riskEnc = false, bands = null, buffer = 2, feed = null, gps = false }) {
  const [open, setOpenState] = useState(() => { try { return localStorage.getItem("nt_legend") === "1"; } catch { return false; } });
  const setOpen = f => setOpenState(o => { const n = f(o); try { localStorage.setItem("nt_legend", n ? "1" : "0"); } catch { /* storage unavailable */ } return n; });
  return (
    <div className={`ntl ${open ? "" : "closed"}`} role="region" aria-label="Map legend">
      <button className="ntl-h" onClick={() => setOpen(o => !o)} aria-expanded={open}>Legend {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}</button>
      {open && <div className="ntl-b">
        {riskEnc ? <>
          <div className="nt-lg-sec">Supplier colour = health (risk score, approved bands)</div>
          <div className="nt-lg-row"><i className="dot" style={{ "--c": "var(--chart-c4)" }} />Healthy &lt; {bands?.watch ?? "–"}<i className="dot" style={{ "--c": "var(--brand-orange)" }} />Watch ≥ {bands?.watch ?? "–"}<i className="dot" style={{ "--c": "var(--depth-0)" }} />At risk ≥ {bands?.risk ?? "–"}</div>
          <div className="nt-lg-row">Marker size = disruption hours (NO_MATERIAL stoppage)</div>
        </> : <>
          <div className="nt-lg-sec">Supplier ring = health (risk score vs approved bands)</div>
          <div className="nt-lg-row"><i className="ring" style={{ "--c": "var(--chart-c4)" }} />Healthy<i className="ring" style={{ "--c": "var(--brand-orange)" }} />Watch<i className="ring" style={{ "--c": "var(--depth-0)" }} />At risk</div>
        </>}
        <div className="nt-lg-row"><i className="ring pulse" style={{ "--c": "var(--depth-0)" }} />Pulse = active HIGH / CRITICAL alert</div>
        {riskEnc ? <>
          <div className="nt-lg-sec">Route outline &amp; vehicles vs promise date</div>
          <div className="nt-lg-row"><i className="line solid" style={{ "--c": "var(--chart-c4)" }} />On time: ETA ≥ {buffer} d before promise</div>
          <div className="nt-lg-row"><i className="line solid" style={{ "--c": "var(--brand-orange)" }} />At risk: ETA within {buffer} d of, or after, promise</div>
          <div className="nt-lg-row"><i className="line thick" style={{ "--c": "var(--depth-0)" }} />Delayed: past the promise date, not received</div>
          <div className="nt-lg-row"><i className="line solid" style={{ "--c": "#ffffff" }} />White outline: nothing in transit on the route</div>
        </> : <>
          <div className="nt-lg-sec">Vehicles (status vs promise date)</div>
          <div className="nt-lg-row"><i className="dot" style={{ "--c": "var(--chart-c4)" }} />On track<i className="dot" style={{ "--c": "var(--depth-0)" }} />Late<i className="dot" style={{ "--c": "var(--brand-orange)" }} />Disrupted (scenario)</div>
        </>}
        <div className="nt-lg-row"><Ship size={13} /> vessel · <Truck size={13} /> truck run · <b className="nt-lg-n">5</b> = PO lines aboard</div>
        {v3 && <>
          <div className="nt-lg-sec">Position source (per vehicle)</div>
          <div className="nt-lg-row"><i className="ring" style={{ "--c": "var(--chart-c4)" }} />solid ring = Live (GPS{gps ? "" : " - tracking off"})</div>
          <div className="nt-lg-row"><i className="ring dash" style={{ "--c": "var(--chart-c4)" }} />dashed ring = Milestone-based · no ring = Estimated</div>
          <div className="nt-lg-row"><i className="dot big" style={{ "--c": "var(--depth-0)" }} />cluster: number = PO lines (zoom in to expand)</div>
        </>}
        {!riskEnc && <>
        </>}
        <div className="nt-lg-sec">Routes{v3 ? " (real roads via OSRM, real shipping lanes via searoute)" : ""}</div>
        <div className="nt-lg-row"><i className="line solid" style={{ "--c": "#1e88e5" }} />each supplier has its own route colour</div>
        <div className="nt-lg-row"><i className="line solid" style={{ "--c": "var(--text-primary)" }} />solid = road leg<i className="line dotted" style={{ "--c": "var(--text-primary)" }} />dotted = sea leg</div>
        <div className="nt-lg-row"><i className="dot" style={{ "--c": "#ffffff" }} />moving pulse = direction of flow, supplier → plant</div>
        <div className="nt-lg-row"><i className="line thick" style={{ "--c": "var(--depth-0)" }} />red outline = affected by a scenario / disruption</div>
        <div className="nt-lg-row">Click a port, supplier or vehicle to open its 3D digital twin</div>
        {feed && <>
          <div className="nt-lg-sec">Disruptions (circle = affected radius)</div>
          <div className="nt-lg-row"><i className="dot" style={{ "--c": "var(--depth-0)" }} />Critical<i className="dot" style={{ "--c": "var(--brand-orange)" }} />High<i className="dot" style={{ "--c": "var(--chart-c1)" }} />Medium<i className="dot" style={{ "--c": "var(--text-muted)" }} />Low</div>
          {feed.providers.map(p => <div key={p.provider} className="nt-lg-row nt-lg-src">{p.label} · {p.last_event_at ? `refreshed ${ago(p.last_event_at)}` : "no events"}</div>)}
        </>}
        <div className="nt-lg-foot">Click any mark for its records{v3 ? " · map © OpenFreeMap / OSM" : ""}</div>
      </div>}
    </div>
  );
}
