import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, Bot, Brain, Check, Clock, Cpu, Database, Factory, Gauge, Inbox, Layers, Mail, MessageSquare, MousePointerClick,
  ShieldCheck, Sparkles, Wrench, X } from "lucide-react";
import "../workflow.css";

/* Premium node-graph view of one agent run (n8n / LangGraph-studio style).
   Nodes light up as the stream arrives, specialist tools fan out live from the orchestrator, particles flow along the active edge,
   and clicking a node opens the inspector. Everything is derived from the same events as the layer view. */

const TONE = { blue: "#4d8eeb", purple: "#9d6ff0", orange: "#f58a3a", green: "#19b394", navy: "#6c8cff", red: "#ef5b6b", teal: "#22b8cf" };
const NH = 62;
const fmtMs = ms => (ms == null ? "–" : ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms)} ms`);

function useWidth(ref) {
  const [w, setW] = useState(1100);
  useLayoutEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(760, e.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, [ref]);
  return w;
}

function buildGraph(v, q, started, mailCfg) {
  const s = v.st;
  const nodes = [
    { id: "q", col: 0, icon: MessageSquare, tone: "blue", title: "Question", sub: started ? `${q.length} characters` : "Type and run", status: started ? "done" : "queued", tel: started ? q : "" },
    { id: "input", col: 1, icon: Inbox, tone: "blue", title: "API gateway", sub: "Sign-in · role · rate limit", status: s.input.status, tel: s.input.tel },
    { id: "plan", col: 2, icon: Brain, tone: "purple", title: "Orchestrator", sub: `Domo LLM · ${v.llm} call${v.llm === 1 ? "" : "s"}${v.llmMs ? ` · ${fmtMs(v.llmMs)}` : ""}`, status: s.plan.status, tel: s.plan.tel },
  ];
  const shown = v.calls.slice(0, 6);
  if (shown.length) {
    shown.forEach((c, k) => nodes.push({ id: c.id, col: 3, row: k, rows: shown.length, icon: Database, tone: "orange", title: c.tool,
      sub: `${c.agent}${c.ms != null ? ` · ${fmtMs(c.ms)}` : ""}`, status: c.status, call: c,
      more: k === shown.length - 1 && v.calls.length > 6 ? v.calls.length - 6 : 0 }));
  } else {
    nodes.push({ id: "tools", col: 3, icon: Wrench, tone: "orange", title: "Specialist tools", sub: s.tools.tel ? "No tool needed" : "Fan out on demand", status: s.tools.status, tel: s.tools.tel, ghost: !s.tools.tel });
  }
  nodes.push(
    { id: "verify", col: 4, icon: ShieldCheck, tone: "green", title: "Validator", sub: v.final?.grounding?.checked != null ? `${v.final.grounding.checked} figures checked` : "Every figure vs data", status: s.verify.status, tel: s.verify.tel },
    { id: "answer", col: 5, icon: Bot, tone: "navy", title: "Answer", sub: v.final ? `${(v.final.artifacts || []).length} chart(s) · saved` : "Drill-through links", status: s.answer.status, tel: s.answer.tel },
  );
  const em = [];
  if (mailCfg.owners) em.push({ id: "owners", col: 6, icon: Mail, tone: "red", title: "Owner alert", sub: mailCfg.ownersLabel, status: s.owners.status, tel: s.owners.tel });
  if (mailCfg.suppliers) em.push({ id: "sup", col: 6, icon: Factory, tone: "red", title: "Supplier e-mails", sub: s.sup.n != null ? `${s.sup.n} supplier(s)` : "Affected suppliers", status: s.sup.status, tel: s.sup.tel, badge: s.sup.status === "warn" ? "Approve" : null });
  if (!em.length) em.push({ id: "owners", col: 6, icon: Mail, tone: "red", title: "Email trigger", sub: "Auto-email off", status: s.owners.status === "queued" ? "queued" : s.owners.status, tel: s.owners.tel });
  em.forEach((n, k) => nodes.push({ ...n, row: k, rows: em.length }));

  const toolIds = nodes.filter(n => n.col === 3).map(n => n.id), emIds = em.map(n => n.id);
  const edges = [["q", "input"], ["input", "plan"], ...toolIds.map(t => ["plan", t]), ...toolIds.map(t => [t, "verify"]), ["verify", "answer"], ...emIds.map(e => ["answer", e])];
  return { nodes, edges };
}

function edgeState(src, dst) {
  if (dst.status === "run") return "active";
  if (src.status === "run" && dst.ghost) return "active";                    // orchestrator thinking → specialists
  if (["done", "warn", "err"].includes(dst.status) && src.status !== "queued") return "done";
  return "idle";
}

export default function WorkflowCanvas({ v, q, started, running, elapsed, mailCfg, layers }) {
  const wrap = useRef();
  const W = useWidth(wrap);
  const { nodes, edges } = useMemo(() => buildGraph(v, q, started, mailCfg), [v, q, started, mailCfg]);
  const [sel, setSel] = useState(null);
  const toolRows = Math.max(1, nodes.filter(n => n.col === 3).length);
  const H = Math.max(330, toolRows * 84 + 90);
  const NW = Math.round(Math.min(184, Math.max(132, (W - 40) / 7 - 22)));   // leave a visible connector between columns
  const padX = NW / 2 + 20, colW = (W - padX * 2) / 6;
  const pos = n => {
    const x = padX + n.col * colW;
    const y = n.rows ? H / 2 + (n.row - (n.rows - 1) / 2) * (n.col === 3 ? 84 : 92) : H / 2;
    return { x, y };
  };
  const byId = Object.fromEntries(nodes.map(n => [n.id, n]));
  const runningNode = nodes.find(n => n.status === "run");
  useEffect(() => { if (!started) setSel(null); }, [started]);
  const focus = byId[sel] || null;

  return (
    <div className="wf">
      <div className="wf-canvas" ref={wrap} style={{ height: H }}>
        <div className="wf-grid" />
        <svg className="wf-svg" width={W} height={H}>
          <defs>
            <linearGradient id="wf-done" x1="0" x2="1"><stop offset="0" stopColor="#6f3dba" /><stop offset="1" stopColor="#4d8eeb" /></linearGradient>
            <filter id="wf-glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3.2" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
          </defs>
          {edges.map(([a, b]) => {
            const s = byId[a], d = byId[b];
            if (!s || !d) return null;
            const p1 = pos(s), p2 = pos(d);
            const x1 = p1.x + NW / 2, x2 = p2.x - NW / 2, mx = (x1 + x2) / 2;
            const path = `M${x1},${p1.y} C${mx},${p1.y} ${mx},${p2.y} ${x2},${p2.y}`;
            const st = edgeState(s, d), col = TONE[d.tone];
            return (
              <g key={a + b} className={`wf-edge e-${st}`}>
                <path d={path} className="wf-edge-bg" />
                {st === "done" && <motion.path d={path} stroke="url(#wf-done)" className="wf-edge-on" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.6, ease: "easeOut" }} />}
                {st === "active" && <>
                  <path d={path} stroke={col} className="wf-edge-flow" />
                  {[0, 0.4, 0.8].map(o => <circle key={o} r="4" fill={col} filter="url(#wf-glow)"><animateMotion dur="1.2s" begin={`${o}s`} repeatCount="indefinite" path={path} /></circle>)}
                </>}
                <circle cx={x2} cy={p2.y} r="3.5" className={`wf-port ${st}`} />
              </g>);
          })}
        </svg>

        <AnimatePresence>
          {nodes.map(n => {
            const { x, y } = pos(n), I = n.icon;
            return (
              <motion.button key={n.id} layout className={`wf-node s-${n.status}${sel === n.id ? " sel" : ""}${n.ghost ? " ghost" : ""}`}
                style={{ left: x - NW / 2, top: y - NH / 2, width: NW, height: NH, "--tone": TONE[n.tone] }}
                initial={{ opacity: 0, scale: 0.6, x: n.col === 3 ? -40 : 0 }} animate={{ opacity: 1, scale: 1, x: 0 }} exit={{ opacity: 0, scale: 0.6 }}
                transition={{ type: "spring", stiffness: 260, damping: 22 }} onClick={() => setSel(sel === n.id ? null : n.id)} title={n.title}>
                <span className="wf-ic"><I size={17} />{n.status === "run" && <i className="wf-spin" />}</span>
                <span className="wf-txt"><b>{n.title}</b><em>{n.sub}</em></span>
                <span className="wf-dot">{n.status === "done" ? <Check size={11} strokeWidth={3} /> : n.status === "warn" ? "!" : n.status === "err" ? <X size={11} strokeWidth={3} /> : null}</span>
                {n.badge && <span className="wf-badge">{n.badge}</span>}
                {n.more > 0 && <span className="wf-more">+{n.more} more</span>}
              </motion.button>);
          })}
        </AnimatePresence>

        <div className="wf-cols">{["Input", "Access", "Reasoning", "Specialists · Neon SQL", "Validation", "Output", "Action"].map((t, i) =>
          <span key={t} style={{ left: padX + i * colW }}>{t}</span>)}</div>

        <div className="wf-hud">
          <span className={running ? "live" : ""}><i />{running ? "Live" : started ? (v.err ? "Stopped" : "Completed") : "Standby"}</span>
          <span><Clock size={12} /> {elapsed}</span>
          {runningNode && <span className="now"><Sparkles size={12} /> {runningNode.title}</span>}
        </div>
        {!focus && <div className="wf-tip"><MousePointerClick size={12} /> Click any node to inspect it</div>}

        <AnimatePresence>
          {focus && <motion.aside className="wf-insp" initial={{ x: 40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 40, opacity: 0 }}>
            <header style={{ "--tone": TONE[focus.tone] }}>
              <span className="wf-ic"><focus.icon size={16} /></span>
              <div><b>{focus.title}</b><em>{focus.sub}</em></div>
              <button onClick={() => setSel(null)} aria-label="Close inspector"><X size={14} /></button>
            </header>
            <span className={`wf-st s-${focus.status}`}>{{ queued: "Queued", run: "Running", done: "Done", warn: "Needs attention", err: "Error", skip: "Skipped" }[focus.status]}</span>
            {focus.call ? <dl>
              <dt>Specialist</dt><dd>{focus.call.agent}</dd>
              <dt>Backend</dt><dd>{focus.call.backend || "–"}</dd>
              <dt>Datasets</dt><dd className="wf-chips">{focus.call.datasets.map(d => <code key={d}>{d}</code>)}</dd>
              <dt>Input</dt><dd><code className="wf-pre">{JSON.stringify(focus.call.input || {}, null, 1)}</code></dd>
              <dt>Result</dt><dd>{focus.call.summary || (focus.call.status === "run" ? "Running…" : "–")}</dd>
              <dt>Time</dt><dd>{fmtMs(focus.call.ms)}</dd>
            </dl> : <>
              <p>{layers.find(l => l.id === focus.id)?.desc || { q: "The question as typed. It is sent with the conversation history to the orchestrator.", owners: "The verified answer, sent as an HTML alert to the chosen internal owners and to their in-app inbox.", sup: "One quality e-mail per supplier named in the answer with poor-quality or damaged material. Sent only after a Quality / admin approval." }[focus.id]}</p>
              {focus.tel && <div className="wf-tel">{focus.tel}</div>}
            </>}
          </motion.aside>}
        </AnimatePresence>
      </div>

      <div className="wf-foot">
        <div className="wf-stats">
          {[[Clock, "Elapsed", elapsed], [Brain, "LLM calls", v.llm], [Cpu, "Tool calls", v.calls.length], [Layers, "Datasets", v.datasets.length],
            [ShieldCheck, "Figures verified", v.final?.grounding?.checked ?? "–"], [Gauge, "Progress", `${v.pct}%`]].map(([I, l, val]) =>
            <div key={l}><I size={14} /><span>{l}</span>{l === "Elapsed" ? <b>{val}</b> : <motion.b key={String(val)} initial={{ y: -6, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>{val}</motion.b>}</div>)}
        </div>
        <div className="wf-tl">
          <div className="wf-tl-h"><b>Execution timeline</b><span>each LLM decision and tool call, scaled by duration</span></div>
          {v.timeline.length === 0 ? <div className="wf-tl-empty">Steps appear here as the agent works.</div> : (() => {
            const max = Math.max(...v.timeline.map(t => t.ms || 0), 1);
            return v.timeline.map((t, i) => (
              <div key={i} className={`wf-tl-row k-${t.kind}${t.err ? " err" : ""}`}>
                <span className="lbl">{t.kind === "llm" ? <Brain size={11} /> : t.err ? <AlertTriangle size={11} /> : <Database size={11} />} {t.label}</span>
                <span className="bar"><motion.i initial={{ width: 0 }} animate={{ width: `${Math.max(3, ((t.ms || 0) / max) * 100)}%` }} transition={{ duration: 0.5 }} /></span>
                <span className="ms">{t.ms != null ? fmtMs(t.ms) : "replay"}</span>
              </div>));
          })()}
        </div>
      </div>
    </div>
  );
}
