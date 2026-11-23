import { useEffect, useState } from "react";
import { Database, RefreshCw, Trash2, TriangleAlert, X } from "lucide-react";
import { api } from "../api";
import { fmt, inr, pct, useLoad } from "../util";

/* Network twin T3 side panels. Every number shown here opens the records it is computed from (PO lines, goods receipts,
   inspections, NCRs, downtime) via the same endpoints the KPI layer uses. */

const cell = v => (typeof v === "boolean" ? (v ? "✓" : "✗") : v === null || v === undefined ? "–" : typeof v === "object" ? JSON.stringify(v) : String(v));
const ago = iso => { if (!iso) return "never"; const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000); return m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`; };

function Table({ rows }) {
  if (!rows?.length) return <div className="muted">No rows.</div>;
  const cols = Object.keys(rows[0]);
  return (
    <div className="tbl-wrap ev-table"><table className="tbl">
      <thead><tr>{cols.map(c => <th key={c}>{c.replaceAll("_", " ")}</th>)}</tr></thead>
      <tbody>{rows.slice(0, 300).map((r, i) => <tr key={i}>{cols.map(c => <td key={c}>{cell(r[c])}</td>)}</tr>)}</tbody>
    </table></div>
  );
}
const csv = (name, rows) => {
  if (!rows?.length) return;
  const cols = Object.keys(rows[0]), esc = v => `"${cell(v).replaceAll('"', '""')}"`;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([[cols.join(","), ...rows.map(r => cols.map(c => esc(r[c])).join(","))].join("\n")], { type: "text/csv" }));
  a.download = `${name}.csv`; a.click();
};

// Generic "source records" modal: request = { title, sub, load: () => Promise<[{title, rows, note}]> }
export function RecordsModal({ request, onClose }) {
  const [state, setState] = useState({ loading: true });
  useEffect(() => {
    let live = true;
    request.load().then(sections => live && setState({ sections })).catch(e => live && setState({ err: e.message }));
    return () => { live = false; };
  }, [request]);
  return (
    <div className="twp-scrim" role="dialog" aria-modal="true" aria-label={request.title} onClick={onClose}>
      <div className="card twp-modal" onClick={e => e.stopPropagation()}>
        <h3 style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><span><Database size={15} /> {request.title}</span>
          <button className="ghost icon-btn" onClick={onClose} aria-label="Close"><X size={15} /></button></h3>
        {request.sub && <div className="ev-def">{request.sub}</div>}
        {state.loading && !state.sections && !state.err && <div className="skeleton" style={{ height: 160 }} />}
        {state.err && <div className="err">{state.err}</div>}
        {state.sections?.map((s, i) => (
          <div key={i} className="twp-sec">
            <div className="row-flex" style={{ justifyContent: "space-between" }}><b>{s.title}</b>
              {s.rows?.length > 0 && <button className="ghost chip-btn" onClick={() => csv(s.title.replace(/\W+/g, "_"), s.rows)}>CSV</button>}</div>
            {s.note && <div className="ev-def">{s.note}</div>}
            <Table rows={s.rows} />
          </div>))}
      </div>
    </div>
  );
}

// Loaders used by the tracker page
export const shipmentSourceRequest = (s) => ({
  title: `Source records · ${s.po_id} line ${s.id.split("-").pop()}`,
  sub: "The PO line exactly as the KPI views see it, with its ERP record, goods receipts, invoices, logistics milestones and GPS trip.",
  load: async () => {
    const d = await api.shipmentSource(s.po_id, s.id.split("-").pop());
    return [
      { title: "PO line (sp.v_po_delivery - used by every KPI)", rows: [d.po_line] },
      { title: "ERP record (sp.fact_purchase_order_receipt)", rows: d.erp_record ? [d.erp_record] : [] },
      { title: "Goods receipts (sp.fact_grn)", rows: d.grn, note: d.grn_note },
      { title: "Invoices (sp.fact_invoice)", rows: d.invoices, note: d.invoices.length ? null : "No invoice extract loaded." },
      { title: "Logistics milestones (sp.fact_inbound_milestone)", rows: d.milestones, note: d.milestones.length ? null : "No milestones: the position is estimated." },
      { title: "GPS trips (public.gps_pings)", rows: d.gps_trips, note: d.gps_trips.length ? null : "No GPS trip assigned to this shipment." },
    ];
  },
});
export const laneRecordsRequest = (lane) => ({
  title: `Lane records · ${lane.supplier_id} → ${lane.plant_id}`,
  sub: `${lane.mode} · ${fmt(lane.distance_km, 0)} km · route ${lane.route_quality || "assumed"}`,
  load: async () => { const d = await api.laneRecords(lane.supplier_id, lane.plant_id); return [{ title: `${d.row_count} PO lines · on-time ${d.on_time_pct ?? "–"}%`, note: d.definition, rows: d.rows }]; },
});
export const evidenceRequest = (sid, metric, label) => ({
  title: `${label} · ${sid}`, sub: "Rows behind the scorecard figure (same definition and config version as the KPI layer).",
  load: async () => { const d = await api.evidence(sid, metric); return [{ title: `${d.row_count} rows`, note: `${d.definition} · as of ${d.as_of_date} · definitions v${d.config_version}`, rows: d.rows }]; },
});

// Supplier side panel (flag twin_side_panel)
export function SupplierDetail({ sid, sc, data, day, alerts, openRecords, onPickShipment }) {
  const [tab, setTab] = useState("score");
  const pos = useLoad(() => api.poLines({ supplier_id: sid, limit: 500 }), [sid]);
  const acts = useLoad(() => api.actions({ supplier_id: sid }).catch(() => []), [sid]);
  const open = (pos.data || []).filter(r => r.delivery_status !== "RECEIVED");
  const moving = data.shipments.filter(s => s.supplier_id === sid && day >= s.t_depart && day < s.t_eta).sort((a, b) => a.t_eta - b.t_eta);
  const openActs = (acts.data || []).filter(a => !["CLOSED", "REJECTED"].includes(a.status));
  const SRC = (metric, label) => <button className="twp-src" onClick={() => openRecords(evidenceRequest(sid, metric, label))} title="View source records"><Database size={11} /></button>;
  return (
    <div className="twp-detail">
      <div className="nt-p-tabs">{[["score", "Scorecard"], ["pos", `Open POs ${open.length}`], ["moving", `In transit ${moving.length}`], ["alerts", `Alerts ${alerts.length}`], ["acts", `Actions ${openActs.length}`]].map(([k, l]) => (
        <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{l}</button>))}</div>
      {tab === "score" && sc && <div className="twp-grid">
        {[["OTIF", pct(sc.otif_pct), "otif"], ["Incoming PPM", fmt(sc.incoming_ppm, 0), "ppm"], ["Lead-time var.", `${fmt(sc.avg_lead_time_variance_days)} wd`, "lead_time"],
          ["Overdue CAPA", fmt(sc.overdue_capa), "ncr"], ["Price var.", pct(sc.price_variance_pct), "price"], ["Disruption", `${fmt(sc.disruption_hours)} h`, "disruption"]].map(([l, v, m]) => (
          <div key={l}><span>{l}</span><b>{v}</b>{SRC(m, l)}</div>))}
        <div className="twp-wide muted">Grade {sc.grade} · composite {fmt(sc.composite_score)} · risk {fmt(sc.risk_score, 0)}/100 · {sc.ppm_method === "INCOMING_INSPECTION" ? "PPM from incoming inspection" : "PPM = genealogy estimate"} · run {String(sc.run_id || "").slice(0, 8)}</div>
      </div>}
      {tab === "pos" && <div className="nt-drill-list">{open.length === 0 ? <div className="muted">No open PO lines.</div> : open.slice(0, 40).map(r => (
        <button key={`${r.po_id}-${r.po_line}`} className="nt-row" onClick={() => openRecords(shipmentSourceRequest({ id: `${r.po_id}-${r.po_line}`, po_id: r.po_id }))}>
          <span className="grow ellipsis"><b>{r.po_id}/{r.po_line}</b> · {r.material_id} · {fmt(r.ordered_qty, 0)}</span>
          <span className={r.delivery_status === "PAST_DUE" ? "delta bad" : "muted"}>{r.delivery_status === "PAST_DUE" ? "past due" : r.promised_date}</span><Database size={11} /></button>))}</div>}
      {tab === "moving" && <div className="nt-drill-list">{moving.length === 0 ? <div className="muted">Nothing in transit at this time.</div> : moving.slice(0, 40).map(s => (
        <button key={s.id} className="nt-row" onClick={() => onPickShipment(s.id)}>
          <span className="grow ellipsis"><b>{s.po_id}</b> · {data.materials[s.material_id]}</span>
          <span className="muted">{s.pos_source === "LIVE" ? "GPS" : s.pos_source === "MILESTONE" ? "milestone" : "est."}</span></button>))}</div>}
      {tab === "alerts" && <div className="nt-drill-list">{alerts.length === 0 ? <div className="muted">No active alerts.</div> : alerts.map(a => (
        <div key={a.id} className="nt-row" style={{ display: "block" }}><span className={`pill sev-${a.severity}`}>{a.severity}</span> <b>{a.title}</b><div className="muted">{a.detail}</div></div>))}</div>}
      {tab === "acts" && <div className="nt-drill-list">{openActs.length === 0 ? <div className="muted">No open corrective actions.</div> : openActs.map(a => (
        <div key={a.id} className="nt-row" style={{ display: "block" }}><span className="pill st">{a.status.replace("_", " ")}</span> <b>#{a.id} {a.title}</b><div className="muted">owner {a.owner_role} · due {a.due_date}</div></div>))}</div>}
    </div>
  );
}

// Disruption feeds (flag twin_disruptions): source + refresh time always visible
export function DisruptionFeed({ feed, reload, canManage, isAdmin }) {
  const [form, setForm] = useState(null), [msg, setMsg] = useState("");
  const f = feed.data;
  const run = async (p, ok) => { setMsg(""); try { await p; setMsg(ok); reload(); } catch (e) { setMsg(e.message); } };
  return (
    <section className="nt-panel">
      <h4><TriangleAlert size={13} /> Disruption feeds <span className="nt-tag">{f?.events.length ?? "…"} active</span></h4>
      {f && <div className="twp-provs">{f.providers.map(p => <div key={p.provider}><b>{p.label}</b><span>{p.last_event_at ? `events ${ago(p.last_event_at)}` : "no events"}</span></div>)}</div>}
      {f?.last_refresh && <div className="muted" style={{ fontSize: 11 }}>Last refresh {ago(f.last_refresh.at)} · {f.last_refresh.status}</div>}
      <div className="nt-drill-list" style={{ marginTop: 6 }}>{(f?.events || []).slice(0, 25).map(e => (
        <div key={e.id} className="nt-row" style={{ display: "block" }}>
          <span className={`pill sev-${e.severity}`}>{e.severity}</span> <b>{e.type}</b> · {e.title}
          <div className="muted" style={{ fontSize: 11 }}>{e.provider} · refreshed {ago(e.fetched_at)}{e.lanes?.length ? ` · ${e.lanes.length} lane(s) affected` : ""}{e.nodes?.length ? ` · near ${e.nodes.join(", ")}` : ""}
            {e.url && <> · <a href={e.url} target="_blank" rel="noreferrer">source</a></>}
            {canManage && e.provider === "MANUAL" && <button className="ghost chip-btn" style={{ marginLeft: 6 }} onClick={() => run(api.removeDisruption(e.id), "Removed.")}><Trash2 size={11} /></button>}</div>
        </div>))}</div>
      <div className="row-flex" style={{ marginTop: 8, flexWrap: "wrap", gap: 6 }}>
        {isAdmin && <button className="ghost chip-btn" onClick={() => run(api.refreshDisruptions(), "Feeds refreshed.")}><RefreshCw size={12} /> Refresh feeds</button>}
        {canManage && <button className="ghost chip-btn" onClick={() => setForm(form ? null : { type: "Strike", severity: "MEDIUM", title: "", lat: 13.1, lon: 80.3, radius_km: 50 })}>+ Manual event</button>}
      </div>
      {form && <div className="twp-form">
        <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>{["Strike", "Port congestion", "Road closure", "Customs delay", "Other"].map(t => <option key={t}>{t}</option>)}</select>
        <select value={form.severity} onChange={e => setForm({ ...form, severity: e.target.value })}>{["LOW", "MEDIUM", "HIGH", "CRITICAL"].map(t => <option key={t}>{t}</option>)}</select>
        <input placeholder="Description (source / reference)" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
        <input type="number" step="0.01" value={form.lat} onChange={e => setForm({ ...form, lat: Number(e.target.value) })} aria-label="Latitude" />
        <input type="number" step="0.01" value={form.lon} onChange={e => setForm({ ...form, lon: Number(e.target.value) })} aria-label="Longitude" />
        <input type="number" value={form.radius_km} onChange={e => setForm({ ...form, radius_km: Number(e.target.value) })} aria-label="Radius km" />
        <button className="primary chip-btn" disabled={form.title.length < 5} onClick={() => run(api.addDisruption(form), "Event added.").then(() => setForm(null))}>Add</button>
      </div>}
      {msg && <div className="muted" style={{ marginTop: 6 }}>{msg}</div>}
    </section>
  );
}

// Twin filters + saved views (flag twin_filters)
export const EMPTY_TF = { supplier: "", plant: "", category: "", risk: "", mode: "", from: "", to: "" };
export function TwinFilterBar({ value, onChange, suppliers, categories, extraState, onApplyView }) {
  const views = useLoad(() => api.savedViews("tracker").catch(() => []), []);
  const [name, setName] = useState("");
  const set = (k, v) => onChange({ ...value, [k]: v });
  const active = Object.values(value).filter(Boolean).length;
  const save = async () => { if (name.trim().length < 2) return; await api.saveView({ page: "tracker", name: name.trim(), payload: { filters: value, ...extraState } }); setName(""); views.reload(); };
  return (
    <div className="twp-filters" role="search" aria-label="Twin filters">
      <select value={value.supplier} onChange={e => set("supplier", e.target.value)} aria-label="Supplier"><option value="">All suppliers</option>{suppliers.map(s => <option key={s.id} value={s.id}>{s.id} · {s.name}</option>)}</select>
      <select value={value.plant} onChange={e => set("plant", e.target.value)} aria-label="Plant"><option value="">All plants</option><option value="IN-TN-01">Chennai</option><option value="IN-KA-01">Bengaluru</option></select>
      <select value={value.category} onChange={e => set("category", e.target.value)} aria-label="Material group"><option value="">All material groups</option>{categories.map(c => <option key={c}>{c}</option>)}</select>
      <select value={value.risk} onChange={e => set("risk", e.target.value)} aria-label="Risk level"><option value="">All risk levels</option><option value="HEALTHY">Healthy</option><option value="WATCH">Watch</option><option value="RISK">At risk</option></select>
      <select value={value.mode} onChange={e => set("mode", e.target.value)} aria-label="Transport mode"><option value="">All modes</option><option value="SEA">Sea</option><option value="ROAD">Road</option></select>
      <label className="twp-date">ETA from<input type="date" value={value.from} onChange={e => set("from", e.target.value)} /></label>
      <label className="twp-date">to<input type="date" value={value.to} onChange={e => set("to", e.target.value)} /></label>
      {active > 0 && <button className="ghost chip-btn" onClick={() => onChange(EMPTY_TF)}>Clear ({active})</button>}
      <span className="twp-sep" />
      <select value="" onChange={e => { const v = (views.data || []).find(x => String(x.id) === e.target.value); if (v) onApplyView(v.payload); }} aria-label="Saved views">
        <option value="">Saved views ({(views.data || []).length})</option>
        {(views.data || []).map(v => <option key={v.id} value={v.id}>{v.name}{v.shared ? " (shared)" : ""}</option>)}</select>
      <input className="twp-name" placeholder="Save view as…" value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === "Enter" && save()} />
      <button className="ghost chip-btn" disabled={name.trim().length < 2} onClick={save}>Save</button>
      {(views.data || []).length > 0 && <select value="" onChange={e => e.target.value && api.deleteView(e.target.value).then(views.reload)} aria-label="Delete a saved view">
        <option value="">Delete…</option>{(views.data || []).map(v => <option key={v.id} value={v.id}>{v.name}</option>)}</select>}
    </div>
  );
}

export { ago, inr };
