import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowDown, Bot, Brain, Database, Inbox, Mail, MailCheck, Play, RotateCcw, Send, ShieldCheck, Square, Terminal, Workflow, Wrench, Zap } from "lucide-react";
import AgentFlowBoard, { FLOW_PARTS } from "../components/AgentFlowBoard";
import { useAgentParts } from "../components/agentParts";
import AnswerView from "../components/AnswerView";
import { api, streamChat } from "../api";
import { drillAnchor, DrillBar, linkify } from "../components/drill";
import { useLoad } from "../util";
import SupplierMailOut, { suppliersIn } from "../components/SupplierMailOut";

/* Agent Architecture: five layer cards that go QUEUED -> RUNNING -> DONE with live telemetry, an execution console and
   the answer. Driven by the real chat stream (Run), or replayed from a stored answer ("How this answer was built"). */
const LAYERS = [
  { id: "input", n: 1, tag: "Input & access", tone: "blue", icon: Inbox, title: "Question intake & API gateway",
    desc: "FastAPI receives the question, checks the sign-in and role policy, applies the rate limit and stores the conversation." },
  { id: "plan", n: 2, tag: "Domo AI planning", tone: "purple", icon: Brain, title: "Orchestrator reasoning",
    desc: "The Domo LLM (via LangChain) reads the question, history and tool catalogue, and decides which specialist to call next." },
  { id: "tools", n: 3, tag: "Specialists & Neon SQL", tone: "orange", icon: Database, title: "Specialist tools on governed data",
    desc: "Each specialist runs approved, read-only SQL on the Neon Postgres KPI views and returns the rows to the orchestrator." },
  { id: "verify", n: 4, tag: "Validation", tone: "green", icon: ShieldCheck, title: "Grounding validator",
    desc: "Every figure in the draft answer is matched against the tool results; unmatched figures send the agent back once." },
  { id: "answer", n: 5, tag: "Output", tone: "navy", icon: Mail, title: "Answer delivery & audit",
    desc: "The answer, charts and full tool trace are saved with the conversation and shown below with drill-through links." },
  { id: "email", n: 6, tag: "Action & email trigger", tone: "red", icon: Send, title: "Autonomous email dispatch",
    desc: "Owners get the verified answer as an HTML alert; each affected supplier gets its own e-mail about its poor-quality material, sent after your approval." },
];
const QUESTIONS = ["Which suppliers got worse on OTIF this month?", "Which suppliers are the biggest supply risk right now, and why?",
  "List overdue CAPAs older than 30 days by supplier.", "What is our line and customer exposure to Global Pack Solutions?"];
const ts = () => new Date().toLocaleTimeString([], { hour12: false });

/** events -> per-layer status + telemetry, console lines and the final answer */
function derive(events, cat, role) {
  const T = cat?.tools || {}, AG = cat?.agents || {};
  const st = Object.fromEntries([...LAYERS.map(l => l.id), "owners", "sup"].map(id => [id, { status: "queued", tel: "" }]));
  const log = [], calls = [], timeline = [];
  let llm = 0, llmMs = 0, tools = [], ds = new Set(), final = null, err = null, retry = null;
  for (const ev of events) {
    const t = ev._t || "";
    if (ev.type === "stage") { log.push([t, ev.k || "ok", ev.text]); continue; }
    if (ev.type === "start") { st.input = { status: "run", tel: `Question received · ${ev.q.length} characters` }; log.push([t, "info", `Question received: "${ev.q}"`]); }
    else if (ev.type === "meta") {
      st.input = { status: "done", tel: `Role ${role} · policy passed · rate limit OK · conversation ${String(ev.conversation_id || "").slice(0, 8)}` };
      st.plan.status = "run"; log.push([t, "ok", "API gateway: sign-in, role policy and rate limit passed; conversation saved"]);
    } else if (ev.type === "plan") {
      llm += 1; llmMs += ev.ms || 0;
      timeline.push({ kind: "llm", label: ev.action === "final" ? "Draft the answer" : `Plan → ${ev.action}`, ms: ev.ms });
      const tool = T[ev.action];
      st.plan = { status: ev.action === "final" ? "done" : "run", tel: `LLM calls: ${llm} · ${(llmMs / 1000).toFixed(1)} s · decision: ${ev.action === "final" ? "write the answer" : `${AG[tool?.agent]?.name || "tool"} → ${ev.action}`}` };
      log.push([t, "llm", ev.action === "final" ? `Orchestrator drafted the answer (${ev.ms ? `${(ev.ms / 1000).toFixed(1)} s` : "replay"})` : `Orchestrator chose ${ev.action}${ev.ms ? ` (${(ev.ms / 1000).toFixed(1)} s)` : ""}${ev.thought ? ` · ${ev.thought.slice(0, 140)}` : ""}`]);
      if (ev.action === "final") st.verify.status = "run";
    } else if (ev.type === "tool_start") {
      const tool = T[ev.tool] || {};
      (tool.datasets || []).forEach(d => ds.add(d));
      calls.push({ id: `tool-${calls.length}`, tool: ev.tool, agent: AG[tool.agent]?.name || "Specialist", backend: tool.backend, datasets: tool.datasets || [], input: ev.input, status: "run" });
      st.tools = { status: "run", tel: `Running ${ev.tool} · ${tool.backend || ""} · reading ${(tool.datasets || []).join(", ")}` };
      log.push([t, "tool", `${AG[tool.agent]?.name || "Specialist"} → ${ev.tool}(${Object.entries(ev.input || {}).map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`).join(", ")})`]);
    } else if (ev.type === "tool_end") {
      tools.push({ tool: ev.tool, summary: ev.summary, ms: ev.ms, error: String(ev.output || "").startsWith("ERROR") });
      const cl = [...calls].reverse().find(x => x.tool === ev.tool && x.status === "run");
      if (cl) Object.assign(cl, { status: tools.at(-1).error ? "err" : "done", ms: ev.ms, summary: ev.summary });
      timeline.push({ kind: "tool", label: ev.tool, ms: ev.ms, err: tools.at(-1).error });
      st.tools = { status: "done", tel: `Tools: ${tools.length} · datasets: ${ds.size} · last: ${ev.tool} → ${ev.summary || "ok"}${ev.ms != null ? ` in ${ev.ms} ms` : ""}` };
      log.push([t, tools.at(-1).error ? "err" : "ok", `${ev.tool} returned ${ev.summary || "a result"}${ev.ms != null ? ` in ${ev.ms} ms` : ""}`]);
    } else if (ev.type === "grounding_retry") {
      retry = ev.unsupported; st.verify = { status: "run", tel: `Sent back once: ${(ev.unsupported || []).join(", ")} not found in the data` };
      log.push([t, "warn", `Validator: figures ${(ev.unsupported || []).join(", ")} not in any tool result; agent asked to correct`]);
    } else if (ev.type === "final") {
      final = ev; const g = ev.grounding;
      st.plan.status = "done"; if (st.tools.status === "queued") st.tools = { status: "done", tel: "No tool needed for this question" };
      st.verify = { status: g && !g.grounded ? "warn" : "done", tel: g ? (g.grounded ? `Figures checked: ${g.checked} · all matched${g.retried || retry ? " · corrected once" : ""}` : `${g.unsupported.length} figure(s) flagged as unverified`) : "Checked when the answer was written" };
      st.answer = { status: "done", tel: `Saved to conversation · ${(ev.steps || []).length} tool call(s) · ${(ev.artifacts || []).length} chart(s)` };
      log.push([t, "ok", g ? `Validator: ${g.checked} figure(s) verified` : "Validator: checked"], [t, "ok", "Answer delivered and saved with the conversation"]);
    } else if (ev.type === "email_off") {
      st.email = { status: "done", tel: "Auto-email off · send it from the email output below" };
      st.owners = { status: "skip", tel: "Auto-email off" }; st.sup = { status: "skip", tel: "Auto-email off" };
    } else if (ev.type === "email_start") {
      st.email = { status: "run", tel: `Compiling HTML alert for ${ev.to.toLowerCase()} owner(s)…` }; st.owners = { status: "run", tel: `Compiling alert for ${ev.to.toLowerCase()}` }; log.push([t, "tool", `Email trigger → compiling alert for ${ev.to.toLowerCase()}`]);
    } else if (ev.type === "email") {
      const r = ev.result.recipients || [];
      const sent = r.filter(x => x.status === "SENT_VIA_SMTP");
      st.email = { status: sent.length ? "done" : "warn", tel: sent.length ? `Status: SENT_VIA_SMTP · ${sent.map(x => x.email).join(", ")} · in-app #${r.map(x => x.notification_id).join(", #")}`
        : `Status: ${r[0]?.status || "?"} · delivered in-app to ${r.map(x => x.role.toLowerCase()).join(" + ")} (#${r.map(x => x.notification_id).join(", #")})` };
      st.owners = { status: sent.length ? "done" : "warn", tel: sent.length ? `E-mailed ${sent.map(x => x.email).join(", ")}` : `In-app to ${r.map(x => x.role.toLowerCase()).join(" + ")} · ${r[0]?.status}` };
      log.push([t, sent.length ? "ok" : "warn", sent.length ? `Email sent via SMTP to ${sent.map(x => x.email).join(", ")}` : `Email not sent (${r[0]?.error || r[0]?.status}); delivered to the in-app inbox`]);
    } else if (ev.type === "sup_start") {
      st.sup = { status: "run", tel: `Checking ${ev.n} supplier(s)` };
      st.email = { status: "run", tel: `Checking ${ev.n} supplier(s) in the answer for poor-quality material…` }; log.push([t, "tool", `Email trigger → supplier e-mails for ${ev.ids.join(", ") || "no supplier named"}`]);
    } else if (ev.type === "sup_drafts") {
      const d = ev.result.drafts.length;
      st.sup = { status: d ? "warn" : "done", n: d, tel: d ? `${d} e-mail(s) drafted · awaiting approval` : "No supplier with poor-quality material" };
      st.email = { status: d ? "warn" : "done", tel: `${(st.email.tel && !st.email.tel.startsWith("Checking")) ? st.email.tel + " · " : ""}Supplier e-mails: ${d} drafted, awaiting your approval${ev.result.skipped.length ? ` · ${ev.result.skipped.length} skipped` : ""}` };
      log.push([t, d ? "warn" : "ok", d ? `${d} supplier e-mail(s) drafted (${ev.result.drafts.map(x => x.supplier_name).join(", ")}); review and click Send` : "No supplier in the answer has poor-quality material; no supplier e-mail drafted"]);
    } else if (ev.type === "sup_sent") {
      const ok = ev.result.results.filter(x => x.ok);
      st.sup = { status: "done", n: ok.length, tel: `Sent to ${ok.length} supplier(s)` };
      st.email = { status: "done", tel: `Supplier e-mails sent: ${ok.length} · ${ok.map(x => `${x.supplier_id} ${x.email_status === "SENT" ? "e-mailed" : "portal"}`).join(", ")}` };
      log.push([t, "ok", `Sent to ${ok.length} supplier(s): ${ok.map(x => x.supplier_id + (x.to ? ` <${x.to}>` : " (portal)")).join(", ")}`]);
    } else if (ev.type === "email_error") {
      st.email = { status: "err", tel: ev.message }; log.push([t, "err", `Email trigger failed: ${ev.message}`]);
    } else if (ev.type === "error") { err = ev.message; Object.values(st).forEach(x => { if (x.status === "run") x.status = "err"; }); log.push([t, "err", `Stopped: ${ev.message}`]); }
  }
  const done = LAYERS.filter(l => ["done", "warn"].includes(st[l.id].status)).length;
  const mail = [...events].reverse().find(e => e.type === "email")?.result || null;
  const supMail = [...events].reverse().find(e => e.type === "sup_drafts")?.result || null;
  return { st, log, final, err, mail, supMail, calls, timeline, llm, llmMs, pct: Math.round((done / LAYERS.length) * 100), datasets: [...ds] };
}

function replayEvents(t) {
  const ev = [{ type: "start", q: t.question || "" }, { type: "meta", conversation_id: "stored" }];
  (t.steps || []).forEach(s => { ev.push({ type: "plan", action: s.tool, thought: s.thought }); ev.push({ type: "tool_start", tool: s.tool, input: s.input }); ev.push({ type: "tool_end", ...s }); });
  ev.push({ type: "plan", action: "final" }, { type: "final", answer: t.answer, steps: t.steps, grounding: t.grounding, artifacts: t.artifacts });
  return ev.map(e => ({ ...e, _t: "replay" }));
}

const STATUS = { queued: "Queued", run: "Running", done: "Done", warn: "Check", err: "Error" };

export default function AgentArchitecture({ user, nav, openSupplier, allowed = [], trace, setTrace }) {
  const cat = useLoad(() => api.architecture(), []);
  const sups = useLoad(() => api.scorecard({}).catch(() => []), []);
  const c = cat.data;
  const [q, setQ] = useState(QUESTIONS[1]);
  const [events, setEvents] = useState([]);
  const [running, setRunning] = useState(false);
  const [replay, setReplay] = useState(false);
  const [autoMail, setAutoMail] = useState(true), [mailTo, setMailTo] = useState(user?.role === "QUALITY" ? "QUALITY_SUP" : "BOTH_SUP");
  const toSup = mailTo.endsWith("SUP") || mailTo === "SUPPLIERS", toRole = mailTo.replace("_SUP", "");
  const mailRef = useRef();
  const parts = useAgentParts(c, user?.role);
  const [runKey, setRunKey] = useState(0);
  const [prog, setProg] = useState({ pct: 0, step: 0, total: 0, label: null });
  const openPage = g => {
    if (!g) return;
    if (g[0] === "__ask") { window.scrollTo({ top: 0, behavior: "smooth" }); return; }
    try { if (g[0] === "risk" && g[1]) sessionStorage.setItem("rr.tab", g[1]); if (g[0] === "settings" && g[1]) localStorage.setItem("settings.tab", g[1]); } catch { /* storage unavailable */ }
    nav?.(g[0]);
  };
  const [t0, setT0] = useState(null), [t1, setT1] = useState(null), [, tick] = useState(0);
  useEffect(() => { if (!running) return; const h = setInterval(() => tick(x => x + 1), 100); return () => clearInterval(h); }, [running]);
  const push = ev => setEvents(e => [...e, { ...ev, _t: ts() }]);
  const sendMail = async (question, fin) => {
    if (toRole !== "SUPPLIERS") {
      push({ type: "email_start", to: toRole });
      try { const r = await api.agentEmail({ question, answer: fin.answer, to_role: toRole, grounding: fin.grounding }); push({ type: "email", result: r }); }
      catch (e) { push({ type: "email_error", message: e.message }); }
    }
    if (toSup) await draftSuppliers(fin);
  };
  const draftSuppliers = async fin => {             // drafts only: a person reviews and clicks Send
    const ids = suppliersIn(fin.answer, fin.steps, sups.data);
    push({ type: "sup_start", n: ids.length, ids });
    if (!ids.length) { push({ type: "sup_drafts", result: { drafts: [], skipped: [], smtp: false } }); return; }
    try { push({ type: "sup_drafts", result: await api.qiBulkDraft({ supplier_ids: ids }) }); }
    catch (e) { push({ type: "email_error", message: `Supplier e-mails: ${e.message}` }); }
  };
  const abort = useRef(), outRef = useRef(), logRef = useRef();
  const v = useMemo(() => derive(events, c, user?.role), [events, c, user?.role]);

  useEffect(() => { logRef.current && (logRef.current.scrollTop = logRef.current.scrollHeight); }, [v.log.length]);
  useEffect(() => {                                   // "How this answer was built" from the chat
    if (trace && c) { setReplay(true); setQ(trace.question || q); setEvents(replayEvents(trace)); setRunKey(k => k + 1); setTrace?.(null); }
  }, [trace, c]); // eslint-disable-line react-hooks/exhaustive-deps

  async function run() {
    const text = q.trim();
    if (!text || running) return;
    const ctrl = new AbortController(); abort.current = ctrl;
    setReplay(false); setRunning(true); setEvents([{ type: "start", q: text, _t: ts() }]); setRunKey(k => k + 1); setT0(Date.now()); setT1(null);
    let fin = null;
    try { await streamChat(null, text, ev => { if (ev.type === "final") fin = ev; if (ev.type !== "thinking") push(ev); }, ctrl.signal); }
    catch (e) { push({ type: "error", message: e.name === "AbortError" ? "stopped by you" : e.message }); }
    if (fin?.answer) { if (autoMail) await sendMail(text, fin); else push({ type: "email_off" }); }
    setRunning(false); setT1(Date.now());
  }

  const A = drillAnchor(nav, openSupplier);
  const elapsed = t0 ? `${(((running ? Date.now() : t1 || Date.now()) - t0) / 1000).toFixed(1)} s` : replay ? "replay" : "0.0 s";
  const mailCfg = useMemo(() => ({ owners: autoMail && toRole !== "SUPPLIERS", suppliers: autoMail && toSup,
    ownersLabel: toRole === "BOTH" ? "Procurement + Quality" : toRole.charAt(0) + toRole.slice(1).toLowerCase() }), [autoMail, toRole, toSup]);
  const started = events.length > 0;
  return (
    <div className="ax">
      <section className="ax-hero">
        <div className="ax-head">
          <span className="ax-badge-ic"><Workflow size={22} /></span>
          <div className="ax-title">
            <div className="ax-h1">Agent Flow: how the agents work, step by step
              <span className="ax-chip green">● {FLOW_PARTS} agents & models · {Object.keys(c?.tools || {}).length || 28} tools</span><span className="ax-chip blue">Neon PostgreSQL</span><span className="ax-chip orange">Domo AI · LangChain</span></div>
            <p>Ask a question and press <b>Run agent pipeline</b>. The agents work one at a time: the <b>watcher agents and models</b> look for risk and late deliveries,
              the <b>AI agent</b> plans with the Domo LLM and calls its specialist analysts on Neon, the <b>validator</b> checks every figure, the <b>output agents</b> answer,
              alert owners and draft supplier requests, and a <b>person approves</b> before anything reaches a supplier. Click any node to see its details.</p>
          </div>
        </div>
        <div className="ax-run">
          <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === "Enter" && run()} aria-label="Question for the agent" />
          <select value="" onChange={e => e.target.value && setQ(e.target.value)} aria-label="Example questions">
            <option value="">Examples…</option>{QUESTIONS.map(x => <option key={x} value={x}>{x}</option>)}
          </select>
          {running
            ? <button className="ax-stop" onClick={() => abort.current?.abort()}><Square size={14} /> Stop</button>
            : <button className="ax-go" onClick={run} disabled={!q.trim() || !c}><Play size={15} /> Run agent pipeline</button>}
          <label className="ax-mail"><input type="checkbox" checked={autoMail} onChange={e => setAutoMail(e.target.checked)} /> <Mail size={13} /> Auto-email to
            <select value={mailTo} onChange={e => setMailTo(e.target.value)} aria-label="Email recipients">
              <option value="BOTH_SUP">Owners + affected suppliers</option><option value="SUPPLIERS">Affected suppliers only</option>
              <option value="BOTH">Procurement + Quality</option><option value="PROCUREMENT">Procurement</option><option value="QUALITY">Quality</option><option value="QUALITY_SUP">Quality + affected suppliers</option></select></label>
          <button className="ax-ghost" disabled={!v.final} onClick={() => outRef.current?.scrollIntoView({ behavior: "smooth" })}><ArrowDown size={14} /> Answer</button>
          <button className="ax-ghost" disabled={!v.mail && !v.supMail} onClick={() => mailRef.current?.scrollIntoView({ behavior: "smooth" })}><MailCheck size={14} /> Email</button>
          {started && !running && <button className="ax-ghost" title="Reset" aria-label="Reset" onClick={() => { setEvents([]); setReplay(false); setT0(null); setRunKey(0); setProg({ pct: 0, step: 0, total: 0, label: null }); }}><RotateCcw size={14} /></button>}
        </div>
        <div className="ax-prog">
          <span>Execution status: <b>{!started ? `Ready · ${FLOW_PARTS} agents & models` : running && !prog.label ? "Starting" : v.err ? "Stopped" : prog.label && prog.label !== "Complete" ? `Step ${prog.step} of ${prog.total} · ${prog.label}` : replay ? "Replay of a stored answer" : "Completed"}</b>
            {v.datasets.length > 0 && <> · {v.datasets.length} dataset(s) read</>}</span>
          <span className="ax-view" role="tablist" aria-label="View"><button className="on" role="tab" aria-selected="true"><Workflow size={13} /> Agent Flow</button></span>
          <b className="ax-pct">{prog.pct}% completed</b>
          <div className="ax-bar"><i style={{ width: `${prog.pct}%` }} /></div>
        </div>

        <AgentFlowBoard parts={parts} v={v} running={running} runKey={runKey} mailCfg={mailCfg} catalog={c} onOpen={openPage}
          onLog={(k, text) => push({ type: "stage", k, text })} onProgress={setProg} />

        <div className="ax-console" ref={logRef} aria-live="polite">
          <div className="ax-console-h"><Terminal size={13} /> Agent execution stream (stdout / telemetry)</div>
          {v.log.length === 0
            ? <div className="ax-line"><span className="t">[--:--:--]</span><span className="k k-info">⚡</span> Pipeline in standby. Type a question and click “Run agent pipeline”, or open “How this answer was built” from any chat answer.</div>
            : v.log.map(([t, k, m], i) => <div key={i} className="ax-line"><span className="t">[{t}]</span><span className={`k k-${k}`}>{{ info: "›", ok: "✓", llm: "◆", tool: "⚙", warn: "!", err: "✕" }[k]}</span> {m}</div>)}
          {running && <div className="ax-line"><span className="t">[{ts()}]</span><span className="k k-llm">◆</span> working<span className="ax-dots" /></div>}
        </div>
      </section>

      <section className={"ax-out" + (v.final ? " ready" : "")} ref={outRef}>
        {v.final?.answer ? <>
          <header><span className="ax-badge-ic sm"><Bot size={16} /></span><div><b>Agent answer</b><span>{q}</span></div></header>
          <div className="aa-answer"><AnswerView content={v.final.answer} A={A} suppliers={sups.data || []} allowed={allowed} /></div>
          <DrillBar answer={v.final.answer} steps={v.final.steps} catalog={c} allowed={allowed} suppliers={sups.data} onNav={nav} onSupplier={openSupplier} />
        </> : <div className="ax-wait">
          <span className="ax-wait-ic"><Wrench size={20} /></span>
          <b>{running ? "The agent is working…" : "Answer (awaiting execution)"}</b>
          <span>{running ? "Each layer above ticks over as it finishes; the answer appears here with drill-through links." : "Run the pipeline above. The answer, with links to the suppliers and pages behind it, will appear here."}</span>
        </div>}
      </section>

      <section className={"ax-out ax-mailout" + (v.mail || v.supMail ? " ready" : "")} ref={mailRef}>
        {v.supMail && <SupplierMailOut data={v.supMail} canSend={["ADMIN", "QUALITY"].includes(user?.role)} onSent={r => push({ type: "sup_sent", result: r })} />}
        {v.supMail && v.mail && <div className="sm-sep">Internal alert to owners</div>}
        {v.mail ? <>
          <header><span className="ax-badge-ic sm mail"><MailCheck size={16} /></span><div><b>Dispatched alert email</b><span>{v.mail.subject}</span></div>
            {v.final?.answer && !running && <button className="ax-ghost sm" onClick={() => sendMail(q, v.final)}><Send size={13} /> Send again</button>}</header>
          <div className="ax-mail-meta">
            <div><span>From</span><b>{v.mail.from}</b></div>
            <div><span>To</span><b>{v.mail.recipients.map(r => `${r.role.toLowerCase()} owner${r.email ? ` <${r.email}>` : ""}`).join(", ")}</b></div>
            <div><span>Sent</span><b>{String(v.mail.sent_at).slice(0, 19).replace("T", " ")}</b></div>
            <div><span>Delivery</span><b>{v.mail.recipients.map(r => <span key={r.role} className={`ax-dl ${r.status === "SENT_VIA_SMTP" ? "ok" : "warn"}`}>{r.role.toLowerCase()}: {r.status === "SENT_VIA_SMTP" ? "e-mailed" : "in-app only"}</span>)}</b></div>
          </div>
          {!v.mail.smtp && <div className="ax-mail-note">E-mail is not set up on this server (SMTP_HOST / NOTIFY_*_EMAIL in backend/.env), so the alert went to the owners' in-app inbox. This is the e-mail they will receive once SMTP is configured.</div>}
          <div className="ax-mail-body" dangerouslySetInnerHTML={{ __html: v.mail.html }} />
        </> : !v.supMail && <div className="ax-wait">
          <span className="ax-wait-ic"><Mail size={20} /></span>
          <b>Dispatched alert email (awaiting execution)</b>
          <span>{autoMail ? (toSup ? "When the run finishes, owners get the answer as an alert and every supplier named in it with poor-quality or damaged material gets its own e-mail draft here, for you to approve and send." : "When the run finishes, the verified answer is compiled into an HTML alert and e-mailed to the chosen owner; it appears here.") : "Auto-email is off. After the run you can send the answer from here."}</span>
          {!autoMail && v.final?.answer && !running && <button className="ax-go" onClick={() => sendMail(q, v.final)}><Send size={14} /> Send email now</button>}
        </div>}
      </section>
    </div>
  );
}
