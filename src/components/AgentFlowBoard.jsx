// Agent Architecture > Agent Flow: the agent workflow as a straight, fixed node board with a details panel beside it.
//   Trigger -> Watch & predict (5 watcher agents / models) -> AI Agent (Domo LLM, memory, specialists, delay investigator)
//   -> Validator -> 6 output agents -> Person approves -> Audit & outcomes, and the loop back to the next cycle.
// "Run agent pipeline" lights the nodes up one at a time: the watchers first, then the AI agent working on the real question
// (driven by the live chat stream), then validation, the outputs, approval and audit. Click any node for its details.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Bot, CalendarClock, Database, GitBranch, Hand, MousePointerClick, X } from "lucide-react";
import { KIND, TONE, WHEN } from "./agentParts";
import "../workflow.css";

/* ---------------------------------------------------------------- layout (board coordinates) */
const BW = 1300, BH = 680, MY = 320;
const SIZE = { trig: [76, 76], tile: [92, 92], agent: [240, 100], out: [204, 62], sub: [64, 64] };
const OUTS = ["answer", "notify", "qi", "fu", "capa", "src"];
const NODES = [
  { id: "trigger", x: 52, y: MY, t: "trig" },
  { id: "watch", x: 240, y: MY, t: "tile" },
  { id: "orch", x: 505, y: MY, t: "agent" },
  { id: "valid", x: 745, y: MY, t: "tile", label: "Validator" },
  ...OUTS.map((id, k) => ({ id, x: 935, y: MY - 250 + k * 100, t: "out" })),
  { id: "human", x: 1115, y: MY, t: "tile" },
  { id: "audit", x: 1248, y: MY, t: "tile" },
  ...["detect", "late", "fcast", "qew", "disr"].map((id, k) => ({ id, x: 44 + k * 98, y: 80, t: "sub", p: "watch", up: true })),
  ...["llm", "mem", "spec", "why"].map((id, k) => ({ id, x: 355 + k * 100, y: 548, t: "sub", p: "orch" })),
];
export const FLOW_PARTS = NODES.length;
const POS = Object.fromEntries(NODES.map(n => [n.id, n]));
const MAIN = [["trigger", "watch"], ["watch", "orch"], ["orch", "valid"], ...OUTS.map(o => ["valid", o]),
  ...OUTS.filter(o => o !== "answer").map(o => [o, "human"]), ["answer", "audit"], ["human", "audit"]];
const SUBS = NODES.filter(n => n.p);

const PRE = ["trigger", "watch", "detect", "late", "fcast", "qew", "disr"];
const POST = ["valid", "answer", "notify", "qi", "fu", "capa", "src", "human", "audit"];
const SEQ = [...PRE, "orch", ...POST], AG = PRE.length;
const STEP_MS = 650;

const half = id => { const [w, h] = SIZE[POS[id].t]; return [w / 2, h / 2]; };
const right = id => [POS[id].x + half(id)[0], POS[id].y];
const left = id => [POS[id].x - half(id)[0], POS[id].y];
function hPath(a, b) {
  const [x1, y1] = right(a), [x2, y2] = left(b);
  if (Math.abs(y1 - y2) < 1) return `M${x1},${y1} L${x2},${y2}`;
  const dx = Math.max(40, (x2 - x1) / 2);
  return `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`;
}
/* sub ports spread evenly along the parent's top or bottom edge; the same function places the drawn port and the line end */
function subPort(s) {
  const sibs = SUBS.filter(x => x.p === s.p), k = sibs.findIndex(x => x.id === s.id), [pw, ph] = half(s.p);
  const off = (k - (sibs.length - 1) / 2) * Math.min(28, (pw * 1.7) / sibs.length);
  return [POS[s.p].x + off, POS[s.p].y + (s.up ? -ph : ph)];
}
function vPath(s) {
  const [px, py] = subPort(s), y1 = s.y + (s.up ? 32 : -32), my = (y1 + py) / 2;
  return `M${s.x},${y1} C${s.x},${my} ${px},${my} ${px},${py}`;
}
/* loop: down from Audit, along the bottom edge, up into the Trigger (square corners, rounded) */
const LY = BH - 22, ax = POS.audit.x, tx = POS.trigger.x, r = 16;
const LOOP = `M${ax},${MY + 46} L${ax},${LY - r} Q${ax},${LY} ${ax - r},${LY} L${tx + r},${LY} Q${tx},${LY} ${tx},${LY - r} L${tx},${MY + 38}`;

const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export default function AgentFlowBoard({ parts, v, running, runKey, mailCfg, catalog, onLog, onProgress, onOpen }) {
  const { byId, scheduler } = parts;
  const area = useRef();
  const [box, setBox] = useState({ w: 1000, h: 520 });
  const [sel, setSel] = useState(null);
  const [pi, setPi] = useState(-1);

  useLayoutEffect(() => {
    if (!area.current) return undefined;
    const ro = new ResizeObserver(([e]) => setBox({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(area.current);
    return () => ro.disconnect();
  }, []);
  const s = Math.min((box.w - 24) / BW, (box.h - 16) / BH);
  const ox = (box.w - BW * s) / 2, oy = (box.h - BH * s) / 2;

  /* ---------- run sequencing */
  useEffect(() => { if (runKey > 0) setPi(0); }, [runKey]);
  const final = !!v.final, err = v.err;
  useEffect(() => {
    if (pi < 0 || pi >= SEQ.length || err) return undefined;
    if (pi === AG && !(final && !running)) return undefined;
    const t = setTimeout(() => setPi(p => p + 1), pi === AG ? 700 : STEP_MS);
    return () => clearTimeout(t);
  }, [pi, final, running, err]);

  const tools = catalog?.tools || {};
  const toolRun = v.calls.find(c => c.status === "run");
  const toolsDone = v.calls.filter(c => c.status !== "run");
  const usedAgent = a => v.calls.some(c => tools[c.tool]?.agent === a);
  const g = v.final?.grounding;
  const supN = v.supMail?.drafts?.length ?? null;
  const mailSent = v.mail?.recipients?.some(x => x.status === "SENT_VIA_SMTP");

  function status(id) {
    if (pi < 0) return "idle";
    const i = SEQ.indexOf(id);
    if (err && (i === pi || (pi === AG && ["orch", "llm", "spec"].includes(id)))) return "err";
    if (["llm", "mem", "spec", "why"].includes(id)) {
      if (pi < AG) return "queued";
      if (id === "mem") return v.st.input.status === "done" ? "done" : "run";
      if (id === "llm") return pi > AG || toolRun ? "done" : "run";
      if (id === "spec") return toolRun ? "run" : toolsDone.length ? "done" : pi > AG ? "skip" : "queued";
      return usedAgent("logistics") ? (toolRun && tools[toolRun.tool]?.agent === "logistics" ? "run" : "done") : pi > AG ? "skip" : "queued";
    }
    if (i > pi) return "queued";
    if (i === pi && pi < SEQ.length) return "run";
    if (id === "notify" && !mailCfg.owners) return "skip";
    if (id === "notify" && v.mail && !mailSent) return "warn";
    if (id === "qi" && supN) return "warn";
    if (id === "valid" && g && !g.grounded) return "warn";
    return "done";
  }
  function runText(id, st) {
    if (pi < 0 || st === "queued") return null;
    const p = byId[id];
    switch (id) {
      case "trigger": return "Question received";
      case "orch": { const last = [...v.timeline].reverse().find(x => x.kind === "llm");
        return pi > AG ? `${v.llm} LLM step(s) · ${v.calls.length} tool call(s)` : toolRun ? `Waiting for ${toolRun.tool}` : last ? last.label : "Reading the question…"; }
      case "llm": return st === "run" ? "Thinking…" : `${v.llm} call(s) · ${(v.llmMs / 1000).toFixed(1)} s`;
      case "mem": return st === "done" ? "Conversation saved" : "Loading history";
      case "spec": return toolRun ? toolRun.tool : toolsDone.length ? `${toolsDone.length} tool call(s)` : "Not needed";
      case "why": return st === "skip" ? "Not needed" : "Explaining the delay";
      case "valid": return st === "run" ? "Checking every figure…" : g ? (g.grounded ? `${g.checked} figure(s) verified` : `${g.unsupported.length} unverified`) : "Checked";
      case "answer": return st === "run" ? "Delivering…" : `Delivered · ${(v.final?.steps || []).length} tool call(s)`;
      case "notify": return st === "skip" ? "Auto-email off" : st === "run" ? "Compiling the alert…" : v.mail ? (mailSent ? "E-mailed to owners" : "In-app inbox (no SMTP)") : "Owners told";
      case "qi": return supN != null ? (supN ? `${supN} supplier e-mail(s) drafted` : "No supplier needs one") : p.sub;
      default: return st === "run" ? "Working…" : p.sub;
    }
  }

  const lastLogged = useRef(-1);
  useEffect(() => {
    if (pi < 0) { lastLogged.current = -1; return; }
    if (pi === lastLogged.current) return;
    lastLogged.current = pi;
    if (pi >= SEQ.length) { onLog?.("ok", "Agent workflow complete: outcomes recorded in the audit log and fed to the next cycle"); return; }
    const id = SEQ[pi], p = byId[id];
    if (id === "orch") onLog?.("llm", "AI agent takes over: planning with the Domo LLM and calling specialists on Neon");
    else if (p && id !== "trigger") onLog?.(["late", "fcast", "qew"].includes(id) ? "llm" : "ok", `${p.title}: ${p.live || p.sub}`);
  }, [pi]); // eslint-disable-line react-hooks/exhaustive-deps
  const activeId = pi >= 0 && pi < SEQ.length ? (pi === AG ? (toolRun ? "spec" : "orch") : SEQ[pi]) : null;
  useEffect(() => {
    const total = SEQ.length, done = Math.max(0, Math.min(pi, total));
    onProgress?.({ pct: pi < 0 ? 0 : Math.round((done / total) * 100), step: pi < 0 ? 0 : Math.min(pi + 1, total), total, label: activeId ? byId[activeId]?.title : pi >= total ? "Complete" : null });
  }, [pi, activeId]); // eslint-disable-line react-hooks/exhaustive-deps

  const st = useMemo(() => Object.fromEntries(NODES.map(n => [n.id, status(n.id)])), [pi, v, running, mailCfg]); // eslint-disable-line react-hooks/exhaustive-deps
  const edgeState = (a, b) => {
    const A = st[a], B = st[b];
    if (pi < 0) return "idle";
    if (B === "run" && ["done", "warn", "run"].includes(A)) return "active";
    if (A === "run" && POS[a].p) return "active";
    if (["done", "warn"].includes(A) && ["done", "warn"].includes(B)) return "done";
    if (A === "skip" || B === "skip") return "skip";
    return "queued";
  };
  const show = sel || activeId;
  const part = show ? byId[show] : null;
  const ups = show ? [...MAIN.filter(([, b]) => b === show).map(([a]) => a), ...SUBS.filter(x => x.p === show).map(x => x.id)] : [];
  const downs = show ? [...MAIN.filter(([a]) => a === show).map(([, b]) => b), ...(POS[show]?.p ? [POS[show].p] : [])] : [];
  const working = pi >= 0 && pi < SEQ.length;

  return (
    <div className="fb2">
      <header className="fb2-head">
        <b>Agent workflow</b>
        <span className="fb2-sub">{FLOW_PARTS} agents and models · click any node for details</span>
        <span className={"fb-active" + (scheduler.active ? " on" : "")} title={scheduler.active ? "The scheduler ran within the last cycles" : "No scheduled run recently"}>
          Autonomous agents <b>{scheduler.active ? "Active" : "Idle"}</b><i /></span>
        <span className={"fb2-run" + (working ? " on" : "")}>{working ? <>Step {pi + 1} of {SEQ.length} · <b>{byId[activeId]?.title}</b></> : pi >= SEQ.length ? <>Run complete · <b>{SEQ.length} steps</b></> : <>Ready</>}</span>
      </header>
      <div className="fb2-body">
        <div className="fb2-area" ref={area} onClick={e => { if (!e.target.closest(".fb-n")) setSel(null); }}>
          <div className="fb-dots" />
          <div className="fb2-pan" style={{ transform: `translate(${ox}px, ${oy}px) scale(${s})` }}>
            <svg className="fb-svg" width={BW} height={BH} viewBox={`0 0 ${BW} ${BH}`}>
              <defs><filter id="fb-glow" filterUnits="userSpaceOnUse" x={-20} y={-20} width={BW + 40} height={BH + 40}><feGaussianBlur stdDeviation="3" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter></defs>
              <path d={LOOP} className={"fb-e loop" + (pi >= SEQ.length ? " on" : "")} />
              {!reduce && <circle r="4.5" className="fb-dot loop"><animateMotion dur="8s" repeatCount="indefinite" path={LOOP} /></circle>}
              <text x={(ax + tx) / 2} y={LY - 8} className="fb2-looptxt" textAnchor="middle">Outcomes and replies feed the next cycle</text>
              {SUBS.map(x => { const d = vPath(x), es = edgeState(x.id, x.p);
                return <g key={x.id}><path d={d} className={`fb-e sub e-${es}`} />
                  {es === "active" && !reduce && <circle r="4" className="fb-dot sub"><animateMotion dur="0.9s" repeatCount="indefinite" path={d} /></circle>}</g>; })}
              {MAIN.map(([a, b]) => { const d = hPath(a, b), es = edgeState(a, b);
                return <g key={a + b}><path d={d} className={`fb-e main e-${es}`} filter={es === "skip" || es === "queued" ? undefined : "url(#fb-glow)"} />
                  {es === "active" && !reduce && <circle r="5.5" className="fb-dot"><animateMotion dur="1s" repeatCount="indefinite" path={d} /></circle>}</g>; })}
            </svg>
            {NODES.map(n => <Node key={n.id} n={n} part={byId[n.id]} st={st[n.id]} text={runText(n.id, st[n.id])} sel={sel === n.id}
              onPick={id => setSel(x => (x === id ? null : id))} />)}
          </div>
          <div className={"fb-key" + (working ? " off" : "")}><span><i className="k-main" />Work flow</span><span><i className="k-sub" />Sub-agent or model</span><span><i className="k-loop" />Back to the next cycle</span></div>
        </div>
        <Panel part={part} tag={sel ? null : working ? "Now running" : null} status={!sel && working ? runText(activeId, st[activeId]) : sel && pi >= 0 ? runText(sel, st[sel]) : null}
          ups={ups} downs={downs} byId={byId} onSelect={setSel} onOpen={onOpen} onClose={sel ? () => setSel(null) : null} />
      </div>
    </div>
  );
}

function Node({ n, part, st, text, sel, onPick }) {
  if (!part) return null;
  const [w, h] = SIZE[n.t], I = part.icon;
  const style = { left: n.x - w / 2, top: n.y - h / 2, width: w, height: h };
  const badge = ["done", "warn", "err"].includes(st) && <span className={`fb-badge b-${st}`}>{st === "done" ? "✓" : st === "warn" ? "!" : "✕"}</span>;
  const ring = st === "run" && (n.t === "sub" || n.t === "tile" || n.t === "trig") && <span className="fb-spin" />;
  const sub = text || part.sub;
  const kids = SUBS.filter(x => x.p === n.id);
  const ports = kids.map(k => { const [px, py] = subPort(k); return <span key={k.id} className="fb-port d" style={{ left: px - (n.x - w / 2) - 9, top: py - (n.y - h / 2) - 9 }} />; });
  const props = { className: `fb-n t-${n.t} s-${st}${sel ? " sel" : ""}`, style, title: part.title, "aria-pressed": sel, onClick: e => { e.stopPropagation(); onPick(n.id); } };
  if (n.t === "sub") return (
    <button {...props}><span className="fb-port d" style={{ left: 23, top: n.up ? 55 : -9 }} />{ring}<I size={22} />{badge}
      <span className="fb-lbl sub"><b>{part.title}</b><em>{sub}</em></span></button>);
  if (n.t === "agent") return (
    <button {...props}><span className="fb-port l" /><span className="fb-port r" />{badge}{ports}
      <span className="fb-agent-ic"><Bot size={28} /></span>
      <span className="fb-agent-t"><b>AI AGENT</b><em>Orchestrator · Domo LLM</em><small>{sub}</small></span></button>);
  if (n.t === "out") return (
    <button {...props}><span className="fb-port l" /><span className="fb-port r" />{badge}
      <span className="fb-out-ic"><I size={19} /></span><span className="fb-out-t"><b>{part.title}</b><em>{sub}</em></span></button>);
  return (
    <button {...props}>{n.t !== "trig" && <span className="fb-port l" />}<span className="fb-port r" />{ring}{badge}{ports}
      {n.t === "trig" ? <span className="fb-play" /> : <I size={34} strokeWidth={1.8} />}
      <span className="fb-lbl"><b>{n.label || part.title}</b><em>{sub}</em></span></button>);
}

function Panel({ part, tag, status, ups, downs, byId, onSelect, onOpen, onClose }) {
  if (!part) return (
    <aside className="fb2-panel empty">
      <MousePointerClick size={22} />
      <b>Click any node</b>
      <p>See what that agent or model does, when it runs, what it reads and produces, and what it hands over to.</p>
      <p>Press <b>Run agent pipeline</b> to watch the agents work one step at a time; this panel follows the step that is running.</p>
    </aside>);
  const W = WHEN[part.when];
  return (
    <aside className="fb2-panel" key={part.id} style={{ "--tone": TONE[part.tone] }}>
      <header>
        <span className="fb2-ic"><part.icon size={18} /></span>
        <div>{tag && <em className="fb-now">{tag}</em>}<b>{part.title}</b>
          <span><em className={`aj-kind k-${part.kind}`}>{KIND[part.kind]}</em> <W.icon size={12} /> {W.label}</span></div>
        {onClose && <button className="fb2-x" onClick={onClose} aria-label="Close details"><X size={15} /></button>}
      </header>
      {status && <div className="fb2-status"><i /> {status}</div>}
      <p className="fb2-does">{part.does}</p>
      <dl>
        <dt><CalendarClock size={13} /> When it runs</dt><dd>{part.runs}</dd>
        <dt><Database size={13} /> Reads</dt><dd className="chips">{part.reads.map(x => <span key={x}>{x}</span>)}</dd>
        <dt><GitBranch size={13} /> Produces</dt><dd className="chips out">{part.makes.map(x => <span key={x}>{x}</span>)}</dd>
        <dt><Hand size={13} /> A person's role</dt><dd>{part.person}</dd>
      </dl>
      {part.live && <div className="fb2-live"><i /> <b>Live now</b> {part.live}</div>}
      {part.team && <div className="fb2-team">{part.team.map(t => <div key={t.name}><b>{t.name}</b><em>{t.tools.join(" · ")}</em></div>)}</div>}
      <div className="fb2-links">
        {ups.filter(id => byId[id]).length > 0 && <div><span>Gets input from</span>{ups.filter(id => byId[id]).map(id => <button key={id} onClick={() => onSelect(id)}>{byId[id].title}</button>)}</div>}
        {downs.filter(id => byId[id]).length > 0 && <div><span>Hands over to</span>{downs.filter(id => byId[id]).map(id => <button key={id} onClick={() => onSelect(id)}>{byId[id].title}</button>)}</div>}
      </div>
      {part.go && onOpen && <button className="fb2-go" onClick={() => onOpen(part.go)}>{part.go[2]} <ArrowRight size={13} /></button>}
    </aside>
  );
}
