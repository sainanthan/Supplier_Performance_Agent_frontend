// Home, presentation edition: the system architecture pipeline a lead can walk a client through.
//   top    : the six-stage architecture (BI & Reports is the key layer, with live KPIs) | the problems the agent solves
//   bottom : the detail of whatever is selected (stage, part or problem)               | open orders by delivery window
// Everything drills through: a stage or part explains itself below and "Inspect" opens it in the app; a heatmap cell lists
// its order lines; a supplier opens its profile.
import { Fragment, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowRight, Bot, ChevronRight, FileText, Lock, BrainCircuit, Cable, CheckCircle2, ClipboardCheck, Clock, Code2, Database, Factory, FileSpreadsheet, Gauge,
  LayoutGrid, Layers, LineChart, ListChecks, Map as MapIcon, MessageSquare, ScrollText, UserCheck, Radar, Search, Send, ShieldCheck, ShoppingCart, Store, Truck, Users, Workflow, Zap } from "lucide-react";
import { api } from "../api";
import SidePanel from "./SidePanel";
import { siFastapi, siLangchain, siMaplibre, siNeon, siNumpy, siPostgresql, siPython, siReact } from "./brandIcons";
import { fmt, inr, useLoad } from "../util";

/* a drill target: a stage page, a page (optionally a Risk Radar tab), or a question to the agent */
const P = (page, tab) => ({ page, tab }), STG = stage => ({ stage }), ASK = ask => ({ ask });

/* the tool each source is read through: the Neon PostgreSQL warehouse (the app's primary connection) and the app's own portal */
// official Neon logomark (Simple Icons, CC0; brand colour from neon.com/brand), drawn a little smaller than its tile
const NeonMark = ({ size }) => <svg viewBox="-2 -2 28 28" width={size} height={size} role="img" aria-label="Neon"><path d={siNeon.path} fill={`#${siNeon.hex}`} /></svg>;
const NeonLogo = ({ light }) => <span className={"neon-logo" + (light ? " light" : "")} role="img" aria-label="Neon DB">
  <svg viewBox="0 0 24 24" aria-hidden><path d={siNeon.path} fill={`#${siNeon.hex}`} /></svg><b>NEON</b></span>;
const withNeon = (str, light) => (typeof str === "string" && /Neon DB/.test(str)
  ? str.split("Neon DB").flatMap((part, i) => (i ? [<NeonLogo key={i} light={light} />, part] : [part])) : str);
const GwcMark = ({ size }) => <img src="/gwc-mark.png" alt="GWC supplier portal" width={size} height={size} style={{ objectFit: "contain" }} />;

/* ------------------------------------------------------------ content */
const COLS = [
  { id: "sources", n: 1, tone: "src", title: "Source systems", sub: "Customer environment", stage: "sources",
    chips: [[FileSpreadsheet, "ERP purchase orders", "CSV extract", STG("sources")], [ClipboardCheck, "QMS inspections & NCR", "CSV extract", STG("sources")],
      [Factory, "MES downtime", "CSV extract", STG("sources")], [Store, "Supplier portal", "Entered by suppliers", P("tracker")]],
    what: "Today the agent reads CSV extracts of purchasing, quality and production data, plus what suppliers enter in their portal. Live ERP / QMS / MES connectors plug in at stage 2 without changing anything downstream.",
    tech: "CSV extracts loaded with Python into PostgreSQL on Neon; supplier portal forms", tables: "fact_purchase_order_receipt, fact_quality_inspection, fact_ncr_capa, fact_downtime_event, fact_inbound_milestone",
    steps: ["ERP extract: purchase-order lines with promised and received dates.", "QMS extracts: inspections, NCRs and corrective actions.", "MES extract: line stops and which supplier lot went into which order.", "Supplier portal: new promise dates, vehicle and GPS details."],
    go: [P("integration")], goL: ["Open Data Integration"] },
  { id: "integration", n: 2, tone: "gw", title: "Integration gateway", sub: "Read-only connectors", stage: "integration",
    chips: [[Cable, "Connectors", "Databases, APIs, files", P("integration")], [ShieldCheck, "Security", "TLS, vault, approvals", STG("integration")],
      [UserCheck, "Approvals", "Before the first sync", P("integration")], [ScrollText, "Audit log", "Every change recorded", P("integration")]],
    what: "Secure, read-only connections bring each source in. Admins create them; production sources need an approval before the first sync.",
    tech: "Read-only accounts, TLS, encrypted vault, SSH tunnel / on-prem agent", tables: "integration.connections, integration.audit_log",
    steps: ["An admin adds a connection with a read-only account.", "Credentials go to an encrypted vault, shown masked.", "Production sources wait for approval.", "Every change and sync is audited."],
    go: [P("integration")], goL: ["Manage connections"] },
  { id: "pipeline", n: 3, tone: "pl", title: "Data pipeline", sub: "Python ETL on a schedule", stage: "etl",
    chips: [[Code2, "ETL in Python", "Map, check, load", STG("etl")], [ListChecks, "Data-quality checks", "Errors block a load", STG("etl")], [Clock, "Scheduler", "Every cycle", STG("scheduler")], [Database, "PostgreSQL", "Approved KPI views", STG("database")]],
    what: "Raw records are mapped to one supplier model, checked, reconciled against the source and loaded into one governed database on a fixed cycle.",
    tech: "Python, FastAPI, SQLAlchemy, PostgreSQL on Neon", tables: "sp schema facts; views v_po_delivery, v_ncr_supplier, v_defect_attribution",
    steps: ["Map fields to one model; mask sensitive columns.", "Data-quality rules: errors block a load.", "Reconcile app counts with the source.", "Freeze a scorecard snapshot every cycle."],
    go: [P("integration")], goL: ["Open loads and quality"] },
  { id: "intelligence", n: 4, tone: "ai", title: "Intelligence", sub: "BI, ML and the AI agent", stage: "intelligence",
    chips: [[Gauge, "Scoring engine", "Grade A to D", P("command")], [Radar, "8 risk detectors", "Early warning", P("risk", "alerts")],
      [BrainCircuit, "Prediction", "Late-line risk", P("risk", "predict")], [Bot, "AI agent", "28 tools, checked figures", P("architecture")]],
    what: "BI measures every supplier, machine learning predicts which open orders will be late, and the AI agent explains why with figures checked against the data.",
    tech: "Scorecards, 8 detectors, logistic / ridge / Poisson models, Domo AI + LangChain", tables: "ml_models, ml_predictions, scorecard snapshots",
    steps: ["Score each supplier on delivery, quality, response and cost.", "Run 8 detectors for late supply, stops, CAPA, defects.", "Score every open line for late risk with reasons.", "Answer questions; every number is checked."],
    go: [P("risk"), P("architecture")], goL: ["Open Risk Radar", "Agent Architecture"] },
  { id: "actions", n: 5, tone: "act", title: "Agent actions", sub: "Closed loop, on its own", stage: "automation", hot: true,
    chips: [[Send, "Supplier follow-up", "New date within 24 h", P("risk", "followups")], [AlertTriangle, "Escalation", "To procurement at 48 h", P("risk", "followups")],
      [ClipboardCheck, "Corrective actions", "Drafted for approval", P("risk", "actions")], [Search, "Sourcing review", "Switch suggestions", P("risk", "sourcing")]],
    what: "The agent acts on routine work itself, inside rules you approved: it asks suppliers for new dates on every late order, reminds, escalates, records answers and closes the loop when goods arrive.",
    tech: "Scheduler job 'followups', supplier portal, policy limits, audit log", tables: "supplier_followups, promise_changes, corrective_actions",
    steps: ["Late line: supplier asked in its portal for a new date and reason.", "No reply in 24 h: reminder; at 48 h: escalated.", "Replies recorded, buyer told; closes on arrival.", "Small date changes asked in time: auto-approved."],
    go: [P("risk", "followups")], goL: ["Open follow-ups"] },
  { id: "outputs", n: 6, tone: "out", title: "BI & Reports", sub: "Decision dashboards", stage: "outputs", key: true,
    chips: [[LayoutGrid, "Supplier scorecards", "Grades and KPIs", P("command")], [LineChart, "OTIF & PPM trends", "Week by week", P("trends")], [MapIcon, "Network Tracker", "Live shipment map", P("tracker")],
      [Store, "Review packs", "Supplier meetings", P("review")]],
    what: "The BI layer turns every governed figure into decisions: executive KPIs, supplier scorecards graded A to D, OTIF and PPM trends, and one-click review packs, all from the same approved views the agent uses.",
    tech: "React BI dashboards, Recharts, KPI views; PDF (ReportLab) and PowerPoint (python-pptx) packs", tables: "v_po_delivery, v_ncr_supplier, scorecard snapshots",
    steps: ["Executive KPIs: OTIF, PPM, spend, open NCR.", "Scorecards: every supplier graded A to D.", "Trends: week-by-week OTIF and PPM per supplier.", "Review packs: PDF or PowerPoint in one click."],
    go: [P("command"), P("trends"), P("review")], goL: ["Open Overview", "Trends", "Review Pack"] },
];

/* ------------------------------------------------------------ each component (chip), explained when clicked */
const rowsIn = (D, ...tbl) => { const s = (D.ready?.sources || []).filter(x => tbl.some(t => x.table.endsWith(t))); return s.length ? s.reduce((a, x) => a + (x.rows || 0), 0) : null; };
const nAlerts = (D, ...ty) => (D.alerts ? D.alerts.filter(a => ty.includes(a.type)).length : null);
const fuN = (D, ...st) => (D.fu ? st.reduce((s, k) => s + (D.fu.by_stage?.[k] || 0), 0) : null);
const CHIP = {
  "ERP purchase orders": { mark: NeonMark, conn: true, what: "Purchase-order lines exported from the ERP as CSV: what was ordered, promised and received. It is the base for on-time delivery, lead time and price.",
    steps: ["Export PO lines from the ERP as CSV.", "Load into PostgreSQL with the Python loader.", "Map to the supplier model and check quality.", "Goods receipts and invoices: demo rows until real extracts arrive."],
    tech: "CSV extract, Python loader (COPY), PostgreSQL on Neon", tables: "fact_purchase_order_receipt, fact_grn (demo), fact_invoice (demo)", btn: "View source data" },
  "QMS inspections & NCR": { mark: NeonMark, conn: true, what: "Quality extracts: every production inspection, non-conformance (NCR) and corrective action (CAPA), so defects and late fixes are traced to the supplier.",
    steps: ["Export inspections and NCR / CAPA as CSV.", "Load into PostgreSQL.", "Link defects to supplier lots through genealogy.", "Overdue CAPA becomes an alert."],
    tech: "CSV extracts, Python loader, PostgreSQL on Neon", tables: "fact_quality_inspection, fact_ncr_capa, fact_incoming_inspection (demo)", btn: "View source data" },
  "MES downtime": { mark: NeonMark, conn: true, what: "Production downtime exported from the MES: every line stop with its reason, so stops caused by missing supplier material are counted in hours lost.",
    steps: ["Export downtime events as CSV.", "Load into PostgreSQL.", "Keep NO_MATERIAL stops.", "Attribute them to the supplier late on that material."],
    tech: "CSV extract, Python loader, PostgreSQL on Neon", tables: "fact_downtime_event", btn: "View source data" },
  "Supplier portal": { mark: GwcMark, conn: true, what: "Suppliers sign in to their own portal to answer the agent: new promise dates and reasons, and the vehicle and GPS details of each shipment.",
    steps: ["Supplier signs in and sees only its own orders.", "Answers follow-ups with a new date and reason.", "Enters vehicle and GPS details by form.", "Shipments appear on the Network Tracker."],
    tech: "Supplier portal (web form), role-based access", tables: "supplier_followups, promise_changes, fact_inbound_milestone", btn: "Open Network Tracker" },
  Connectors: { logo: siFastapi, what: "Each source is connected once by an admin with a read-only account. The gateway tests the connection, warns about write rights and syncs on a schedule.",
    steps: ["Pick a connector type and enter the endpoint.", "Credentials go to the encrypted vault, shown masked.", "Test the connection; write privileges raise a warning.", "Production sources wait for approval before the first sync."],
    tech: "FastAPI gateway; SQL, REST, OData, SFTP, OPC UA connectors", tables: "integration.connections, integration.sync_runs",
    live: D => (D.ready ? `${fmt(D.ready.ready, 0)} of ${fmt(D.ready.total, 0)} required feeds connected` : null), btn: "Open Data Integration" },
  Security: { icon: ShieldCheck, what: "Security controls keep the customer's data safe: encrypted connections, secrets in a vault, approvals and a full audit log.",
    steps: ["TLS on every connection; SSH tunnel or on-prem agent for private databases.", "Secrets encrypted in the vault, never in code.", "Only admins create or edit connectors.", "Every create, edit, test and sync is audited."],
    tech: "TLS verify-full, AES vault, role-based access, SELECT-only query guard", tables: "integration.audit_log, integration.approvals", btn: "View security details" },
  "ETL in Python": { logo: siPython, what: "The pipeline maps every source to one supplier model, checks it and loads it into the database, so every page uses the same figures.",
    steps: ["Map source fields to the supplier model.", "Mask or drop sensitive columns before storing.", "Data-quality rules: errors block the load.", "Reconcile counts with the source."],
    tech: "Python, SQLAlchemy, psycopg", tables: "sp schema fact and dimension tables", btn: "View pipeline details" },
  Scheduler: { icon: Clock, what: "The scheduler runs every job on its cycle: syncs, KPI refresh, risk detectors, predictions and the agent's follow-ups.",
    steps: ["Run syncs and loads on each cycle.", "Refresh scorecards and freeze a snapshot.", "Run detectors, predictions and follow-ups.", "Record every run and its result."],
    tech: "In-app job scheduler with run history", tables: "job_runs", btn: "View job runs" },
  PostgreSQL: { logo: siPostgresql, what: "One governed database holds the loaded data and the approved KPI views. The app and the agent only read these views, so numbers match everywhere.",
    steps: ["Store facts and dimensions in the sp schema.", "Compute KPIs in approved views.", "Keep scorecard snapshots for trends.", "The agent reads views, never raw tables."],
    tech: "PostgreSQL on Neon (TLS, pooled)", tables: "v_po_delivery, v_ncr_supplier, v_defect_attribution, v_material_supplier_share", btn: "View database details" },
  "Scoring engine": { icon: Gauge, what: "Every supplier is scored on delivery, quality, responsiveness and cost, and graded A to D, the same way every cycle.",
    steps: ["On time and in full, lead time.", "Defects (PPM) and rejections.", "NCR response and CAPA on time.", "Price against budget; grade A to D."],
    tech: "SQL KPI views and weighted scoring", tables: "scorecard snapshots", btn: "Open scorecards" },
  "Supplier scorecards": { icon: LayoutGrid, what: "Every supplier on one screen with its grade, score and the KPIs behind it, so management sees who to back and who to fix.", steps: ["Grade A to D for every supplier.", "Delivery, quality, response and cost scores.", "Sort by risk or spend.", "Drill into any supplier profile."], tech: "React dashboards over scorecard views", tables: "scorecard snapshots, v_po_delivery", btn: "Open Overview" },
  "OTIF & PPM trends": { icon: LineChart, what: "Week-by-week on-time delivery and defect rate for each supplier, so improvement or decline is visible before the review meeting.", steps: ["OTIF % by week.", "Incoming PPM by week.", "Compare suppliers side by side.", "Spot a decline early."], tech: "Recharts time series over KPI views", tables: "v_po_delivery, v_defect_attribution", btn: "Open Trends" },
  "8 risk detectors": { icon: Radar, what: "Eight detectors watch for trouble early: late supply, line stops, repeat defects, overdue CAPA, single-source exposure and more. Each raises an alert with its evidence.",
    steps: ["Run all detectors every cycle.", "Score each alert by severity and value.", "Explain why it is critical.", "Route it to an owner on Risk Radar."],
    tech: "Rule detectors over the KPI views", tables: "risk alerts",
    live: D => (D.alerts ? `${fmt(D.alerts.length, 0)} open alerts right now` : null), btn: "Open alerts" },
  Prediction: { logo: siNumpy, what: "A model scores every open order line for its chance of arriving late, with the main reasons, so buyers act before the date is missed.",
    steps: ["Learn from past deliveries per supplier and material.", "Score each open line's late risk.", "Show the reasons behind each score.", "Re-train and check accuracy each cycle."],
    tech: "Logistic, ridge and Poisson models in NumPy", tables: "ml_models, ml_predictions",
    live: D => (D.pred?.summary ? `${fmt(D.pred.summary.high_risk_open, 0)} open lines at high risk` : null), btn: "Open predictions" },
  "AI agent": { logo: siLangchain, what: "The AI agent answers questions in plain language using tools over the approved data; every figure it gives is checked against the database.",
    steps: ["Understand the question.", "Call the right tools (28) for the data.", "Check every number against the source.", "Answer with charts and the reasoning."],
    tech: "Domo AI with a LangChain tool loop", tables: "approved KPI views via tools", btn: "Open Agent Architecture" },
  "Supplier follow-up": { icon: Send, what: "For every late order line the agent asks the supplier, in its portal, for a new date and a reason, and records the answer.",
    steps: ["Detect the late line.", "Ask the supplier in its portal.", "Record the new date and reason.", "Close when the goods arrive."],
    tech: "Scheduler job 'followups', supplier portal", tables: "supplier_followups",
    live: D => { const n = fuN(D, "REQUESTED", "REMINDED", "ESCALATED", "CONFIRMED"); return n == null ? null : `${fmt(n, 0)} late lines being followed up`; }, btn: "Open follow-ups" },
  Escalation: { icon: AlertTriangle, what: "If the supplier does not answer, the agent reminds it after 24 hours and escalates to procurement after 48 hours.",
    steps: ["No reply in 24 h: reminder.", "No reply in 48 h: escalated to the buyer.", "Buyer sees it in the follow-ups list.", "Limits are set in policy, not by the agent."],
    tech: "Policy: reply 24 h, escalate 48 h", tables: "supplier_followups",
    live: D => { const n = fuN(D, "ESCALATED"); return n == null ? null : `${fmt(n, 0)} escalated to procurement`; }, btn: "Open follow-ups" },
  "Corrective actions": { icon: ClipboardCheck, what: "The agent drafts corrective actions for a person to approve, then tracks the supplier's response and verification.",
    steps: ["Draft the action with evidence.", "A person approves or rejects it.", "Track the supplier's response.", "Verify and close."],
    tech: "Corrective-action workflow with approvals", tables: "corrective_actions", btn: "Open actions" },
  "Sourcing review": { icon: Search, what: "When a supplier keeps failing on a material, the agent finds a better qualified supplier, compares them and suggests a trial share for procurement to decide.",
    steps: ["Spot repeat defects, late delivery or over-budget prices.", "Rank qualified alternatives.", "Show the comparison and trial impact.", "Procurement approves or rejects."],
    tech: "Sourcing review over quotes, delivery and defects", tables: "v_po_delivery, v_defect_attribution, fact_rfq_quote", btn: "Open sourcing reviews" },
  Dashboards: { logo: siReact, what: "Dashboards show management the overall picture: KPIs, trends, the heatmap and supplier scorecards.",
    steps: ["KPI tiles with weekly detail.", "OTIF and PPM trends.", "Supplier scorecards and grades.", "Drill through to any supplier."],
    tech: "React web app with live charts", tables: "KPI views", btn: "Open Overview" },
  Approvals: { icon: UserCheck, what: "A production source cannot sync until an admin approves it, so no new data reaches the scorecards unchecked.",
    steps: ["An admin adds or edits a connection.", "Production sources wait in the approval queue.", "A second person approves or rejects.", "Only approved sources sync."],
    tech: "Approval workflow, role-based access (admins only)", tables: "integration.approvals", btn: "Open Data Integration" },
  "Audit log": { icon: ScrollText, what: "Every create, edit, delete, test and sync is written to the audit log with who did it and when.",
    steps: ["Record who changed what and when.", "Keep test and sync results.", "Keep agent actions and approvals.", "Review it in Data Integration."],
    tech: "Append-only audit table", tables: "integration.audit_log, audit entries", btn: "Open Data Integration" },
  "Data-quality checks": { icon: ListChecks, what: "Every load is checked against data-quality rules; errors stop the load so bad data never reaches a KPI.",
    steps: ["Check required fields and formats.", "Check dates, quantities and duplicates.", "Errors block the load; warnings are reported.", "Reconcile counts with the source."],
    tech: "Python rule engine in the loader", tables: "dq results, reconciliation", btn: "View pipeline details" },
  "Network Tracker": { logo: siMaplibre, what: "A live map of inbound shipments, by supplier and route, so logistics can see what is moving and what is stuck.",
    steps: ["Plot shipments from milestones and GPS.", "Show routes and expected arrival.", "Flag delayed shipments.", "Open the order behind any shipment."],
    tech: "MapLibre map with deck.gl layers", tables: "fact_inbound_milestone", btn: "Open Network Tracker" },
  "Ask the agent": { icon: MessageSquare, what: "Anyone can ask a question in plain words and get an answer with charts, e.g. which supplier has the most overdue value.",
    steps: ["Type a question.", "The agent picks the tools.", "Figures are checked.", "Answer with a chart."], tech: "Chat assistant on the AI agent", tables: "approved KPI views", btn: "Ask for today's briefing" },
  "Review packs": { icon: Store, what: "One-click review packs for supplier meetings, in PDF or PowerPoint, built from the same figures as the app.",
    steps: ["Pick a supplier.", "Scorecard, trends and issues are filled in.", "Export PDF or PowerPoint.", "Share with the supplier."], tech: "ReportLab PDF, python-pptx", tables: "scorecards, alerts, actions", btn: "Open Review Pack" },
};

/* the architecture strip, readable at a glance: a big header icon, a plain subtitle, and one line per part */
const COLV = {
  sources: { icon: Database, sub: "Connected: Neon DB", in: "ERP, QMS and MES CSV extracts; supplier portal entries", out: "Stage 2: loaded through the gateway" },
  integration: { icon: Cable, sub: "Secure, read-only access", flow: ["Test", "Approve", "Sync"], in: "Stage 1: source records over TLS", out: "Stage 3: raw extracts for the pipeline" },
  pipeline: { icon: Database, sub: "Clean, check and load", flow: ["Extract", "Transform", "Load"], in: "Stage 2: raw extracts", out: "Stage 4: governed KPI views in PostgreSQL" },
  intelligence: { icon: BrainCircuit, sub: "Score, detect, predict", in: "Stage 3: approved KPI views", out: "Stage 5: alerts and predictions to act on; Stage 6: scores" },
  actions: { icon: Bot, sub: "Acts within your rules", in: "Stage 4: alerts, late lines and predictions", out: "Supplier portal, buyers' inbox, corrective-action workflow" },
  outputs: { icon: LayoutGrid, sub: "Decision dashboards", in: "Stage 4: scores and KPIs; Stage 5: agent actions", out: "Management, procurement, quality and supplier reviews" },
};
const SHORT = {
  "ERP purchase orders": "Neon DB", "QMS inspections & NCR": "Neon DB", "MES downtime": "Neon DB", "Supplier portal": "In-app portal",
  Connectors: "Database, API, file", Security: "TLS, vault, audit log",
  "ETL in Python": "Map and quality-check", Scheduler: "Runs every cycle", PostgreSQL: "One source of truth",
  "Scoring engine": "Suppliers graded A to D", "Supplier scorecards": "Grades and KPIs", "OTIF & PPM trends": "Week by week", "8 risk detectors": "Early-warning alerts", Prediction: "Late risk per order line", "AI agent": "Checked answers",
  "Supplier follow-up": "Asks for a new date", Escalation: "To the buyer at 48 h", "Corrective actions": "Drafted, you approve", "Sourcing review": "Suggests a switch",
  Dashboards: "Overview and trends", "Network Tracker": "Live shipment map", "Ask the agent": "Plain-language answers", "Review packs": "PDF and PowerPoint",
};

/* a dashboard monitor: bar chart + donut, drawn in code */
const Monitor = () => <svg viewBox="0 0 120 84" className="h4-mon" aria-hidden>
  <rect x="4" y="4" width="112" height="62" rx="7" fill="#1f2a5c" /><rect x="10" y="10" width="100" height="50" rx="3" fill="#fff" />
  <rect x="20" y="38" width="9" height="16" rx="2" fill="#4d8eeb" /><rect x="33" y="30" width="9" height="24" rx="2" fill="#4d8eeb" />
  <rect x="46" y="20" width="9" height="34" rx="2" fill="#f58a3a" />
  <circle cx="84" cy="35" r="15" fill="#4d8eeb" /><path d="M84 35 L84 20 A15 15 0 0 1 98.3 39.6 Z" fill="#f58a3a" /><path d="M84 35 L98.3 39.6 A15 15 0 0 1 77 48.3 Z" fill="#19b394" />
  <path d="M52 66 h16 l4 10 h-24 z" fill="#1f2a5c" /><rect x="40" y="76" width="40" height="5" rx="2.5" fill="#1f2a5c" /></svg>;

function Showcase({ c, kind, sel, setSel, D }) {
  const pick = t => setSel({ kind: "chip", col: c.id, id: t }), on = t => sel.kind === "chip" && sel.id === t;
  if (kind === "gateway") {
    return <div className="h4-show gw">
      <div className="h4-cluster">
        <span title="Neon DB: connected"><NeonMark size={26} /></span>
        <span title="FastAPI gateway"><svg viewBox="0 0 24 24" width="24" height="24" aria-label="FastAPI"><path d={siFastapi.path} fill={`#${siFastapi.hex}`} /></svg></span>
        <span title="Encrypted vault"><Lock size={22} /></span>
      </div>
      <span className="h4-entry">Secure entry</span>
      <div className="h4-pills2">{c.chips.map(([, t]) => <button key={t} className={on(t) ? "on" : ""} aria-pressed={on(t)} onClick={() => pick(t)}>{t}</button>)}</div>
      <em className="h4-cap">{subOf("Connectors", D)} · {subOf("Approvals", D)}</em>
    </div>;
  }
  return <div className="h4-show bi">
    <button className={"h4-monbtn" + (on(c.chips[0][1]) ? " on" : "")} onClick={() => pick(c.chips[0][1])} title="Supplier scorecards: how it works"><Monitor /></button>
    <b className="h4-showt">Scorecards, trends &amp; reports</b>
    <em className="h4-cap">{subOf("OTIF & PPM trends", D)}</em>
    <div className="h4-logos">{c.chips.map(([I, t]) => { const info = CHIP[t] || {};
      return <button key={t} className={on(t) ? "on" : ""} aria-pressed={on(t)} onClick={() => pick(t)} title={t}>
        <Logo c={t === "Review packs" ? { icon: FileText } : info} Fallback={I} size={20} /><span>{{ "Supplier scorecards": "Scores", "OTIF & PPM trends": "Trends", "Network Tracker": "Map", "Review packs": "Packs" }[t] || t}</span></button>; })}</div>
  </div>;
}

function Logo({ c, Fallback, size = 13 }) {
  if (c.mark) return <c.mark size={size} />;
  if (c.logo) return <svg className="hc-brand" viewBox="0 0 24 24" width={size} height={size} role="img" aria-label={c.logo.title}><path d={c.logo.path} fill={`#${c.logo.hex}`} /></svg>;
  const I = c.icon || Fallback; return <I size={size} />;
}

function problems(D) {
  const list = problemList(D), WAIT = "Loading live figures…";
  const waiting = { late: !D.pred || !D.fu, stop: !D.alerts, defect: !D.alerts, capa: !D.alerts };
  return list.map(p => (waiting[p.id] ? { ...p, proof: WAIT } : p.id === "data" && !D.ready ? { ...p, proof: "One governed pipeline for every feed · scorecards refreshed every cycle" } : p));
}

function problemList(D) {
  const al = D.alerts || [], cnt = t => al.filter(a => a.type === t), sum = (t, k) => cnt(t).reduce((s, a) => s + (a.metric?.[k] || 0), 0);
  const fu = D.fu?.by_stage || {}, fuOpen = ["REQUESTED", "REMINDED", "ESCALATED", "CONFIRMED"].reduce((s, k) => s + (fu[k] || 0), 0);
  const ps = D.pred?.summary || {};
  return [
    { id: "late", tone: "red", icon: Clock, title: "Late deliveries found at the gate",
      proof: `${fmt(ps.high_risk_open, 0)} open lines flagged before they are late · ${fmt(fuOpen, 0)} late lines followed up`,
      how: "The agent predicts which open order lines will be late, then follows up every line that is already late: it asks the supplier for a new date, reminds, escalates and records the answer.",
      steps: ["Score each open line's chance of arriving late, with reasons.", "Late lines: supplier asked for a new date within 24 h.", "Reminder at 24 h, escalation to procurement at 48 h.", "Follow-up closes when the goods arrive."], go: [P("risk", "followups"), P("risk", "predict")], goL: ["See follow-ups", "See predictions"] },
    { id: "stop", tone: "orange", icon: Factory, title: "Line stoppages discovered too late",
      proof: `${fmt(sum("SUPPLY_DISRUPTION", "hours"), 1)} h of line stops traced to suppliers · ${inr(sum("PAST_DUE_SUPPLY", "value_inr"))} of supply overdue`,
      how: "Line stoppages are linked to the supplier whose late material caused them, so the cost of a late supplier shows in hours and units lost, not just days late.",
      steps: ["Read NO_MATERIAL downtime from production.", "Attribute it to suppliers late on that material.", "Raise a stoppage alert with hours and units lost.", "Follow up first on suppliers that stop lines."], go: [P("risk", "alerts")], goL: ["Open Risk Radar"] },
    { id: "defect", tone: "violet", icon: Search, title: "Defects not traced to the supplier",
      proof: `${fmt(cnt("REPEATED_DEFECT").length, 0)} repeat-defect patterns traced to supplier lots`,
      how: "Product genealogy links each failed inspection to the supplier lots used in that production order, so repeat defects point at the right supplier with evidence.",
      steps: ["Read failed inspections and each order's genealogy.", "Share each defect across the suppliers whose lots were used.", "Flag a supplier when a defect keeps returning.", "Draft a quality inquiry for a person to send."], go: [P("risk", "alerts"), P("command")], goL: ["Open Risk Radar", "Defects on the Overview"] },
    { id: "capa", tone: "blue", icon: ShieldCheck, title: "Corrective actions left open",
      proof: `${fmt(Math.round(sum("OVERDUE_CAPA", "overdue")), 0)} overdue corrective actions tracked to their supplier`,
      how: "Each NCR's corrective action is tracked to its due date; overdue ones are raised against the supplier and moved through approval, supplier response and verification.",
      steps: ["Track each CAPA against its due date.", "Raise overdue CAPA as an alert per supplier.", "Draft the request for approval.", "Record the response and verify the fix."], go: [P("risk", "actions")], goL: ["Open actions"] },
    { id: "data", tone: "teal", icon: Layers, title: "Scattered data and manual reviews",
      proof: `${fmt((D.ready?.sources || []).filter(s => s.ready).length, 0)} of ${fmt((D.ready?.sources || []).length, 0)} feeds joined · scorecards refreshed every cycle`,
      how: "One governed pipeline joins purchasing, quality, production and logistics data; scorecards and review packs are produced automatically instead of monthly spreadsheets.",
      steps: ["Join every source into one supplier model.", "Compute KPIs the same way everywhere.", "Grade every supplier A to D.", "Produce review packs in one click."], go: [P("review"), P("command")], goL: ["Open a review pack", "Scorecards"] },
  ];
}

/* ------------------------------------------------------------ live figure under each part's name (like "1,000 trips · 94% OTIF") */
const LIVE = {
  "ERP purchase orders": D => { const r = rowsIn(D, "purchase_order_receipt"); return r != null && `Neon DB · ${fmt(r, 0)} PO lines`; },
  "QMS inspections & NCR": D => { const a = rowsIn(D, "quality_inspection"); return a != null && `Neon DB · ${fmt(a, 0)} inspections`; },
  "MES downtime": D => { const r = rowsIn(D, "downtime_event"); return r != null && `Neon DB · ${fmt(r, 0)} stops`; },
  "Supplier portal": D => { const n = fuN(D, "CONFIRMED"); return n != null && `In-app · ${fmt(n, 0)} dates confirmed`; },
  Connectors: D => D.ready && `${D.ready.ready} of ${D.ready.total} feeds connected`,
  Approvals: D => D.S?.integration && `${fmt(D.S.integration.pending || 0, 0)} pending approval`,
  "Audit log": () => "Every change recorded",
  "Data-quality checks": D => D.S?.dq && (D.S.dq.err ? `${D.S.dq.err} errors last load` : `Passed · ${D.S.dq.warn} warnings`),
  "Network Tracker": D => { const r = rowsIn(D, "inbound_milestone"); return r != null && `${fmt(r, 0)} shipment milestones`; },
  Scheduler: D => D.S?.jobs && `${D.S.jobs.ok}/${D.S.jobs.total} jobs OK · every ${D.S.jobs.every} min`,
  PostgreSQL: D => D.S?.db?.cov?.as_of_date && `Online · data to ${D.S.db.cov.as_of_date}`,
  "Scoring engine": D => D.ov && `${fmt(D.ov.suppliers, 0)} suppliers graded`,
  "8 risk detectors": D => D.alerts && `${fmt(D.alerts.length, 0)} alerts · ${fmt(D.alerts.filter(a => a.severity === "CRITICAL").length, 0)} critical`,
  Prediction: D => D.pred?.summary && `${fmt(D.pred.summary.high_risk_open, 0)} lines at high risk`,
  "AI agent": () => "28 tools · checked answers",
  "Supplier follow-up": D => { const n = fuN(D, "REQUESTED", "REMINDED", "ESCALATED", "CONFIRMED"); return n != null && `${fmt(n, 0)} late lines followed up`; },
  Escalation: D => { const n = fuN(D, "ESCALATED"); return n != null && `${fmt(n, 0)} escalated to buyers`; },
  "Supplier scorecards": D => D.ov && `Avg ${fmt(D.ov.avg_composite_score, 1)} / 100 · ${D.ov.grade_mix?.D || 0} at grade D`,
  "OTIF & PPM trends": D => D.ov && `OTIF ${fmt(D.ov.otif_pct, 1)}% · PPM ${fmt(D.ov.incoming_ppm, 0)}`,
  "Review packs": () => "PDF or PowerPoint, one click",
};
const subOf = (t, D) => LIVE[t]?.(D) || SHORT[t];

/* ------------------------------------------------------------ heatmap: open order lines by due window */
const WIN = [["over", "Overdue", d => d < 0, P("risk", "followups"), "Follow-up running"], ["w0", "This week", d => d >= 0 && d < 7, P("risk", "predict"), "Due in 0–6 days"],
  ["w1", "Next week", d => d >= 7 && d < 14, P("risk", "predict"), "Due in 7–13 days"], ["w2", "Week 3", d => d >= 14, P("risk", "predict"), "Due in 14+ days"]];
const tone = p => (p >= 80 ? "g3" : p >= 60 ? "g2" : p >= 40 ? "a1" : "r1");

function Heatmap({ pred, onCell, openSupplier, drill }) {
  const grid = useMemo(() => {
    const items = pred?.items || [], m = {};
    for (const it of items) {
      const w = WIN.find(([, , f]) => f(it.days_to_due))?.[0]; if (!w) continue;
      const row = (m[it.supplier_id] ||= { id: it.supplier_id, name: it.supplier_name, cells: {}, total: 0, value: 0 });
      (row.cells[w] ||= []).push(it); row.total++; row.value += it.value_inr || 0;
    }
    return Object.values(m).sort((a, b) => (b.cells.over?.length || 0) - (a.cells.over?.length || 0) || b.total - a.total).slice(0, 10);
  }, [pred]);
  const s = pred?.summary;
  return <section className="hc-card h4-heat">
    <div className="h4-ch"><span className="h4-ic r"><Gauge size={16} /></span><h3>Open orders by delivery window</h3>
      <span className="h4-tag r">Prediction model</span></div>
    <div className="h4-ht" role="table">
      <div className="h4-hr head" role="row"><span role="columnheader">Supplier</span>
        {WIN.map(([k, l, , t]) => <button key={k} role="columnheader" className={k === "over" ? "over" : ""} onClick={() => drill(t)} title={k === "over" ? "Open the follow-ups" : "Open the predictions"}><b>{l}</b></button>)}</div>
      {grid.map(r => <div className="h4-hr" role="row" key={r.id}>
        <button className="h4-hs" onClick={() => openSupplier(r.id)} title="Open supplier profile"><b>{r.name}</b></button>
        {WIN.map(([k]) => { const xs = r.cells[k] || [];
          if (!xs.length) return <span key={k} className="h4-c empty">–</span>;
          if (k === "over") return <button key={k} className="h4-c over" onClick={() => onCell(r, k, xs)}><b>{xs.length} late</b></button>;
          const p = Math.round(100 * (1 - xs.reduce((a, x) => a + x.p_late, 0) / xs.length));
          return <button key={k} className={`h4-c ${tone(p)}`} onClick={() => onCell(r, k, xs)} title={`${xs.length} lines, ${p}% average chance on time`}><b>{p}%</b></button>; })}
      </div>)}
    </div>
    {s && <button className="h4-hfoot" onClick={() => drill(P("risk", "predict"))}><Clock size={13} />
      <span><b className="r">{fmt(s.high_risk_open, 0)} lines at high risk</b> · <b className="a">{inr(s.value_at_risk_inr)} at risk</b></span><ArrowRight size={13} /></button>}
  </section>;
}

function CellPanel({ cell, fu, onClose, openSupplier, drill }) {
  const { row, win, xs } = cell, label = WIN.find(w => w[0] === win)[1];
  const fuBy = useMemo(() => Object.fromEntries((fu?.rows || []).filter(r => r.stage !== "CLOSED").map(r => [`${r.po_id}/${r.po_line}`, r])), [fu]);
  const STGL = { REQUESTED: "Supplier asked", REMINDED: "Reminder sent", ESCALATED: "Escalated", CONFIRMED: "New date confirmed" };
  const sorted = [...xs].sort((a, b) => b.p_late - a.p_late);
  return <SidePanel onClose={onClose} width={780} title={`${row.name}: ${label.toLowerCase()}`} sub={`${xs.length} order line(s)`}
    footer={<div className="hc-go"><button className="primary chip-btn" onClick={() => { onClose(); openSupplier(row.id); }}>Open supplier profile</button>
      <button className="ghost chip-btn" onClick={() => { onClose(); drill(win === "over" ? P("risk", "followups") : P("risk", "predict")); }}>{win === "over" ? "Open follow-ups" : "Open predictions"}</button></div>}>
    <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Order line</th><th>Material</th><th>Promised</th><th className="num">Late risk</th><th>Expected arrival</th><th>Agent</th></tr></thead>
      <tbody>{sorted.map(x => { const f = fuBy[`${x.po_id}/${x.po_line}`];
        return <tr key={x.po_id + x.po_line}><td>{x.po_id}/{x.po_line}</td><td>{x.material_name}</td><td>{x.promised_date}</td>
          <td className="num"><span className={`hc-risk ${x.risk_band}`}>{Math.round(x.p_late * 100)}%</span></td><td>{x.predicted_arrival}</td>
          <td>{f ? <span className="hc-fu">{STGL[f.stage]}{f.confirmed_date ? `: ${f.confirmed_date}` : ""}</span> : <span className="muted">watching</span>}</td></tr>; })}</tbody></table></div>
    {sorted[0]?.drivers?.length > 0 && <p className="muted" style={{ marginTop: 10, fontSize: 12.5 }}>Main reason for the riskiest line: {sorted[0].drivers[0].text}.</p>}
  </SidePanel>;
}

/* ------------------------------------------------------------ the selected stage, part or problem, explained */
function DetailPane({ sel, live, onStage, goBtns, drill, D, allowed, PR }) {
  let col, head, tone, what, steps, tech, tables, pills = [], btns, Icon, logoInfo, badge;
  if (sel.kind === "prob") {
    const p = PR.find(x => x.id === sel.id) || PR[0], i = PR.indexOf(p);
    Icon = p.icon; tone = `p-${p.tone}`; head = p.title; what = p.how; steps = p.steps; badge = [`Problem ${String(i + 1).padStart(2, "0")}`, "How the agent solves it"];
    pills = [p.proof]; btns = goBtns(p.go, p.goL);
  } else {
    col = COLS.find(x => x.id === (sel.kind === "chip" ? sel.col : sel.id)) || COLS[4];
    const ch = sel.kind === "chip" && col.chips.find(x => x[1] === sel.id), info = ch && CHIP[sel.id];
    tone = `t-${col.tone}`; badge = [`Stage ${col.n}`, col.title];
    if (info) {
      const [Fallback, title, , to] = ch; logoInfo = [info, Fallback]; head = title; what = info.what; steps = info.steps; tech = info.tech; tables = info.tables;
      pills = [LIVE[title]?.(D), live[col.id]?.[0]].filter(Boolean);
      btns = !(to.page && !allowed.includes(to.page)) && <button className="primary chip-btn" onClick={() => drill(to)}>{info.btn || "Inspect details"} <ArrowRight size={12} /></button>;
    } else {
      Icon = COLV[col.id].icon; head = `Stage ${col.n}: ${col.title}`; what = col.what; steps = col.steps; tech = col.tech; tables = col.tables;
      pills = [live[col.id]?.[0], ...col.chips.map(c => LIVE[c[1]]?.(D))].filter(Boolean).slice(0, 4);
      btns = goBtns(col.go, col.goL);
    }
  }
  const V = col && COLV[col.id];
  return <section className={`hc-card h4-detail ${tone}`}>
    <div className="h4-ch">
      {logoInfo ? <span className="h4-logo"><Logo c={logoInfo[0]} Fallback={logoInfo[1]} size={20} /></span> : <span className="h4-ic"><Icon size={16} /></span>}
      <h3 title={head}>{head}</h3><span className="h4-badge">{badge[0]}</span><span className="h4-tag">{badge[1]}</span></div>
    <div className="h4-dbody">
      <p className="h4-what">{what}</p>
      {tech && <div className="h4-tech"><div><span>Technology</span>{tech}</div><div><span>Data tables</span><code>{tables}</code></div></div>}
      {V && <div className="h4-io"><div><em className="in">Incoming</em>{V.in}</div><div><em className="out">Outgoing</em>{V.out}</div></div>}
      {pills.length > 0 && <div className="h4-pills">{pills.map(x => <span key={x}><i />{withNeon(x)}</span>)}</div>}
      <h4>Execution logic</h4>
      <ol className="h4-steps">{steps.map(s => <li key={s}>{s}</li>)}</ol>
    </div>
    <div className="h4-dfoot"><span><i /> Architecture node: <b>live</b> · Neon PostgreSQL</span>
      <span className="h4-dbtn">{btns}{col && <button className="ghost chip-btn" onClick={() => onStage(col.stage)}>Full stage page <ArrowRight size={12} /></button>}</span></div>
  </section>;
}

/* ------------------------------------------------------------ page */
export default function HomeCommand({ L, S, statusOf, onStage, nav, allowed, openSupplier, ask }) {
  // the design canvas (1500 design px wide) is scaled to the window width: same look at any zoom; the page may scroll
  const DESIGN_H = 990, DESIGN_W = 1500, MIN_W = 1240, outer = useRef(null);
  const [fit, setFit] = useState({ ok: true, s: 1, w: 0 });
  useLayoutEffect(() => {
    const el = outer.current; if (!el) return undefined;
    const calc = () => {
      const W = el.clientWidth;
      let sc = Math.min(W / DESIGN_W, 1.25);
      if (W / sc < MIN_W) sc = W / MIN_W;
      const ok = sc >= 0.6;
      setFit(f => (f.ok === ok && Math.abs(f.s - sc) < 0.002 && Math.abs(f.w - W / sc) < 1 ? f : { ok, s: ok ? sc : 1, w: ok ? W / sc : W }));
    };
    calc();
    const ro = new ResizeObserver(calc); ro.observe(el); window.addEventListener("resize", calc);
    return () => { ro.disconnect(); window.removeEventListener("resize", calc); };
  }, []);
  const scaled = fit.ok;
  // the selected column / part / problem survives a drill-through and the Back button
  const [sel, setSelState] = useState(() => { try { return JSON.parse(sessionStorage.getItem("home.sel")) || { kind: "col", id: "outputs" }; } catch { return { kind: "col", id: "outputs" }; } });
  const setSel = v => { setSelState(v); try { sessionStorage.setItem("home.sel", JSON.stringify(v)); } catch { /* storage unavailable */ } };
  const [cell, setCell] = useState(null);
  const pred = useLoad(() => api.predLate().catch(() => null), []);
  const ov = useLoad(() => api.overview({}).catch(() => null), []);
  const D = { alerts: L.alerts.data, fu: L.fu.data, ready: L.ready.data, pred: pred.data, ov: ov.data, S };
  const PR = useMemo(() => problems(D), [L.alerts.data, L.fu.data, L.ready.data, pred.data]); // eslint-disable-line react-hooks/exhaustive-deps
  const live = Object.fromEntries(COLS.map(c => [c.id, statusOf(c.stage === "etl" ? "scheduler" : c.stage, S)]));
  const drill = t => {
    if (!t) return;
    if (t.stage) return onStage(t.stage);
    if (t.ask) return ask?.(t.ask);
    if (!allowed.includes(t.page)) return;
    if (t.tab) { try { sessionStorage.setItem("rr.tab", t.tab); } catch { /* storage unavailable */ } }
    nav(t.page);
  };
  const goBtns = (ts, ls) => ts.map((t, i) => (t.page && !allowed.includes(t.page) ? null :
    <button key={i} className={i ? "ghost chip-btn" : "primary chip-btn"} onClick={() => drill(t)}>{ls[i]} <ArrowRight size={12} /></button>));

  return <div ref={outer} className="hc-outer" style={scaled ? { height: DESIGN_H * fit.s } : undefined}>
  <div className={"hc h4" + (fit.ok ? " fit" : " nofit")} style={scaled ? { width: fit.w, height: DESIGN_H, transform: `scale(${fit.s})` } : undefined}>

    <div className="h4-row top">
      <section className="hc-card h4-arch">
        <div className="h4-ch"><span className="h4-ic"><Workflow size={16} /></span><h3>System architecture pipeline</h3>
          <span className="h4-hint">Click any stage or item to inspect it below <ArrowRight size={13} /></span>
          <span className="h4-live"><i /> Live · data as of {S.db?.cov?.as_of_date || "…"}</span></div>
        <div className="h4-cols">{COLS.map((c, i) => { const V = COLV[c.id], H = V.icon, colOn = sel.kind === "col" && sel.id === c.id, inCol = sel.kind === "chip" && sel.col === c.id;
          return <Fragment key={c.id}>
          <div className={`h4-col t-${c.tone}` + (colOn || inCol ? " on" : "") + (c.key ? " key" : "")}>
            <button className="h4-colh" onClick={() => setSel({ kind: "col", id: c.id })} aria-pressed={colOn}>
              <H size={22} strokeWidth={2} aria-hidden className="h4-hic" /><b>{c.n}. {c.title}</b><em>{withNeon(V.sub, true)}</em>
              {V.flow && c.id !== "integration" && <span className="h4-hflow">{V.flow.map((f, k) => <Fragment key={f}>{k > 0 && <ArrowRight size={10} aria-hidden />}<span>{f}</span></Fragment>)}</span>}
              {c.key && <span className="h4-key">Key layer</span>}</button>
            {c.id === "integration" || c.id === "outputs" ? <Showcase c={c} kind={c.id === "integration" ? "gateway" : "bi"} sel={sel} setSel={setSel} D={D} /> : <div className="h4-items">
              {c.chips.map(([I, t]) => { const info = CHIP[t] || {}, on = sel.kind === "chip" && sel.id === t;
                return <button key={t} className={"h4-item" + (on ? " on" : "") + (info.logo || info.mark ? " brand" : "") + (info.conn ? " conn" : "")} aria-pressed={on}
                  onClick={() => setSel({ kind: "chip", col: c.id, id: t })} title={`${t}: how it works`}>
                  <span className="h4-tile"><Logo c={info} Fallback={I} size={info.mark ? 24 : 20} />{info.conn && <i className="h4-conn" title="Connected" />}</span>
                  <span className="h4-it"><b>{t}</b><em>{withNeon(subOf(t, D))}</em></span></button>; })}
            </div>}
          </div>
          {i < COLS.length - 1 && <span className="h4-arrow" aria-hidden><ChevronRight size={20} strokeWidth={2.4} /></span>}
          </Fragment>; })}</div>
      </section>

      <section className="hc-card h4-probs">
        <div className="h4-ch"><span className="h4-ic r"><AlertTriangle size={16} /></span><h3>Problems solved</h3><span className="h4-tag r">{PR.length} problems</span></div>
        <ol>{PR.map((p, i) => <li key={p.id}><button className={`h4-prob p-${p.tone}` + (sel.kind === "prob" && sel.id === p.id ? " on" : "")} onClick={() => setSel({ kind: "prob", id: p.id })}>
          <span className="h4-pt"><b><i>{String(i + 1).padStart(2, "0")}</i> {p.title}</b><em>{p.proof}</em></span><span className="h4-pi"><p.icon size={17} /></span></button></li>)}</ol>
      </section>
    </div>

    <div className="h4-row bottom">
      <DetailPane sel={sel} live={live} onStage={onStage} goBtns={goBtns} drill={drill} D={D} allowed={allowed} PR={PR} />
      <Heatmap pred={pred.data} onCell={(row, win, xs) => setCell({ row, win, xs })} openSupplier={openSupplier} drill={drill} />
    </div>
  </div>
    {cell && <CellPanel cell={cell} fu={L.fu.data} onClose={() => setCell(null)} openSupplier={openSupplier} drill={drill} />}
  </div>;
}
