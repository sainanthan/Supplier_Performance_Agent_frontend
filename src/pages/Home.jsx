// Home: the whole platform on one screen, drawn as the data pipeline it really is (source systems -> integration ->
// GWC automated pipeline -> intelligence -> consumption). Every stage is clickable and opens its own detail page
// (#home/<stage>) with what it does, how it works, its LIVE status from the backend, and the actions you can take there.
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, ArrowRight, Bot, BrainCircuit, Cable, CalendarClock, CheckCircle2, ChevronRight, Code2, Database,
  Factory, FileText, Gauge, Map as MapIcon, MessageSquare, PlayCircle, Radar, RefreshCw, Server, ShieldCheck, ShoppingCart, Store, Zap, BellRing, Send, MessageSquareReply,
  Truck, Users, XCircle, Mail, ClipboardCheck } from "lucide-react";
import { api } from "../api";
import HomeCommand from "../components/HomeCommand";
import { fmt, useLoad } from "../util";

const ago = ts => { if (!ts) return "never"; const m = (Date.now() - new Date(ts)) / 60000; return m < 1 ? "just now" : m < 60 ? `${Math.round(m)} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`; };
const dur = (a, b) => (a && b ? `${Math.max(0, (new Date(b) - new Date(a)) / 1000).toFixed(1)} s` : "–");

/* ------------------------------------------------------------ the stages */
const STAGES = [
  { id: "sources", n: 1, zone: "client", title: "Source systems", sub: "Customer environment", icon: Factory,
    items: [[ShoppingCart, "SAP / ERP purchasing", "PO, GRN, invoice"], [ClipboardCheck, "QMS", "Inspections, NCR, CAPA"], [Factory, "MES / shop floor", "Downtime, genealogy"],
      [Truck, "Logistics & GPS", "Milestones, GPS, AIS"], [Store, "Supplier portal", "Replies, vehicle reports"]],
    what: "Everything starts in the customer's own systems. The agent never changes them: it only reads the records it needs to measure suppliers.",
    how: ["Purchasing (SAP/ERP) holds purchase orders, schedule agreements, goods receipts and invoices.", "The quality system (QMS) holds production and incoming inspections, NCRs and corrective actions (CAPA).",
      "The MES holds line-stop downtime and product genealogy (which supplier lot went into which production order).", "Carriers, GPS devices and the supplier portal report where shipments are."],
    tech: ["SAP / Oracle / Odoo ERP", "QMS", "Siemens / Rockwell MES", "MQTT / IoT", "CSV / Excel"], go: [["integration", "Open Data Integration"]] },
  { id: "integration", n: 2, zone: "client", title: "Integration gateway", sub: "Read-only connectors", icon: Cable,
    what: "Secure, read-only connections from the customer's systems into the platform. Admins create them; production sources need an approval.",
    how: ["An admin adds a connection (database, API or file) with a read-only account.", "Credentials go to an encrypted vault; only masked values are ever shown.", "Production sources wait for approval before the first sync.",
      "Every create, edit, test and sync is written to the audit log."],
    tech: ["TLS", "Encrypted vault", "SSH tunnel / on-prem agent", "Approval workflow", "Audit log"], go: [["integration", "Manage connections"]] },
  { id: "etl", n: 3, zone: "gwc", title: "ETL in Python", sub: "Map, validate, load", icon: Code2,
    what: "Raw records are mapped to one supplier model, checked for quality and reconciled before anything is published.",
    how: ["Map source fields to the canonical model (supplier, PO line, receipt, inspection, NCR).", "Mask or exclude sensitive columns (prices, personal data) before storage.",
      "Run data-quality rules: errors block a load, warnings are reported.", "Reconcile: the app's counts must equal the source counts, supplier by supplier."],
    tech: ["Python", "FastAPI", "SQLAlchemy", "Data-quality rules", "Reconciliation", "Lineage"], go: [["integration", "Open mappings and loads"]] },
  { id: "scheduler", n: 4, zone: "gwc", title: "Scheduler", sub: "Runs on its own", icon: CalendarClock,
    what: "A built-in scheduler runs the pipeline and the agent's background jobs on a fixed cycle, logs each run and alerts an admin when one fails.",
    how: ["Refresh the KPI cache and freeze a scorecard snapshot for audit.", "Run the 8 risk detectors and notify owners of new alerts.", "Check overdue CAPA and response deadlines (SLA).",
      "Score open orders for late-delivery risk and refresh disruption feeds."],
    tech: ["Python scheduler thread", "Job log (job_runs)", "E-mail / Teams on failure"], go: [["settings", "Open job settings"]] },
  { id: "database", n: 5, zone: "gwc", title: "PostgreSQL (Neon)", sub: "Governed data store", icon: Database,
    what: "One governed database holds the cleaned facts and the approved KPI views that every screen and the agent read from.",
    how: ["Fact tables: purchase orders, receipts, inspections, NCR/CAPA, downtime, genealogy, shipments.", "Approved views compute OTIF, PPM, lead time and CAPA ageing the same way everywhere.",
      "Reads use a read-only connection; custom queries are SELECT-only with time and row limits.", "Snapshots keep each scorecard run for audit and disputes."],
    tech: ["PostgreSQL on Neon", "sp schema", "Approved KPI views", "Read-only role"], go: [["settings", "KPI definitions"]] },
  { id: "intelligence", n: 6, zone: "gwc", title: "Intelligence", sub: "BI · ML · AI agent", icon: BrainCircuit,
    what: "Three layers turn data into decisions: business intelligence measures, machine learning predicts, and the AI agent explains and proposes actions.",
    how: ["BI: supplier scorecards (grade A to D) and 8 risk detectors.", "ML: predicts which open order lines will be late and forecasts supplier quality.",
      "AI agent: answers questions with tools on the approved data and checks every number before showing it.", "Proposed actions always wait for a person's approval."],
    tech: ["Scorecards", "8 detectors", "Logistic / ridge / Poisson models", "Domo AI + LangChain", "Grounding check"], go: [["risk", "Open Risk Radar"], ["architecture", "Agent Architecture"]] },
  { id: "automation", n: 7, zone: "gwc", title: "Agent actions", sub: "Acts on its own", icon: Zap,
    what: "The agent does the routine follow-up itself, inside rules you approved: it asks suppliers for a new date on every late order, reminds them, escalates to procurement and records the answers. People step in only where a case is escalated.",
    how: ["Every order line past its promised date: the supplier is asked in its portal for a new date and the reason within 24 hours.",
      "No reply in time: a reminder. Still no reply after 48 hours: escalated to procurement (in-app, and e-mail or Teams when set up).",
      "The supplier's answer is recorded and the buyer is told; the line closes on its own when the goods arrive.",
      "Promise-date changes of up to 3 days, asked before the original date, are approved automatically. Suppliers are never e-mailed automatically."],
    tech: ["Scheduler job: followups", "Supplier portal", "Approved policy limits", "Audit log"], go: [["risk", "Open follow-ups", "followups"]] },
  { id: "outputs", n: 8, zone: "out", title: "Output & consumption", sub: "Who uses it", icon: Users,
    items: [[Gauge, "Dashboards", "Overview, trends"], [Radar, "Risk & alerts", "Alerts, predictions"], [MapIcon, "Network Tracker", "Live shipments"],
      [FileText, "Review packs", "Supplier meetings"], [MessageSquare, "Ask the agent", "Plain-English answers"]],
    what: "Each team reads the results where it works: dashboards, alerts, the live map, review packs, chat, e-mail and the supplier portal.",
    how: ["Management: the Overview and trends.", "Procurement and quality: Risk Radar, alerts and corrective actions.", "Logistics: the Network Tracker map.", "Suppliers: their own portal, with only their own data."],
    tech: ["React web app", "E-mail / Teams", "Supplier portal", "PDF / PPT review packs"], go: [["command", "Overview"], ["trends", "Trends"], ["risk", "Risk Radar"], ["tracker", "Network Tracker"], ["review", "Review Pack"]] },
];
const BY_ID = Object.fromEntries(STAGES.map(s => [s.id, s]));

/* ------------------------------------------------------------ live data shared by the diagram and the detail pages */
// admin read-outs (data readiness, jobs, data quality, reconciliation) are only requested for admins (backend policy)
function useLive(admin) {
  const health = useLoad(() => api.health().catch(() => null), []);
  const none = () => Promise.resolve(null);
  const ready = useLoad(() => (admin ? api.dataReadiness().catch(() => null) : none()), [admin]);
  const di = useLoad(() => api.diSummary().catch(() => null), []);
  const jobs = useLoad(() => (admin ? api.jobs().catch(() => null) : none()), [admin]);
  const dq = useLoad(() => (admin ? api.dq().catch(() => null) : none()), [admin]);
  const recon = useLoad(() => (admin ? api.recon().catch(() => null) : none()), [admin]);
  const alerts = useLoad(() => api.alerts().catch(() => null), []);
  const model = useLoad(() => api.predModel().catch(() => null), []);
  const fu = useLoad(() => api.followups().catch(() => null), []);
  return { health, ready, di, jobs, dq, recon, alerts, model, fu };
}
const latestBy = (rows, key, ts) => { const m = new Map(); for (const r of rows || []) { const o = m.get(r[key]); if (!o || r[ts] > o[ts]) m.set(r[key], r); } return [...m.values()]; };
function summarise(L) {
  const src = L.ready.data?.sources || [];
  const jobsLatest = latestBy(L.jobs.data?.runs, "job", "started_at");
  const dqLatest = (() => { const rows = L.dq.data || []; if (!rows.length) return []; const last = rows.reduce((a, r) => (r.created_at > a ? r.created_at : a), ""); const lid = rows.find(r => r.created_at === last)?.load_id; return rows.filter(r => r.load_id === lid); })();
  const reconLatest = (() => { const rows = L.recon.data || []; if (!rows.length) return []; const id = rows[0].recon_id; return rows.filter(r => r.recon_id === id); })();
  const al = L.alerts.data || [];
  return {
    sources: src.length ? { ok: src.filter(s => s.ready).length, total: src.length, demo: src.filter(s => s.demo).length } : null,
    integration: L.di.data ? { conns: L.di.data.connections, pending: L.di.data.pending_approvals, env: L.di.data.environment } : null,
    dq: dqLatest.length ? { err: dqLatest.filter(r => r.severity === "ERROR").length, warn: dqLatest.filter(r => r.severity === "WARN").length, pass: dqLatest.filter(r => r.severity === "PASS").length, rows: dqLatest } : null,
    recon: reconLatest.length ? { ok: reconLatest.filter(r => r.passed).length, total: reconLatest.length, rows: reconLatest } : null,
    jobs: jobsLatest.length ? { ok: jobsLatest.filter(r => r.status === "OK").length, failed: jobsLatest.filter(r => r.status === "FAILED").length, total: jobsLatest.length, every: L.jobs.data?.schedule_minutes, last: jobsLatest.reduce((a, r) => (r.started_at > a ? r.started_at : a), ""), rows: jobsLatest.sort((a, b) => a.job.localeCompare(b.job)) } : null,
    db: L.health.data ? { ok: L.health.data.database === "ok", cov: L.health.data.coverage } : null,
    alerts: al.length ? { n: al.length, crit: al.filter(a => a.severity === "CRITICAL").length, high: al.filter(a => a.severity === "HIGH").length } : null,
    llm: L.health.data ? { ok: !!L.health.data.llm_configured, model: L.health.data.model } : null,
    fu: L.fu.data ? (() => { const b = L.fu.data.by_stage || {}; const open = ["REQUESTED", "REMINDED", "ESCALATED", "CONFIRMED"].reduce((a, k) => a + (b[k] || 0), 0); return { open, conf: b.CONFIRMED || 0, esc: b.ESCALATED || 0, b }; })() : null,
  };
}
const statusOf = (id, S) => ({
  sources: S.sources && [`${S.sources.ok} of ${S.sources.total} feeds loaded${S.sources.demo ? ` · ${S.sources.demo} demo` : ""}`, S.sources.ok === S.sources.total ? "ok" : "warn"],
  integration: S.integration && [S.integration.conns ? `${S.integration.conns} connection(s)` : "Demo data · no live connector", S.integration.conns ? "ok" : "warn"],
  etl: S.dq && [S.dq.err ? `${S.dq.err} DQ error(s) last load` : `DQ passed · ${S.dq.warn} warning(s)`, S.dq.err ? "bad" : S.dq.warn ? "warn" : "ok"],
  scheduler: S.jobs && [S.jobs.failed ? `${S.jobs.failed} job(s) failed · every ${S.jobs.every} min` : `${S.jobs.ok}/${S.jobs.total} jobs OK · every ${S.jobs.every} min`, S.jobs.failed ? "bad" : S.jobs.ok === S.jobs.total ? "ok" : "warn"],
  database: S.db && [S.db.ok ? `Online · data to ${S.db.cov?.as_of_date}` : "Database unreachable", S.db.ok ? "ok" : "bad"],
  intelligence: S.alerts && [`${S.alerts.n} active alerts · ${S.alerts.crit} critical`, S.alerts.crit ? "warn" : "ok"],
  automation: S.fu && [`${S.fu.open} late lines followed up · ${S.fu.conf} answered${S.fu.esc ? ` · ${S.fu.esc} escalated` : ""}`, S.fu.esc ? "warn" : "ok"],
  outputs: ["7 channels for 5 roles", "ok"],
}[id]);

/* ------------------------------------------------------------ diagram */
function Flow() { return <div className="hm-flow" aria-hidden><i /><i /><i /><ChevronRight size={16} /></div>; }

function StageCard({ s, S, onOpen, big }) {
  const st = statusOf(s.id, S); const Icon = s.icon;
  return <button className={`hm-stage z-${s.zone}` + (big ? " big" : "")} onClick={() => onOpen(s.id)} aria-label={`${s.n}. ${s.title}: open details`}>
    <span className="hm-stage-h"><b>{s.n}</b><span>{s.title}</span></span>
    <span className="hm-stage-sub">{s.sub}</span>
    {s.items ? <span className="hm-items">{s.items.map(([I, t, d]) => <span key={t} className="hm-item"><I size={16} /><span><b>{t}</b><em>{d}</em></span></span>)}</span>
      : <><span className="hm-ic"><Icon size={34} /></span><span className="hm-mini">{s.tech.slice(0, 4).map(t => <span key={t}>{t}</span>)}</span></>}
    {st && <span className={`hm-st ${st[1]}`}>{st[1] === "ok" ? <CheckCircle2 size={12} /> : st[1] === "bad" ? <XCircle size={12} /> : <AlertTriangle size={12} />}{st[0]}</span>}
    <span className="hm-open">Details <ArrowRight size={12} /></span>
  </button>;
}

function Diagram({ S, onOpen }) {
  const [s1, s2, s3, s4, s5, s6, s7, s8] = STAGES;
  return <div className="hm-diagram">
    <div className="hm-zone client"><div className="hm-zone-h">Customer environment</div>
      <div className="hm-row"><StageCard s={s1} S={S} onOpen={onOpen} big /><Flow /><StageCard s={s2} S={S} onOpen={onOpen} /></div></div>
    <Flow />
    <div className="hm-zone gwc"><div className="hm-zone-h"><img src="/gwc-mark.png" alt="" /> GWC DATA.AI · automated data pipeline</div>
      <div className="hm-row"><StageCard s={s3} S={S} onOpen={onOpen} /><Flow /><StageCard s={s4} S={S} onOpen={onOpen} /><Flow /><StageCard s={s5} S={S} onOpen={onOpen} /><Flow /><StageCard s={s6} S={S} onOpen={onOpen} /><Flow /><StageCard s={s7} S={S} onOpen={onOpen} /></div></div>
    <Flow />
    <div className="hm-zone out"><div className="hm-zone-h">Consumption</div>
      <div className="hm-row"><StageCard s={s8} S={S} onOpen={onOpen} big /></div></div>
  </div>;
}

/* ------------------------------------------------------------ detail page */
function Pill({ k }) { const c = k === "ERROR" || k === false || k === "FAILED" ? "bad" : k === "WARN" ? "warn" : "ok"; return <span className={`hm-pill ${c}`}>{k === true ? "Passed" : k === false ? "Failed" : String(k).replace("_", " ")}</span>; }

function Live({ id, L, S, admin, run, busy }) {
  if (id === "sources") {
    const src = L.ready.data?.sources || [];
    return <>
      {S.db?.cov && <p className="hm-note">Data window: purchase orders from <b>{S.db.cov.po_from}</b>, inspections to <b>{S.db.cov.inspections_to}</b>, measured as of <b>{S.db.cov.as_of_date}</b>.</p>}
      <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Feed</th><th>Table</th><th className="num">Rows</th><th>Unlocks</th><th>Status</th></tr></thead>
        <tbody>{src.map(s => <tr key={s.table}><td><b>{s.source}</b></td><td><code>{s.table}</code></td><td className="num">{fmt(s.rows, 0)}</td><td>{s.unlocks}</td>
          <td>{!s.ready ? <span className="hm-pill warn">Not loaded{s.template ? ` · ${s.template}` : ""}</span>
            : s.demo ? <span className="hm-pill demo" title="Synthetic rows generated for demos (tagged SYNTHETIC); replace with the real extract">Loaded · demo data</span>
            : <span className="hm-pill ok">Loaded</span>}</td></tr>)}</tbody></table></div>
      {src.some(s => s.demo) && <p className="hm-note" style={{ marginTop: 10 }}>Feeds marked <b>demo data</b> hold synthetic rows built from the real PO lines and tagged SYNTHETIC. Load the real extract (template in data/templates) to replace them.</p>}
    </>;
  }
  if (id === "integration") {
    const d = L.di.data;
    if (!d) return <p className="hm-note">Connection status is visible to admins only.</p>;
    return <div className="hm-kpis">
      <div><span>Environment</span><b>{d.environment}</b></div>
      <div><span>Live connections</span><b>{d.connections}</b><em>{d.connections ? "" : "running on loaded demo data"}</em></div>
      <div><span>Waiting for approval</span><b>{d.pending_approvals}</b></div>
      <div><span>Secrets vault</span><b>{d.vault?.provider}</b><em>key {d.vault?.key_fingerprint}</em></div>
    </div>;
  }
  if (id === "etl") return <>
    <h4>Data-quality rules · latest load</h4>
    {!S.dq ? <p className="hm-note">No data-quality results visible.</p> :
      <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Rule</th><th>Table</th><th className="num">Failed rows</th><th>Result</th></tr></thead>
        <tbody>{S.dq.rows.map(r => <tr key={r.rule + r.table_name}><td><b>{r.rule.replaceAll("_", " ")}</b></td><td><code>{r.table_name}</code></td><td className="num">{fmt(r.failed_rows, 0)}</td><td><Pill k={r.severity} /></td></tr>)}</tbody></table></div>}
    <h4>Reconciliation · app vs source {S.recon && <span className="hm-pill ok">{S.recon.ok} of {S.recon.total} checks match</span>}
      {admin && <button className="ghost chip-btn" disabled={busy} onClick={() => run(() => api.runRecon(), "Reconciliation finished")}><RefreshCw size={12} /> Run now</button>}</h4>
    {S.recon && <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Check</th><th>Supplier</th><th className="num">Source</th><th className="num">App</th><th>Result</th></tr></thead>
      <tbody>{[...S.recon.rows].sort((a, b) => a.passed - b.passed).slice(0, 12).map((r, i) => <tr key={i}><td>{r.check_name}</td><td>{r.supplier_id || "all"}</td><td className="num">{fmt(r.source_value, 0)}</td><td className="num">{fmt(r.app_value, 0)}</td><td><Pill k={r.passed} /></td></tr>)}</tbody></table></div>}
  </>;
  if (id === "scheduler") {
    if (!S.jobs) return <p className="hm-note">Job runs are visible to admins only.</p>;
    return <>
      <p className="hm-note">Cycle: every <b>{S.jobs.every} minutes</b> · last run {ago(S.jobs.last)}.</p>
      <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Job</th><th>Last run</th><th className="num">Took</th><th>Result</th><th>Detail</th>{admin && <th />}</tr></thead>
        <tbody>{S.jobs.rows.map(r => <tr key={r.job}><td><b>{r.job.replaceAll("_", " ")}</b></td><td>{ago(r.started_at)}</td><td className="num">{dur(r.started_at, r.finished_at)}</td><td><Pill k={r.status} /></td>
          <td className="hm-detail">{r.error ? r.error.slice(0, 80) : Object.entries(r.detail || {}).filter(([k]) => k !== "trigger").slice(0, 3).map(([k, v]) => `${k.replaceAll("_", " ")}: ${typeof v === "object" ? (Array.isArray(v) ? v.length : "…") : v}`).join(" · ")}</td>
          {admin && <td><button className="ghost chip-btn" disabled={busy} onClick={() => run(() => api.runJob(r.job), `Job "${r.job}" finished`)}><PlayCircle size={12} /> Run</button></td>}</tr>)}</tbody></table></div>
    </>;
  }
  if (id === "database") {
    const src = (L.ready.data?.sources || []).filter(s => s.ready);
    return <>
      <div className="hm-kpis">
        <div><span>Status</span><b>{S.db?.ok ? "Online" : "Offline"}</b><em>PostgreSQL on Neon</em></div>
        <div><span>Tables with data</span><b>{src.length}</b></div>
        <div><span>Rows in fact tables</span><b>{fmt(src.reduce((a, s) => a + (s.rows || 0), 0), 0)}</b></div>
        <div><span>Measured as of</span><b>{S.db?.cov?.as_of_date || "–"}</b></div>
      </div>
      <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Table</th><th className="num">Rows</th><th>Used for</th></tr></thead>
        <tbody>{src.map(s => <tr key={s.table}><td><code>{s.table}</code></td><td className="num">{fmt(s.rows, 0)}</td><td>{s.unlocks}</td></tr>)}</tbody></table></div>
    </>;
  }
  if (id === "intelligence") {
    const m = L.model.data;
    return <div className="hm-tri">
      <div className="hm-tri-c"><h4><Radar size={15} /> Business intelligence</h4>
        <p><b>{S.alerts?.n ?? "–"}</b> active risk alerts</p><p>{S.alerts?.crit ?? 0} critical · {S.alerts?.high ?? 0} high</p><p>8 detectors · scorecards graded A to D</p></div>
      <div className="hm-tri-c"><h4><BrainCircuit size={15} /> Machine learning</h4>
        {m ? <><p>Model <b>{m.version}</b></p><p>Trained {ago(m.trained_at)} on {fmt(m.train_rows, 0)} order lines</p><p className="hm-small">{m.metrics?.method}</p></> : <p>No model visible yet.</p>}</div>
      <div className="hm-tri-c"><h4><Bot size={15} /> AI agent</h4>
        <p>{S.llm?.ok ? <span className="hm-pill ok">Connected</span> : <span className="hm-pill bad">Not configured</span>}</p><p className="hm-small">{S.llm?.model}</p><p>28 tools · every figure checked before it is shown</p></div>
    </div>;
  }
  if (id === "automation") {
    const f = L.fu.data, b = f?.by_stage || {}, p = f?.policy || {};
    if (!f) return <p className="hm-note">Follow-up status is not available.</p>;
    return <>
      <div className="hm-kpis">
        <div><span>Asked, waiting for reply</span><b>{b.REQUESTED || 0}</b></div>
        <div><span>Reminded</span><b>{b.REMINDED || 0}</b></div>
        <div><span>Escalated to procurement</span><b>{b.ESCALATED || 0}</b></div>
        <div><span>Answered by supplier</span><b>{b.CONFIRMED || 0}</b></div>
        <div><span>Closed (received)</span><b>{b.CLOSED || 0}</b></div>
      </div>
      <p className="hm-note">Policy: reply within <b>{p.followup_reply_hours} h</b>, escalate after <b>{p.followup_escalate_hours} h</b>, auto-approve date changes up to <b>{p.auto_approve_days} days</b> asked before the original date.
        {f.last_run ? ` Last run ${ago(f.last_run.started_at)}.` : ""}</p>
      {admin && <button className="ghost chip-btn" disabled={busy} onClick={() => run(() => api.followupsRun(), "Follow-up run finished")}><PlayCircle size={12} /> Run follow-up now</button>}
    </>;
  }
  return <div className="hm-outs">{BY_ID.outputs.items.map(([I, t, d], i) => <div key={t} className="hm-out"><I size={20} /><b>{t}</b><span>{d}</span></div>)}
    <div className="hm-out"><Mail size={20} /><b>E-mail &amp; Teams</b><span>Alerts and digests</span></div><div className="hm-out"><Store size={20} /><b>Supplier portal</b><span>Suppliers see only their data</span></div></div>;
}

function Detail({ id, L, S, onOpen, nav, allowed, admin }) {
  const s = BY_ID[id], i = STAGES.indexOf(s), st = statusOf(id, S);
  const [busy, setBusy] = useState(false), [msg, setMsg] = useState(""), [err, setErr] = useState("");
  const run = async (fn, ok) => { setBusy(true); setErr(""); setMsg(""); try { await fn(); setMsg(ok); L.jobs.reload(); L.recon.reload(); L.dq.reload(); L.fu.reload(); } catch (e) { setErr(e.message); } finally { setBusy(false); } };
  const Icon = s.icon;
  return <div className="hm-detail-page">
    <div className="hm-crumbs">
      <button className="ghost chip-btn" onClick={() => onOpen(null)}><ArrowLeft size={13} /> Pipeline</button>
      <div className="hm-steps">{STAGES.map(x => <button key={x.id} className={`z-${x.zone}` + (x.id === id ? " on" : "")} onClick={() => onOpen(x.id)} title={x.title}>{x.n}</button>)}</div>
    </div>
    <div className={`hm-hero z-${s.zone}`}>
      <span className="hm-hero-ic"><Icon size={30} /></span>
      <div><div className="hm-eyebrow">Stage {s.n} of {STAGES.length} · {s.sub}</div><h2>{s.title}</h2><p>{s.what}</p></div>
      {st && <span className={`hm-st big ${st[1]}`}>{st[0]}</span>}
    </div>
    <div className="hm-cols">
      <section className="card hm-sec"><h3>How it works</h3><ol className="hm-how">{s.how.map(h => <li key={h}>{h}</li>)}</ol>
        <h3 style={{ marginTop: 14 }}>Technology</h3><div className="hm-tech">{s.tech.map(t => <span key={t}>{t}</span>)}</div></section>
      <section className="card hm-sec"><h3>Work on it</h3>
        <div className="hm-go">{s.go.filter(([p]) => allowed.includes(p)).map(([p, l, t]) => <button key={p + l} className="primary chip-btn" onClick={() => { if (t) { try { sessionStorage.setItem("rr.tab", t); } catch { /* storage unavailable */ } } nav(p); }}>{l} <ArrowRight size={12} /></button>)}
          {!s.go.some(([p]) => allowed.includes(p)) && <p className="hm-note">Your role can view this stage; changes here are made by an admin.</p>}</div>
        {msg && <p className="hm-ok"><CheckCircle2 size={13} /> {msg}</p>}{err && <p className="err">{err}</p>}
        <div className="hm-nav2">{i > 0 && <button className="ghost chip-btn" onClick={() => onOpen(STAGES[i - 1].id)}><ArrowLeft size={12} /> {STAGES[i - 1].title}</button>}
          {i < STAGES.length - 1 && <button className="ghost chip-btn" onClick={() => onOpen(STAGES[i + 1].id)}>{STAGES[i + 1].title} <ArrowRight size={12} /></button>}</div></section>
    </div>
    <section className="card hm-sec"><h3>Live status</h3><Live id={id} L={L} S={S} admin={admin} run={run} busy={busy} /></section>
  </div>;
}

/* ------------------------------------------------------------ page */
const stageFromHash = () => { const [p, sub] = window.location.hash.slice(1).split("/"); return p === "home" && BY_ID[sub] ? sub : null; };

export default function Home({ nav, allowed = [], user, openSupplier, ask }) {
  const L = useLive(user?.role === "ADMIN"); const S = useMemo(() => summarise(L), [L.health.data, L.ready.data, L.di.data, L.jobs.data, L.dq.data, L.recon.data, L.alerts.data, L.model.data, L.fu.data]); // eslint-disable-line
  const [stage, setStage] = useState(stageFromHash);
  useEffect(() => { const f = () => setStage(stageFromHash()); window.addEventListener("hashchange", f); return () => window.removeEventListener("hashchange", f); }, []);
  const open = id => { window.location.hash = id ? `home/${id}` : "home"; setStage(id); window.scrollTo?.({ top: 0, behavior: "smooth" }); };
  const admin = user?.role === "ADMIN";
  if (stage) return <Detail id={stage} L={L} S={S} onOpen={open} nav={nav} allowed={allowed} admin={admin} />;
  const full = <div className="hm">
    <div className="hm-head">
      <img src="/gwc-logo.png" alt="GWC Data.AI" className="hm-logo" />
      <div><h1>From source systems to supplier decisions</h1>
        <p>Eight stages move the data from the customer's systems to the people who act on it, and the agent acts on the routine work itself. Click any stage to see how it works, its live status, and where to work on it.</p></div>
    </div>
    <Diagram S={S} onOpen={open} />
  </div>;
  return <HomeCommand L={L} S={S} statusOf={statusOf} onStage={open} nav={nav} allowed={allowed} openSupplier={openSupplier} ask={ask} />;
}
