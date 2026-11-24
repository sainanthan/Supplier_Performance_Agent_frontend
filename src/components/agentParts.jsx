// Shared description of every part of the agent system (agents, models, rule engines, jobs, people), with live figures.
// Used by the Agent Flow board on the Agent Architecture page: useAgentParts() builds the parts, PartCard shows one of them.
import { useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity, ArrowRight, Bell, Bot, BrainCircuit, CalendarClock, ClipboardCheck, CloudLightning, Database, FileSearch, Gauge, GitBranch, Hand, History,
  LineChart, MessageSquare, Network, Play, Radar, RotateCcw, Scale, ScrollText, Search, Send, ShieldCheck, Sigma, Sparkle, Truck, UserCheck, Users, X,
} from "lucide-react";
import { api } from "../api";
import { useLoad } from "../util";

export const TONE = { blue: "#4d8eeb", purple: "#9d6ff0", orange: "#f58a3a", green: "#19b394", navy: "#6c8cff", red: "#ef5b6b", teal: "#22b8cf", amber: "#f5a524" };
export const KIND = { llm: "LLM agent", ml: "ML model", stats: "Statistics", rules: "Rule engine", sql: "SQL views", sim: "Simulation", job: "Scheduled job",
  feed: "Live feeds", tools: "Tool agents", check: "Checker", person: "Person", record: "Record" };
export const WHEN = {
  sched: { icon: CalendarClock, label: "On a schedule" },
  ask: { icon: MessageSquare, label: "When someone asks" },
  person: { icon: Hand, label: "A person decides" },
  stream: { icon: Activity, label: "As data arrives" },
};
const n0 = v => (v == null || Number.isNaN(Number(v)) ? "–" : Number(v).toLocaleString("en-IN", { maximumFractionDigits: 0 }));
const hhmm = iso => (iso ? new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "");


export function useAgentParts(cat, role) {
  const canSource = ["ADMIN", "PROCUREMENT"].includes(role);
  const jobs = useLoad(() => api.jobs().catch(() => null), []);
  const ready = useLoad(() => api.dataReadiness().catch(() => null), []);
  const fu = useLoad(() => api.followups().catch(() => null), []);
  const al = useLoad(() => api.alerts().catch(() => null), []);
  const pm = useLoad(() => api.predModel().catch(() => null), []);
  const pr = useLoad(() => api.predLate().catch(() => null), []);
  const ds = useLoad(() => api.disruptions().catch(() => null), []);
  const qi = useLoad(() => api.qiList().catch(() => null), []);
  const ca = useLoad(() => api.actions().catch(() => null), []);
  const sr = useLoad(() => (canSource ? api.sourcingReviews().catch(() => null) : Promise.resolve(null)), [canSource]);

  const nodes = useMemo(() => {
    const runs = jobs.data?.runs || [];
    const last = name => { const r = runs.find(x => x.job === name); return r ? `Last run ${hhmm(r.started_at)} · ${r.status === "OK" ? "OK" : r.status.toLowerCase()}` : "Waiting for first run"; };
    const every = jobs.data?.schedule_minutes;
    const b = fu.data?.by_stage || {}, open = ["REQUESTED", "REMINDED", "ESCALATED", "CONFIRMED"].reduce((s, k) => s + (b[k] || 0), 0);
    const alerts = Array.isArray(al.data) ? al.data : al.data?.alerts || [], crit = alerts.filter(a => a.severity === "CRITICAL").length;
    const acts = Array.isArray(ca.data) ? ca.data : ca.data?.rows || ca.data?.actions || [], proposed = acts.filter(a => a.status === "PROPOSED").length;
    const ps = pr.data?.summary, ho = pm.data?.metrics?.holdout;
    const qis = qi.data?.items || [], qiDraft = qis.filter(x => x.status === "DRAFT").length;
    const ev = ds.data?.events || [];
    const ag = cat?.agents || {}, tl = cat?.tools || {};
    const specs = Object.entries(ag).filter(([k]) => !["orchestrator", "validator"].includes(k));
    const rd = ready.data;
    return [
      // parts that only exist on the flow board
      { id: "trigger", st: 0, icon: Play, tone: "green", kind: "job", when: "sched", title: "Trigger", sub: every ? `Question or every ${every} min` : "Question or schedule",
        does: "Two things start the agents: a person asks a question (in the chat or on this page), or the scheduler wakes them every cycle to check every open order line and every supplier on their own.",
        runs: `Every cycle${every ? ` (${every} min)` : ""}, and whenever someone asks.`, reads: ["Your question", "Scheduler clock"], makes: ["A run of the pipeline"],
        person: "Anyone with access can ask; admins set the cycle length.", live: last("followups"), feeds: [], go: ["settings", "data", "Open Data & jobs"] },
      { id: "watch", st: 2, icon: Radar, tone: "orange", kind: "rules", when: "sched", title: "Watch & predict", sub: al.data ? `${n0(alerts.length)} alerts · ${n0(ps?.high_risk_open)} high-risk lines` : "Detectors and models",
        does: "Runs five watchers on the fresh KPIs: rule detectors, the late-delivery model, the 30-day forecast, the quality early-warning chart and the disruption monitor. What they find becomes context for the AI agent and triggers the actions.",
        runs: "Every cycle, after the KPI views refresh.", reads: ["KPI views", "Scorecard", "Live feeds"], makes: ["Alerts", "Predictions", "Early warnings", "Disruption events"],
        person: "Owners review what is flagged.", live: al.data ? `${n0(alerts.length)} open alerts, ${n0(crit)} critical` : "", feeds: [], go: ["risk", "alerts", "Open Risk Radar"] },
      { id: "llm", st: 3, icon: Sparkle, tone: "purple", kind: "llm", when: "ask", title: "Domo LLM", sub: "Chat model",
        does: "The language model behind the orchestrator, called through Domo AI with LangChain. It plans the next tool call and writes the answer; it never queries the database itself.",
        runs: "Once per planning step of every question.", reads: ["Question", "History", "Tool results"], makes: ["Next tool to call", "Answer text"],
        person: "No source data is sent without approval; only tool results for the question.", live: "", feeds: [], go: ["__ask", null, "Run the pipeline"] },
      { id: "mem", st: 3, icon: History, tone: "purple", kind: "record", when: "ask", title: "Memory", sub: "Conversation history",
        does: "Keeps each conversation, its answers and the full tool trace, so follow-up questions understand what was asked before and every answer can be replayed.",
        runs: "On every question.", reads: ["Earlier messages"], makes: ["Saved conversation and trace"], person: "Each user sees only their own conversations.", live: "", feeds: [], go: null },
      { id: "answer", st: 4, icon: Bot, tone: "navy", kind: "check", when: "ask", title: "Answer", sub: "With drill-through links",
        does: "The verified answer, its charts and links to the suppliers and pages behind every figure are shown to the person who asked and saved with the conversation.",
        runs: "At the end of every question.", reads: ["Verified answer"], makes: ["Answer on screen", "Saved conversation"], person: "The reader follows the links to check or act.", live: "", feeds: [], go: null },
      // 1 Collect
      { id: "conn", st: 0, icon: Database, tone: "blue", kind: "job", when: "sched", title: "Source connectors", sub: rd ? `${rd.ready}/${rd.total} sources loaded` : "ERP · QMS · MES · portal",
        does: "Loads purchase orders and receipts (ERP), inspections and NCRs (QMS), downtime (MES) and supplier-portal replies into Neon PostgreSQL through read-only connections.",
        runs: `Every cycle${every ? ` (${every} min)` : ""}, plus on demand from Data Integration.`, reads: ["ERP purchase orders", "QMS inspections & NCR", "MES downtime", "Supplier portal"],
        makes: ["Neon schema sp (raw tables)"], person: "Admins add or change connectors; new production sources need approval.", live: last("refresh"),
        feeds: ["dq"], go: ["integration", null, "Open Data Integration"] },
      { id: "dq", st: 0, icon: ShieldCheck, tone: "blue", kind: "rules", when: "sched", title: "Data-quality checks", sub: last("integration_health"),
        does: "Watches every source load: healthy, stale (no fresh load in its window) or failing. Bad rows go to a quarantine queue, and admins are alerted when a source becomes stale or failing, and when it recovers.",
        runs: "Every 15 minutes.", reads: ["Loaded tables"], makes: ["Source health", "Quarantine queue", "Admin alerts"], person: "Admins fix or exclude a failing source.",
        live: rd ? `${rd.ready} of ${rd.total} required sources ready` : "", feeds: ["views"], go: ["settings", "data", "Open Data & jobs"] },
      { id: "roll", st: 0, icon: RotateCcw, tone: "blue", kind: "job", when: "sched", title: "Daily roll-forward", sub: last("roll_forward"),
        does: "Keeps the demo data current: each missing day is filled from the pattern four weeks earlier, so every page shows today's date.",
        runs: "First job of every cycle.", reads: ["Last 28 days of records"], makes: ["New dated rows (labelled ROLLING)"], person: "Turned on or off with the rolling demo data feature.",
        live: last("roll_forward"), feeds: ["views"], go: ["settings", "data", "Open Data & jobs"] },
      { id: "gpsin", st: 0, icon: Truck, tone: "blue", kind: "rules", when: "stream", title: "GPS position intake", sub: "Validated truck positions",
        does: "Receives positions from the driver's phone link, rejects ones outside the trip or at impossible speeds, and attaches them to the PO lines on board.",
        runs: "Every time a driver's phone sends a position.", reads: ["Driver phone link", "Active trips"], makes: ["Live truck positions", "Arrival estimates"],
        person: "Procurement registers trucks and starts trips.", live: last("gps_retention"), feeds: ["twin"], go: ["gps", null, "Open GPS Tracking"] },
      // 2 Measure
      { id: "views", st: 1, icon: Sigma, tone: "teal", kind: "sql", when: "sched", title: "KPI views on Neon", sub: "OTIF · PPM · lead time",
        does: "Governed SQL views compute delivery performance, incoming quality and defects attributed to the right supplier through the production order. Every page and every agent reads these same views.",
        runs: "Always current; refreshed with each load.", reads: ["sp raw tables"], makes: ["sp.v_po_delivery", "sp.v_defect_attribution", "sp.v_ncr_supplier", "sp.v_supply_disruption"],
        person: "KPI rules and exclusions are set in Settings.", live: last("refresh"), feeds: ["score", "twin", "detect", "late", "fcast", "qew", "spec"], go: ["trends", null, "Open OTIF / PPM Trends"] },
      { id: "score", st: 1, icon: Gauge, tone: "teal", kind: "rules", when: "sched", title: "Scorecard engine", sub: last("snapshot"),
        does: "Scores every supplier on delivery, quality, responsiveness and commercial terms with the weights you approved, and stores a snapshot each cycle for trends.",
        runs: "Every cycle (snapshot job).", reads: ["KPI views", "Scorecard weights"], makes: ["Grades and ranks", "Scorecard history"], person: "Weights are changed in Settings.",
        live: last("snapshot"), feeds: ["detect", "spec"], go: ["command", null, "Open Overview"] },
      { id: "twin", st: 1, icon: Network, tone: "teal", kind: "sim", when: "ask", title: "Network twin", sub: "Lanes, stock and Monte Carlo",
        does: "A live model of suppliers, lanes, ports and plants with stock on hand. Runs Monte Carlo what-if scenarios such as a port closure or a supplier stop.",
        runs: "Live on the Network Tracker; scenarios when someone runs one.", reads: ["KPI views", "Inventory", "Truck positions", "Disruption events"],
        makes: ["Arrivals and shortages", "Scenario impact on lines and customers"], person: "Planners pick and run scenarios.", live: "", feeds: ["spec"], go: ["tracker", null, "Open Network Tracker"] },
      // 3 Watch & predict
      { id: "detect", st: 2, icon: Radar, tone: "orange", kind: "rules", when: "sched", title: "8 risk detectors", sub: al.data ? `${n0(alerts.length)} alerts · ${n0(crit)} critical` : "Past-due, defects, CAPA…",
        does: "Rule detectors for past-due supply, repeated late delivery, falling OTIF, rising quality problems, repeated defects, overdue CAPA, single-source concentration and supply disruption. Each alert carries its evidence and a recommended action.",
        runs: "Every cycle (alerts and SLA jobs).", reads: ["KPI views", "Scorecard", "Disruption events"], makes: ["Risk alerts with evidence", "Owner notifications"],
        person: "Owners acknowledge, assign and resolve alerts.", live: al.data ? `${n0(alerts.length)} open alerts, ${n0(crit)} critical. ${last("alerts")}.` : last("alerts"),
        feeds: ["notify", "qi", "capa", "spec"], go: ["risk", "alerts", "Open Risk Radar alerts"] },
      { id: "late", st: 2, icon: BrainCircuit, tone: "orange", kind: "ml", when: "sched", title: "Late-delivery model", sub: ho ? `AUC ${ho.auc} · ${n0(ps?.high_risk_open)} high-risk lines` : "Scores open lines",
        does: "Logistic regression predicts each open line's chance of arriving late; ridge regression predicts by how many days. Every prediction lists its top three reasons in plain words.",
        runs: "Every cycle (predict job); retrained by an admin.", reads: ["Order history known at order time"], makes: ["Late probability per line", "Expected delay and arrival date"],
        person: "Buyers act on high-risk lines; predictions never change a KPI.",
        live: pm.data ? `Model ${pm.data.version} · trained on ${n0(pm.data.train_rows)} lines · holdout AUC ${ho?.auc ?? "–"} vs ${ho?.baseline_auc ?? "–"} baseline${ps ? ` · ₹${n0(ps.value_at_risk_inr)} at risk` : ""}` : last("predict"),
        feeds: ["spec", "fu"], go: ["risk", "predict", "Open Predictions"] },
      { id: "fcast", st: 2, icon: LineChart, tone: "orange", kind: "ml", when: "sched", title: "30-day supplier forecast", sub: "On-time outlook per supplier",
        does: "Expected on-time rate of each supplier's lines due in the next 30 days, compared with its last 60 days, so a slide shows before the month closes.",
        runs: "Every cycle with the predictions.", reads: ["Open lines", "Late-risk scores"], makes: ["Supplier on-time outlook"], person: "Procurement reviews suppliers trending down.",
        live: last("predict"), feeds: ["spec"], go: ["risk", "predict", "Open Predictions"] },
      { id: "qew", st: 2, icon: Activity, tone: "orange", kind: "stats", when: "sched", title: "Quality early warning", sub: "p-chart, 3-sigma limits",
        does: "Tracks the weekly rejection rate of every supplier and material against its own control limits and flags an unusual jump before it moves the monthly PPM.",
        runs: "Every cycle.", reads: ["Incoming inspections", "Defect attribution"], makes: ["Early-warning flags"], person: "Quality decides whether to ask the supplier.",
        live: "", feeds: ["qi", "spec"], go: ["risk", "predict", "Open Predictions"] },
      { id: "disr", st: 2, icon: CloudLightning, tone: "orange", kind: "feed", when: "sched", title: "Disruption monitor", sub: ds.data ? `${n0(ev.length)} events near the network` : "Weather, disasters, strikes",
        does: "Pulls cyclones, floods and earthquakes (GDACS) and heavy rain or wind (Open-Meteo) near ports and plants, plus strikes and closures entered by procurement.",
        runs: "Every cycle (disruptions job).", reads: ["GDACS", "Open-Meteo", "Manual events"], makes: ["Disruption events on the map"], person: "Procurement adds strikes and port congestion by hand.",
        live: ds.data?.last_refresh ? `${n0(ev.length)} events · refreshed ${hhmm(ds.data.last_refresh.at)} · ${ds.data.last_refresh.status}` : last("disruptions"),
        feeds: ["twin", "detect", "why"], go: ["tracker", null, "Open Network Tracker"] },
      // 4 Explain
      { id: "orch", st: 3, icon: BrainCircuit, tone: "purple", kind: "llm", when: "ask", title: "Orchestrator", sub: "Domo LLM via LangChain",
        does: "Reads the question, the chat history and the tool catalogue, decides which specialist to call next, and writes the final answer from their results.",
        runs: "Whenever someone asks in the chat or on this page.", reads: ["Question and history", "Tool catalogue"], makes: ["Plan of tool calls", "Draft answer"],
        person: "Anyone with access can ask; answers are advisory.", live: cat ? `${Object.keys(tl).length} governed tools available` : "",
        feeds: ["spec", "valid", "capa"], go: ["__ask", null, "Run it in the Ask flow"] },
      { id: "spec", st: 3, icon: Users, tone: "purple", kind: "tools", when: "ask", title: `${specs.length || 10} specialist analysts`, sub: "Read-only SQL on Neon",
        does: "Performance, trend, risk, quality, sourcing, forecasting, delay, simulation, safe-query and action specialists. Each runs approved, read-only queries on the KPI views and returns rows to the orchestrator.",
        runs: "Called by the orchestrator, one tool at a time.", reads: ["KPI views", "Predictions", "Twin"], makes: ["Tool results with row counts"],
        person: "Only SELECT on approved views; writes are proposals.", live: cat ? `${specs.length} specialists · ${Object.keys(tl).length} tools` : "",
        team: specs.map(([k, a]) => ({ name: a.name, does: a.does, tools: Object.entries(tl).filter(([, t]) => t.agent === k).map(([n]) => n) })),
        feeds: ["valid", "src"], go: ["__ask", null, "Run it in the Ask flow"] },
      { id: "why", st: 3, icon: FileSearch, tone: "purple", kind: "rules", when: "ask", title: "Delay investigator", sub: "Why is this delivery late?",
        does: "For a late delivery, finds where the time was lost (supplier, dispatch, transit, customs), the root cause with its evidence, the impact on lines, and the next actions.",
        runs: "When someone opens “Why late?” or asks the agent.", reads: ["Delay events", "Milestones", "Disruption events"], makes: ["Delay explanation", "Delay-cause Pareto"],
        person: "Buyers use it to talk to the supplier.", live: "", feeds: ["spec"], go: ["risk", "alerts", "Open Risk Radar"] },
      { id: "valid", st: 3, icon: ShieldCheck, tone: "purple", kind: "check", when: "ask", title: "Grounding validator", sub: "Every figure checked",
        does: "Matches every number in the draft answer against the tool results. If a figure is not in the data, the agent is sent back once to correct it; anything still unmatched is flagged.",
        runs: "Before every answer is shown.", reads: ["Draft answer", "Tool results"], makes: ["Verified answer", "Unverified-figure flags"], person: "Readers see which figures were checked.",
        live: "", feeds: ["notify"], go: ["__ask", null, "Run it in the Ask flow"] },
      // 5 Act
      { id: "fu", st: 4, icon: Send, tone: "red", kind: "job", when: "sched", title: "Supplier follow-up", sub: fu.data ? `${n0(open)} late lines asked` : "Ask, remind, escalate",
        does: "For every late order line it asks the supplier in its portal for a new date and a reason, reminds after the reply window, escalates to the buyer, and closes when goods arrive.",
        runs: "Every cycle (follow-ups job).", reads: ["Late PO lines", "Supplier replies", "Follow-up policy"], makes: ["Portal requests", "Escalations", "Expected dates"],
        person: "Buyers handle escalations; small date changes are auto-approved within policy.",
        live: fu.data ? `Asked ${n0(b.REQUESTED || 0)} · reminded ${n0(b.REMINDED || 0)} · escalated ${n0(b.ESCALATED || 0)} · closed ${n0(b.CLOSED || 0)}` : last("followups"),
        feeds: ["human", "audit"], go: ["risk", "followups", "Open Follow-ups"] },
      { id: "qi", st: 4, icon: Search, tone: "red", kind: "job", when: "sched", title: "Quality inquiry", sub: qi.data ? `${n0(qis.length)} inquiries · ${n0(qiDraft)} drafts` : "Ask the supplier why",
        does: "When a supplier's material shows poor quality, drafts an inquiry with the evidence asking for the root cause, containment and corrective action.",
        runs: "Every cycle from quality alerts, or when the agent is asked.", reads: ["Quality alerts", "Defect attribution"], makes: ["Inquiry drafts", "Supplier reply link"],
        person: "Quality reviews and clicks Send, then accepts or closes the answer.", live: last("quality_inquiries"), feeds: ["human"], go: ["risk", "alerts", "Open Risk Radar"] },
      { id: "capa", st: 4, icon: ClipboardCheck, tone: "red", kind: "llm", when: "ask", title: "Corrective actions", sub: ca.data ? `${n0(proposed)} proposals to approve` : "8D / CAPA drafts",
        does: "Turns repeat problems into a proposed corrective action or 8D/CAPA request with the evidence attached, ready for a person to approve.",
        runs: "When the agent proposes one, or a person creates it.", reads: ["Alerts", "Defects", "NCR / CAPA history"], makes: ["Proposed actions (status PROPOSED)"],
        person: "Owners approve, assign and close actions.", live: ca.data ? `${n0(proposed)} proposed · ${n0(acts.length)} in the tracker` : "", feeds: ["human"], go: ["risk", "actions", "Open Actions"] },
      { id: "src", st: 4, icon: Scale, tone: "red", kind: "rules", when: "sched", title: "Sourcing advisor", sub: canSource ? (sr.data ? `${n0(sr.data.count)} cases · ${n0(sr.data.high)} high` : "Switch suggestions") : "Procurement only",
        does: "When a supplier keeps failing on a material, compares qualified alternatives on delivery, quality and price, and suggests a trial share of volume.",
        runs: "Every cycle and when asked.", reads: ["Material share", "Delivery and defects", "RFQ quotes"], makes: ["Sourcing case with a trial share"],
        person: "Procurement decides whether to move volume.", live: canSource && sr.data ? `${n0(sr.data.count)} cases, ${n0(sr.data.high)} high priority` : "Visible to procurement and admins",
        feeds: ["human"], go: canSource ? ["risk", "sourcing", "Open Sourcing reviews"] : null },
      { id: "notify", st: 4, icon: Bell, tone: "red", kind: "job", when: "sched", title: "Alerts & digest", sub: jobs.data?.channels ? `In-app${jobs.data.channels.email ? " · e-mail" : ""}${jobs.data.channels.teams ? " · Teams" : ""}` : "Owners told",
        does: "Sends critical and high alerts to the owning team, chases overdue items (SLA) and compiles a weekly digest. Verified chat answers can be sent as an HTML alert.",
        runs: "Every cycle (alerts, SLA) and weekly (digest).", reads: ["Alerts", "Verified answers"], makes: ["In-app notifications", "E-mail / Teams when configured"],
        person: "Owners read and act; nothing goes to suppliers automatically.", live: last("sla"), feeds: ["human"], go: ["risk", "alerts", "Open Risk Radar alerts"] },
      // 6 Approve & learn
      { id: "human", st: 5, icon: UserCheck, tone: "green", kind: "person", when: "person", title: "Person approves", sub: ca.data ? `${n0(proposed)} waiting` : "Approve · edit · reject",
        does: "Every draft that touches a supplier — corrective actions, quality inquiries, sourcing switches, large date changes — waits for a person.",
        runs: "Whenever an owner opens the queue.", reads: ["Drafts with evidence"], makes: ["Approved, edited or rejected decisions"], person: "This is the person.",
        live: ca.data ? `${n0(proposed)} item(s) in the approval queue` : "", feeds: ["audit"], go: ["risk", "actions", "Open Actions"] },
      { id: "audit", st: 5, icon: ScrollText, tone: "green", kind: "record", when: "sched", title: "Audit & outcomes", sub: fu.data ? `${n0(b.CLOSED || 0)} follow-ups closed` : "Every step recorded",
        does: "Every create, edit, send and approval is in the audit log; every model version and prediction is stored. Arrivals close follow-ups, and outcomes become training data for the next model.",
        runs: "Continuously.", reads: ["All actions", "Arrivals", "Predictions"], makes: ["Audit log", "Scorecard history", "Next model version"],
        person: "Admins review the log.", live: last("snapshot"), feeds: [], go: ["settings", "data", "Open Data & jobs"] },
    ];
  }, [jobs.data, ready.data, fu.data, al.data, pm.data, pr.data, ds.data, qi.data, ca.data, sr.data, cat, canSource]);
  const byId = useMemo(() => Object.fromEntries(nodes.map(n => [n.id, n])), [nodes]);
  const runs = jobs.data?.runs || [], every = jobs.data?.schedule_minutes || 60;
  const lastAt = runs[0]?.started_at ? new Date(runs[0].started_at).getTime() : 0;
  const active = !!lastAt && Date.now() - lastAt < every * 2.5 * 60000;
  return { nodes, byId, scheduler: { every, active, lastAt } };
}

/** details of one part: what it does, when it runs, reads / produces, a person's role, live figure, links */
export function PartCard({ part, ups = [], downs = [], byId, onSelect, onOpen, onClose, status, tag }) {
  return (
    <AnimatePresence mode="wait">
      {part && <motion.article key={part.id} className="aj-detail" style={{ "--tone": TONE[part.tone] }} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }}>
        <header>
          <span className="wf-ic"><part.icon size={18} /></span>
          <div className="aj-dh">
            <b>{tag && <em className="fb-now">{tag}</em>}{part.title}</b>
            <span><em className={`aj-kind k-${part.kind}`}>{KIND[part.kind]}</em><em className="aj-when"><WhenIcon w={part.when} /> {WHEN[part.when].label}</em>
              {status && <em className="fb-status">{status}</em>}</span>
          </div>
          {part.go && onOpen && <button className="aj-go" onClick={() => onOpen(part.go)}>{part.go[2]} <ArrowRight size={13} /></button>}
          {onClose && <button className="aj-x" onClick={onClose} aria-label="Close details"><X size={15} /></button>}
        </header>
        <p className="aj-does">{part.does}</p>
        <div className="aj-grid">
          <div><h5><CalendarClock size={13} /> When it runs</h5><p>{part.runs}</p></div>
          <div><h5><Database size={13} /> Reads</h5><ul className="aj-chips">{part.reads.map(x => <li key={x}>{x}</li>)}</ul></div>
          <div><h5><GitBranch size={13} /> Produces</h5><ul className="aj-chips out">{part.makes.map(x => <li key={x}>{x}</li>)}</ul></div>
          <div><h5><Hand size={13} /> A person's role</h5><p>{part.person}</p></div>
        </div>
        {part.live && <div className="aj-live"><i /> <b>Live now</b> {part.live}</div>}
        {part.team && <div className="aj-team">
          {part.team.map(t => <div key={t.name}><b>{t.name}</b><span>{t.does}</span>{t.tools.length > 0 && <em>{t.tools.join(" · ")}</em>}</div>)}
        </div>}
        {onSelect && <div className="aj-links">
          {ups.length > 0 && <div><span>Gets input from</span>{ups.filter(id => byId[id]).map(id => <button key={id} onClick={() => onSelect(id)} style={{ "--tone": TONE[byId[id].tone] }}>{byId[id].title}</button>)}</div>}
          {downs.length > 0 && <div><span>Hands over to</span>{downs.filter(id => byId[id]).map(id => <button key={id} onClick={() => onSelect(id)} style={{ "--tone": TONE[byId[id].tone] }}>{byId[id].title}</button>)}</div>}
        </div>}
      </motion.article>}
    </AnimatePresence>
  );
}

function WhenIcon({ w }) { const I = WHEN[w].icon; return <I size={12} style={{ verticalAlign: "-2px" }} />; }
