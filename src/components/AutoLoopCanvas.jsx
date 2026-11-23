// Agent Architecture > "Autonomous loop": the work the agent does on its own, on a schedule, inside rules people approved.
// Same node-graph look as the ask-flow canvas (workflow.css). Every node carries live figures; click one to inspect it.
//   Scheduler -> Watch (8 detectors + late-risk prediction) -> Policy (approved limits) -> four actions -> a person approves -> loop closes
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, BrainCircuit, CheckCircle2, ClipboardCheck, Clock, MousePointerClick, Radar, Scale, Search, Send, ShieldCheck, UserCheck, X } from "lucide-react";
import { api } from "../api";
import { useLoad } from "../util";
import "../workflow.css";

const TONE = { blue: "#4d8eeb", purple: "#9d6ff0", orange: "#f58a3a", green: "#19b394", navy: "#6c8cff", red: "#ef5b6b", teal: "#22b8cf" };
const NH = 62;
const n0 = v => (v == null ? "–" : Number(v).toLocaleString("en-IN", { maximumFractionDigits: 0 }));

function useWidth(ref) {
  const [w, setW] = useState(1100);
  useLayoutEffect(() => {
    if (!ref.current) return undefined;
    const ro = new ResizeObserver(([e]) => setW(Math.max(760, e.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, [ref]);
  return w;
}

export default function AutoLoopCanvas({ role, nav }) {
  const canSource = ["ADMIN", "PROCUREMENT"].includes(role);
  const fu = useLoad(() => api.followups().catch(() => null), []);
  const al = useLoad(() => api.alerts().catch(() => null), []);
  const pr = useLoad(() => api.predLate().catch(() => null), []);
  const ca = useLoad(() => api.actions().catch(() => null), []);
  const sr = useLoad(() => (canSource ? api.sourcingReviews().catch(() => null) : Promise.resolve(null)), [canSource]);
  const wrap = useRef();
  const W = useWidth(wrap);
  const [sel, setSel] = useState(null);

  const nodes = useMemo(() => {
    const b = fu.data?.by_stage || {}, pol = fu.data?.policy || {}, last = fu.data?.last_run;
    const open = ["REQUESTED", "REMINDED", "ESCALATED", "CONFIRMED"].reduce((s, k) => s + (b[k] || 0), 0);
    const alerts = al.data || [], crit = alerts.filter(a => a.severity === "CRITICAL").length;
    const acts = Array.isArray(ca.data) ? ca.data : ca.data?.rows || ca.data?.actions || [];
    const proposed = acts.filter(a => a.status === "PROPOSED").length;
    const ps = pr.data?.summary;
    return [
      { id: "sched", col: 0, icon: Clock, tone: "blue", title: "Scheduler", sub: last ? `Last run ${String(last.started_at).slice(11, 16)}` : "Every cycle",
        desc: "A scheduler job wakes the agent every cycle. Nobody has to ask: it checks every open order line and every supplier on its own.",
        tel: last ? `Last follow-up run: ${String(last.started_at).slice(0, 16).replace("T", " ")} · ${last.status}${last.detail ? ` · ${last.detail}` : ""}` : "Waiting for the first run" },
      { id: "detect", col: 1, row: 0, rows: 2, icon: Radar, tone: "orange", title: "8 risk detectors", sub: `${n0(alerts.length)} alerts · ${n0(crit)} critical`,
        desc: "Rule detectors watch for late supply, line stops, repeat defects, overdue CAPA, concentration and more. Each alert carries its evidence.",
        tel: `${n0(alerts.length)} open alerts, ${n0(crit)} critical.`, go: ["risk", "alerts"] },
      { id: "predict", col: 1, row: 1, rows: 2, icon: BrainCircuit, tone: "purple", title: "Late-risk prediction", sub: ps ? `${n0(ps.high_risk_open)} lines at high risk` : "Scores open lines",
        desc: "A model scores every open order line for its chance of arriving late, with the reasons, so action starts before the date is missed.",
        tel: ps ? `${n0(ps.high_risk_open)} open lines at high risk; value at risk ₹${n0(ps.value_at_risk_inr)}.` : "", go: ["risk", "predict"] },
      { id: "policy", col: 2, icon: Scale, tone: "navy", title: "Policy rules", sub: `Reply ${pol.followup_reply_hours ?? 24} h · escalate ${pol.followup_escalate_hours ?? 48} h`,
        desc: "The agent only acts inside limits people approved in Settings. Anything outside them goes to a person.",
        tel: `Supplier reply window ${pol.followup_reply_hours ?? 24} h; escalate to the buyer at ${pol.followup_escalate_hours ?? 48} h; auto-approve date changes of ${pol.auto_approve_days ?? 3} day(s) or less asked in time.` },
      { id: "fu", col: 3, row: 0, rows: 4, icon: Send, tone: "teal", title: "Supplier follow-up", sub: `${n0(open)} late lines asked`,
        desc: "For every late line the agent asks the supplier, in its portal, for a new date and a reason. Suppliers are never e-mailed automatically.",
        tel: `Asked ${n0(b.REQUESTED || 0)} · reminded ${n0(b.REMINDED || 0)} · confirmed ${n0(b.CONFIRMED || 0)} · closed ${n0(b.CLOSED || 0)}.`, go: ["risk", "followups"] },
      { id: "esc", col: 3, row: 1, rows: 4, icon: AlertTriangle, tone: "red", title: "Escalation", sub: `${n0(b.ESCALATED || 0)} to buyers`,
        desc: "No answer within the escalation window: the line goes to the buyer's list with its history.", tel: `${n0(b.ESCALATED || 0)} lines escalated to procurement.`, go: ["risk", "followups"] },
      { id: "ca", col: 3, row: 2, rows: 4, icon: ClipboardCheck, tone: "orange", title: "Corrective action", sub: `${n0(proposed)} drafts to approve`,
        desc: "Repeat problems become a drafted corrective action with the evidence, waiting for a person to approve it.", tel: `${n0(proposed)} proposed action(s) waiting for approval.`, go: ["risk", "actions"] },
      { id: "sr", col: 3, row: 3, rows: 4, icon: Search, tone: "purple", title: "Sourcing review", sub: canSource ? (sr.data ? `${n0(sr.data.count)} cases · ${n0(sr.data.high)} high` : "Loading…") : "Procurement only",
        desc: "When a supplier keeps failing on a material, the agent compares qualified alternatives and suggests a trial share. Procurement decides.",
        tel: canSource && sr.data ? `${n0(sr.data.count)} sourcing cases, ${n0(sr.data.high)} high priority.` : "Visible to procurement and admins.", go: canSource ? ["risk", "sourcing"] : null },
      { id: "human", col: 4, icon: UserCheck, tone: "green", title: "Person approves", sub: "Approve · reject · edit",
        desc: "Nothing that changes a supplier relationship happens without a person: corrective actions, sourcing switches and large date changes need approval.",
        tel: `${n0(proposed)} item(s) waiting in the approval queue.`, go: ["risk", "actions"] },
      { id: "close", col: 5, icon: CheckCircle2, tone: "green", title: "Loop closes", sub: `${n0(b.CLOSED || 0)} closed on arrival`,
        desc: "Answers are recorded, the buyer is told, every step goes to the audit log, and a follow-up closes itself when the goods arrive.",
        tel: `${n0(b.CLOSED || 0)} follow-ups closed; every action is in the audit log.` },
    ];
  }, [fu.data, al.data, pr.data, ca.data, sr.data, canSource]);

  const edges = [["sched", "detect"], ["sched", "predict"], ["detect", "policy"], ["predict", "policy"],
    ["policy", "fu"], ["policy", "esc"], ["policy", "ca"], ["policy", "sr"], ["fu", "close"], ["esc", "human"], ["ca", "human"], ["sr", "human"], ["human", "close"]];
  const H = 400;
  const NW = Math.round(Math.min(190, Math.max(140, (W - 40) / 6 - 26)));
  const padX = NW / 2 + 20, colW = (W - padX * 2) / 5;
  const pos = n => ({ x: padX + n.col * colW, y: n.rows ? H / 2 + (n.row - (n.rows - 1) / 2) * (n.rows > 2 ? 80 : 110) : H / 2 });
  const byId = Object.fromEntries(nodes.map(n => [n.id, n]));
  const focus = byId[sel] || null;
  const loading = fu.loading || al.loading;

  return (
    <div className="wf al-loop">
      <div className="wf-canvas" ref={wrap} style={{ height: H }}>
        <div className="wf-grid" />
        <svg className="wf-svg" width={W} height={H}>
          <defs>
            <linearGradient id="al-done" x1="0" x2="1"><stop offset="0" stopColor="#19b394" /><stop offset="1" stopColor="#4d8eeb" /></linearGradient>
            <filter id="al-glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
          </defs>
          {edges.map(([a, b], k) => {
            const s = byId[a], d = byId[b], p1 = pos(s), p2 = pos(d);
            const x1 = p1.x + NW / 2, x2 = p2.x - NW / 2, mx = (x1 + x2) / 2;
            const path = `M${x1},${p1.y} C${mx},${p1.y} ${mx},${p2.y} ${x2},${p2.y}`;
            return <g key={a + b} className="wf-edge e-done">
              <path d={path} className="wf-edge-bg" />
              <path d={path} stroke="url(#al-done)" className="wf-edge-on" />
              {!loading && <circle r="3.5" fill={TONE[d.tone]} filter="url(#al-glow)"><animateMotion dur="3.2s" begin={`${(k % 5) * 0.6}s`} repeatCount="indefinite" path={path} /></circle>}
              <circle cx={x2} cy={p2.y} r="3.5" className="wf-port done" />
            </g>;
          })}
        </svg>
        {nodes.map(n => {
          const { x, y } = pos(n), I = n.icon;
          return <motion.button key={n.id} className={`wf-node s-done${sel === n.id ? " sel" : ""}`} initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }}
            style={{ left: x - NW / 2, top: y - NH / 2, width: NW, height: NH, "--tone": TONE[n.tone] }} onClick={() => setSel(sel === n.id ? null : n.id)} title={n.title}>
            <span className="wf-ic"><I size={17} /></span>
            <span className="wf-txt"><b>{n.title}</b><em>{n.sub}</em></span>
          </motion.button>;
        })}
        <div className="wf-cols">{["Trigger", "Watch", "Decide", "Act", "Approve", "Close the loop"].map((t, i) => <span key={t} style={{ left: padX + i * colW }}>{t}</span>)}</div>
        <div className="wf-hud">
          <span className="live"><i />Running on its own</span>
          <span><ShieldCheck size={12} /> Inside approved rules</span>
        </div>
        {!focus && <div className="wf-tip"><MousePointerClick size={12} /> Click any node to inspect it</div>}
        <AnimatePresence>
          {focus && <motion.aside className="wf-insp" initial={{ x: 40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 40, opacity: 0 }}>
            <header style={{ "--tone": TONE[focus.tone] }}>
              <span className="wf-ic"><focus.icon size={16} /></span>
              <div><b>{focus.title}</b><em>{focus.sub}</em></div>
              <button onClick={() => setSel(null)} aria-label="Close inspector"><X size={14} /></button>
            </header>
            <p>{focus.desc}</p>
            {focus.tel && <div className="wf-tel">{focus.tel}</div>}
            {focus.go && nav && <button className="al-open" onClick={() => { try { sessionStorage.setItem("rr.tab", focus.go[1]); } catch { /* storage unavailable */ } nav(focus.go[0]); }}>Open in Risk Radar</button>}
          </motion.aside>}
        </AnimatePresence>
      </div>
    </div>
  );
}
