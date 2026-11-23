// Risk Radar > Follow-ups: what the agent is doing on its own about late orders. For every late PO line it asked the supplier
// (portal) for a new date, reminds after the reply window, escalates to procurement, records the reply, and closes the line
// when the goods arrive. People see the progress here and step in where it is escalated.
import { useMemo, useState } from "react";
import { AlertTriangle, BellRing, CheckCircle2, Clock, MessageSquareReply, PlayCircle, Send } from "lucide-react";
import { api } from "../api";
import { fmt, useLoad } from "../util";

const STAGES = [
  ["REQUESTED", "Asked", "Supplier asked for a new date", Send],
  ["REMINDED", "Reminded", "No reply within the window; reminder sent", BellRing],
  ["ESCALATED", "Escalated", "Still no reply; procurement must step in", AlertTriangle],
  ["CONFIRMED", "Confirmed", "Supplier gave a new date and reason", MessageSquareReply],
  ["CLOSED", "Closed", "Goods received or line no longer late", CheckCircle2],
];
const when = ts => { if (!ts) return "–"; const d = new Date(ts), h = (d - Date.now()) / 36e5;
  if (Math.abs(h) < 48) return h >= 0 ? `in ${Math.max(1, Math.round(h))} h` : `${Math.max(1, Math.round(-h))} h ago`;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }); };

export default function Followups({ user, openSupplier }) {
  const d = useLoad(() => api.followups(), []);
  const [stage, setStage] = useState("");
  const [busy, setBusy] = useState(false), [msg, setMsg] = useState(""), [err, setErr] = useState("");
  const canRun = ["ADMIN", "PROCUREMENT"].includes(user?.role);
  const rows = useMemo(() => (d.data?.rows || []).filter(r => (stage ? r.stage === stage : r.stage !== "CLOSED"))
    .sort((a, b) => ["ESCALATED", "REMINDED", "REQUESTED", "CONFIRMED", "CLOSED"].indexOf(a.stage) - ["ESCALATED", "REMINDED", "REQUESTED", "CONFIRMED", "CLOSED"].indexOf(b.stage)), [d.data, stage]);
  const by = d.data?.by_stage || {}, pol = d.data?.policy || {}, last = d.data?.last_run;
  const run = async () => { setBusy(true); setErr(""); setMsg("");
    try { const r = await api.followupsRun(); setMsg(r.status === "OK" ? `Done: ${r.requested || 0} asked, ${r.reminded || 0} reminded, ${r.escalated || 0} escalated, ${r.closed || 0} closed.` : r.error || r.skipped); d.reload(); }
    catch (e) { setErr(e.message); } finally { setBusy(false); } };

  return <div className="fu">
    <div className="card fu-head">
      <div className="fu-intro">
        <h3>The agent follows up on late orders by itself</h3>
        <p>For every order line past its promised date it asks the supplier, in their portal, for a new date and the reason within <b>{pol.followup_reply_hours} hours</b>.
          No reply: a reminder. Still none after <b>{pol.followup_escalate_hours} hours</b>: escalated to procurement. Replies come back here, and the line closes when the goods arrive.
          Date changes of up to <b>{pol.auto_approve_days} days</b>, asked before the original date, are approved automatically. Suppliers are never e-mailed automatically.</p>
        <div className="fu-run">
          {canRun && <button className="primary chip-btn" disabled={busy} onClick={run}><PlayCircle size={13} /> {busy ? "Running…" : "Run follow-up now"}</button>}
          <span className="muted">{last ? `Runs every scheduler cycle. Last run ${when(last.started_at)}.` : "Runs every scheduler cycle."}</span>
          {msg && <span className="fu-ok"><CheckCircle2 size={13} /> {msg}</span>}{err && <span className="err">{err}</span>}
        </div>
      </div>
      <ol className="fu-flow">{STAGES.map(([k, l, h, I]) => <li key={k}><button className={`fu-st s-${k}` + (stage === k ? " on" : "")} aria-pressed={stage === k} onClick={() => setStage(stage === k ? "" : k)} title={h}>
        <I size={15} /><b>{fmt(by[k] || 0, 0)}</b><span>{l}</span></button></li>)}</ol>
    </div>

    <div className="card">
      <h3>{stage ? `${STAGES.find(s => s[0] === stage)[1]} lines` : "Open follow-ups"} <span className="muted">{rows.length}</span>
        {stage && <button className="ghost chip-btn" style={{ marginLeft: 10 }} onClick={() => setStage("")}>Show all open</button>}</h3>
      {d.loading ? <div className="skeleton" style={{ height: 240 }} /> : !rows.length ? <p className="muted">Nothing here. Late lines appear after the next run.</p> :
        <div className="tbl-wrap fu-tbl"><table className="tbl"><thead><tr><th>Supplier</th><th>Order line</th><th>Material</th><th>Promised</th><th>Status</th><th>Reply due</th><th>New date and reason</th></tr></thead>
          <tbody>{rows.map(r => <tr key={r.id} className={`fu-r s-${r.stage}`}>
            <td><button className="link-btn" onClick={() => openSupplier(r.supplier_id)}>{r.supplier_name || r.supplier_id}</button></td>
            <td>{r.po_id}/{r.po_line}</td><td>{r.material_name}</td><td>{r.promised_date}</td>
            <td><span className={`fu-pill s-${r.stage}`}>{STAGES.find(s => s[0] === r.stage)?.[1] || r.stage}</span></td>
            <td className={r.stage !== "CONFIRMED" && new Date(r.reply_due) < Date.now() ? "fu-over" : ""}>{r.stage === "CONFIRMED" ? `replied ${when(r.responded_at)}` : <><Clock size={11} /> {when(r.reply_due)}</>}</td>
            <td>{r.confirmed_date ? <><b>{r.confirmed_date}</b> · {r.reason_label}{r.reason_text ? `: ${r.reason_text}` : ""}</> : <span className="muted">waiting</span>}</td>
          </tr>)}</tbody></table></div>}
    </div>
  </div>;
}

/* the supplier's side: answer each request with a new date and a reason */
export function FollowupRequests() {
  const d = useLoad(() => api.portalFollowups().catch(() => ({ rows: [] })), []);
  const [form, setForm] = useState({}), [done, setDone] = useState({}), [err, setErr] = useState({});
  const rows = (d.data?.rows || []).filter(r => r.stage !== "CLOSED"), reasons = d.data?.reasons || {};
  if (!rows.length) return null;
  const set = (id, k, v) => setForm(f => ({ ...f, [id]: { ...(f[id] || {}), [k]: v } }));
  const send = async r => { const f = form[r.id] || {};
    setErr(e => ({ ...e, [r.id]: "" }));
    if (!f.date || !f.reason) { setErr(e => ({ ...e, [r.id]: "Pick a new date and a reason." })); return; }
    try { await api.portalFollowupRespond(r.id, { confirmed_date: f.date, reason_code: f.reason, reason_text: f.note || "" }); setDone(x => ({ ...x, [r.id]: f.date })); }
    catch (e) { setErr(x => ({ ...x, [r.id]: e.message })); } };
  const waiting = rows.filter(r => r.stage !== "CONFIRMED" && !done[r.id]).length;
  return <section className="card fu-sup">
    <h3><MessageSquareReply size={16} /> Delivery date requests <span className="muted">{waiting} waiting for your answer</span></h3>
    <p className="muted">These order lines are past their promised date. Tell your customer when each will arrive and why. Your answer goes straight to their buyer.</p>
    <div className="fu-sup-list">{rows.map(r => {
      const ok = done[r.id] || (r.stage === "CONFIRMED" && r.confirmed_date);
      return <div key={r.id} className={"fu-sup-row" + (ok ? " ok" : "") + (r.stage === "ESCALATED" ? " esc" : "")}>
        <div className="fu-sup-l"><b>{r.po_id}/{r.po_line} · {r.material_name}</b>
          <span>Promised {r.promised_date} · {fmt(r.ordered_qty, 0)} units · {r.stage === "ESCALATED" ? "escalated to the buyer" : r.stage === "REMINDED" ? "reminder sent" : `answer by ${when(r.reply_due)}`}</span></div>
        {ok ? <span className="fu-ok"><CheckCircle2 size={14} /> New date {done[r.id] || r.confirmed_date} sent</span> : <div className="fu-sup-f">
          <input type="date" aria-label="New delivery date" value={form[r.id]?.date || ""} onChange={e => set(r.id, "date", e.target.value)} />
          <select aria-label="Reason" value={form[r.id]?.reason || ""} onChange={e => set(r.id, "reason", e.target.value)}>
            <option value="">Reason…</option>{Object.entries(reasons).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          <input placeholder="Note (optional)" aria-label="Note" value={form[r.id]?.note || ""} onChange={e => set(r.id, "note", e.target.value)} />
          <button className="primary chip-btn" onClick={() => send(r)}><Send size={12} /> Send new date</button>
          {err[r.id] && <span className="err">{err[r.id]}</span>}
        </div>}
      </div>;
    })}</div>
  </section>;
}
