import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Bot, Check, Copy, Download, History, ListChecks, Loader2, Maximize2, Minimize2, Plus, Send, Sparkles, Square, Trash2, Wrench, X } from "lucide-react";
import { api, streamChat } from "../api";
import { MetricArtifact } from "./MetricViz";
import AnswerView from "./AnswerView";
import { drillAnchor, DrillBar, linkify } from "./drill";

const SUGGESTIONS = [
  "Which suppliers got worse on OTIF this month?",
  "Which suppliers are the biggest supply risk right now, and why?",
  "Show supplier grades with OTIF and incoming PPM.",
  "Show OTIF and PPM trend by month for Global Pack Solutions.",
  "What is our line and customer exposure to Shenzhen Silicon Systems?",
  "Compare suppliers for the Li-ion battery material.",
  "List overdue CAPAs older than 30 days by supplier.",
];

const TOOL_LABEL = {
  list_metrics: "Reading approved metrics", query_metric: "Computing approved metric", compare_metric_periods: "Comparing periods",
  get_portfolio_overview: "Reading portfolio KPIs", get_supplier_scorecard: "Building scorecard",
  get_supplier_trends: "Analysing trends", get_risk_alerts: "Scanning risk signals", get_supplier_exposure: "Quantifying exposure",
  get_open_issues: "Pulling open NCR/CAPA", get_defect_breakdown: "Breaking down defects", compare_suppliers_for_material: "Comparing suppliers",
  get_schema: "Reading schema", run_sql: "Running SQL", propose_corrective_action: "Drafting corrective action",
  list_corrective_actions: "Checking action tracker", notify_owner: "Notifying owner", generate_domo_beastmode: "Generating Beast Mode",
};

// Follow-up suggestions derived from the suppliers mentioned in the last answer (no extra AI call).
function followUps(answer) {
  const ids = [...new Set((answer || "").match(/SUP-\d{3}/g) || [])].slice(0, 2);
  if (!ids.length) return ["Which suppliers need corrective action first?", "Show the monthly OTIF and PPM trend", "What if delivery counted 60% of the score?"];
  const [a, b] = ids;
  return [`What is the line and customer exposure for ${a}?`, `List the open overdue CAPAs for ${a}`,
    b ? `Compare ${a} and ${b} side by side` : `Show the monthly trend for ${a}`, `Propose a corrective action for ${a}`];
}

function BotActions({ text }) {
  const [ok, setOk] = useState(false);
  return (
    <div className="bot-actions">
      <button className="ghost chip-btn row-flex" onClick={() => navigator.clipboard?.writeText(text).then(() => { setOk(true); setTimeout(() => setOk(false), 1500); })}>
        {ok ? <Check size={12} /> : <Copy size={12} />} {ok ? "Copied" : "Copy"}</button>
    </div>
  );
}

function Steps({ steps }) {
  if (!steps?.length) return null;
  return (
    <details className="steps">
      <summary>{steps.length} tool call(s)</summary>
      {steps.map((s, j) => (
        <pre key={j}>{s.tool}({JSON.stringify(s.input)}){"\n"}→ {String(s.output).slice(0, 1500)}</pre>
      ))}
    </details>
  );
}

export default function ChatPanel({ open, onClose, seed, clearSeed, llmReady, onNav, onSupplier, allowed = [], suppliers = [], onTrace }) {
  const [catalog, setCatalog] = useState(null);       // tool -> page / datasets (Agent Architecture catalogue)
  useEffect(() => { if (open && !catalog && onTrace) api.architecture().then(setCatalog).catch(() => {}); }, [open, onTrace]); // eslint-disable-line
  const go = p => { onNav?.(p); };
  const A = drillAnchor(go, id => onSupplier?.(id));
  const [convs, setConvs] = useState([]);
  const [cid, setCid] = useState(null);
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState([]);          // live tool timeline for the running turn
  const [showHist, setShowHist] = useState(false);
  const endRef = useRef(); const abortRef = useRef(); const skipLoad = useRef(false);

  const loadConvs = () => api.convs().then(setConvs).catch(() => {});
  useEffect(() => { if (open) loadConvs(); }, [open]);
  useEffect(() => {
    if (skipLoad.current) { skipLoad.current = false; return; }
    cid ? api.msgs(cid).then(setMsgs).catch(() => {}) : setMsgs([]);
  }, [cid]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, live, busy]);
  useEffect(() => { if (open && seed && !busy) { send(seed, null); clearSeed(); } }, [open, seed]); // eslint-disable-line

  async function send(message = text.trim(), convId = cid) {
    if (!message || busy) return;
    setText(""); setBusy(true); setLive([]);
    if (convId !== cid) { skipLoad.current = true; setCid(convId); }
    setMsgs(m => [...(convId === cid ? m : []), { role: "user", content: message }]);
    const ctrl = new AbortController(); abortRef.current = ctrl;
    let got = false;
    try {
      await streamChat(convId, message, ev => {
        if (ev.type === "meta" && !convId) { skipLoad.current = true; setCid(ev.conversation_id); }
        if (ev.type === "tool_start") setLive(l => [...l, { tool: ev.tool, input: ev.input, done: false }]);
        if (ev.type === "tool_end") setLive(l => l.map((x, i) => (i === l.length - 1 ? { ...x, done: true } : x)));
        if (ev.type === "final") { got = true; setMsgs(m => [...m, { role: "assistant", content: ev.answer, steps: ev.steps, grounding: ev.grounding, artifacts: ev.artifacts }]); }
        if (ev.type === "error") { got = true; setMsgs(m => [...m, { role: "assistant", content: `⚠️ ${ev.message}`, steps: ev.steps }]); }
      }, ctrl.signal);
      if (!got) setMsgs(m => [...m, { role: "assistant", content: "No answer was returned. Please try again." }]);
    } catch (e) {
      if (e.name !== "AbortError") setMsgs(m => [...m, { role: "assistant", content: `Something went wrong: ${e.message}` }]);
    } finally {
      setBusy(false); setLive([]); loadConvs();
    }
  }

  const [big, setBig] = useState(false);
  if (!open) return null;
  return (
    <motion.div className={"chat cw" + (big ? " big" : "")} role="dialog" aria-label="Supplier agent chat" initial={{ opacity: 0, y: 16, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 320, damping: 28 }}>
      <div className="chat-head">
        <div className="av"><img src="/gwc-mark.png" alt="" /><i className={llmReady ? "on" : ""} /></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <b>Supplier Agent</b>
          <span className="muted">{llmReady ? "Online · live data" : "Offline · token not set"}</span>
        </div>
        <button className="ghost icon-btn" title={big ? "Smaller window" : "Larger window"} onClick={() => setBig(b => !b)}>{big ? <Minimize2 size={16} /> : <Maximize2 size={16} />}</button>
        <button className="ghost icon-btn" title="Export conversation (Markdown)" disabled={!msgs.length} onClick={() => {
          const md = msgs.map(m => `### ${m.role === "user" ? "You" : "Agent"}\n\n${m.content}`).join("\n\n");
          const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([md], { type: "text/markdown" }));
          a.download = "supplier-agent-chat.md"; a.click();
        }}><Download size={17} /></button>
        <button className="ghost icon-btn" title="History" onClick={() => setShowHist(h => !h)}><History size={17} /></button>
        <button className="ghost icon-btn" title="New chat" onClick={() => { setCid(null); setMsgs([]); }}><Plus size={17} /></button>
        <button className="ghost icon-btn" title="Close" onClick={onClose}><X size={17} /></button>
      </div>
      {showHist && (
        <div className="chat-hist">
          {convs.length === 0 && <div className="muted" style={{ padding: 8 }}>No conversations yet.</div>}
          {convs.map(c => (
            <div key={c.id} className={"conv" + (c.id === cid ? " active" : "")} onClick={() => { setCid(c.id); setShowHist(false); }}>
              <span>{c.title}</span>
              <Trash2 size={14} onClick={e => { e.stopPropagation(); api.delConv(c.id).then(() => { if (c.id === cid) setCid(null); loadConvs(); }); }} />
            </div>
          ))}
        </div>
      )}
      <div className="msgs">
        {msgs.length === 0 && !busy && (
          <div className="cw-welcome">
            <div className="msg-row bot"><img className="msg-av" src="/gwc-mark.png" alt="" />
              <div className="bubble bot">Hi, I'm your supplier agent. Ask me about delivery, quality, risks or spend; every figure I give is checked against the live data.</div></div>
            <div className="suggest">{SUGGESTIONS.map(s => <button key={s} onClick={() => send(s)}>{s}</button>)}</div>
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={"msg-row " + (m.role === "user" ? "user" : "bot")}>{m.role !== "user" && <img className="msg-av" src="/gwc-mark.png" alt="" />}
          <div className={"bubble " + (m.role === "user" ? "user" : "bot")}>
            {m.role === "user" ? m.content : <AnswerView content={m.content} A={A} suppliers={suppliers} allowed={allowed} />}
            {m.role !== "user" && (m.artifacts || []).map((a, j) => <MetricArtifact key={j} a={a} height={200} />)}
            {m.role !== "user" && <Steps steps={m.steps} />}
            {m.grounding && <div className="grounding" title="Every figure in the answer was checked against the tool results">{m.grounding.grounded ? `✓ ${m.grounding.checked} figures verified against data` : `⚠ ${m.grounding.unsupported.length} figure(s) not found in data`}{m.grounding.retried ? " · corrected once" : ""}</div>}
            {m.role !== "user" && !m.content.startsWith("⚠️") && <DrillBar answer={m.content} steps={m.steps} catalog={catalog} allowed={allowed} suppliers={suppliers} onNav={go} onSupplier={onSupplier}>
              {onTrace && <button className="drill-chip trace" onClick={() => onTrace({ question: msgs[i - 1]?.role === "user" ? msgs[i - 1].content : "", answer: m.content, steps: m.steps || [], grounding: m.grounding, artifacts: m.artifacts })}
                title="Open the step-by-step run in Agent Architecture"><ListChecks size={12} /> How this answer was built</button>}
            </DrillBar>}
            {m.role !== "user" && <BotActions text={m.content} />}
          </div></div>
        ))}
        {!busy && msgs.length > 0 && msgs.at(-1).role !== "user" && (
          <div className="followups">
            <span className="eyebrow"><Sparkles size={11} /> Follow up</span>
            <div className="suggest">{followUps(msgs.at(-1).content).map(s => <button key={s} onClick={() => send(s)}>{s}</button>)}</div>
          </div>
        )}
        {busy && (
          <div className="msg-row bot"><img className="msg-av" src="/gwc-mark.png" alt="" /><div className="bubble bot">
            <div className="timeline">
              {live.map((s, i) => (
                <div key={i} className={"tl" + (s.done ? "" : " run")}>
                  <span className="dot">{s.done ? <Check size={11} /> : <Wrench size={10} />}</span>
                  {TOOL_LABEL[s.tool] || s.tool} <code>{s.tool}</code>
                </div>
              ))}
              <div className="tl run"><span className="dot"><Loader2 size={11} /></span>
                <span className="typing"><span /><span /><span /></span> {live.length ? "Reasoning over results" : "Planning"}</div>
            </div>
          </div></div>
        )}
        <div ref={endRef} />
      </div>
      <div className="composer">
        <textarea value={text} placeholder="Message the agent…" rows={1} aria-label="Message the agent"
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} />
        {busy
          ? <button className="ghost icon-btn" style={{ height: 44, width: 44 }} onClick={() => abortRef.current?.abort()} title="Stop"><Square size={16} /></button>
          : <button className="primary icon-btn" style={{ height: 44, width: 44 }} disabled={!text.trim()} onClick={() => send()} aria-label="Send"><Send size={16} /></button>}
      </div>
      <div className="cw-foot">Answers are checked against live data · the agent suggests, people decide</div>
    </motion.div>
  );
}
