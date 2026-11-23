import { useState } from "react";
import { Check, Inbox, MessageSquareReply, UserPlus, X } from "lucide-react";
import { api } from "../api";
import { SEV_VAR, useLoad } from "../util";
import { FSelect } from "./ui";

// Alert inbox (enhancement 1.3): each alert has a stable identity and a lifecycle; every action is recorded with who/when.
const STATUS = [["OPEN", "Open"], ["ACKNOWLEDGED", "Acknowledged"], ["ASSIGNED", "Assigned"], ["RESPONSE_REQUESTED", "Response requested"], ["CLOSED", "Closed"]];

export default function AlertInbox({ user, openSupplier }) {
  const [status, setStatus] = useState("");
  const ev = useLoad(() => api.alertEvents({ status }), [status]);
  const people = useLoad(() => api.assignees().catch(() => []), []);
  const [err, setErr] = useState(""), [open, setOpen] = useState(null);
  const canAct = user && user.role !== "VIEWER";
  const act = async (e, action, extra = {}) => {
    setErr("");
    try { await api.alertAction(e.id, { action, ...extra }); ev.reload(); } catch (x) { setErr(x.message); }
  };
  const assign = e => {
    const names = (people.data || []).map(p => p.username).join(", ");
    const who = prompt(`Assign to (${names}):`); if (who) act(e, "assign", { assignee: who.trim(), note: prompt("Note (optional):") || undefined });
  };
  const rows = ev.data || [];
  const counts = rows.reduce((m, r) => ({ ...m, [r.status]: (m[r.status] || 0) + 1 }), {});
  return (
    <div className="card">
      <h3 style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span><Inbox size={16} /> Alert inbox <span className="muted">{rows.length} active · {STATUS.map(([k, l]) => counts[k] ? `${counts[k]} ${l.toLowerCase()}` : null).filter(Boolean).join(" · ")}</span></span>
        <FSelect label="Status" value={status} onChange={setStatus} options={STATUS} />
      </h3>
      {err && <div className="err" style={{ marginBottom: 8 }}>{err}</div>}
      {ev.loading && !rows.length && <div className="skeleton" style={{ height: 200 }} />}
      {rows.map(e => (
        <div className="alert" key={e.id}>
          <i className="stripe" style={{ background: SEV_VAR[e.severity] }} />
          <div>
            <div className="row-flex" style={{ gap: 6 }}>
              <span className={`pill sev-${e.severity}`}>{e.severity}</span><span className="pill st">{e.status.replace("_", " ")}</span>
              {e.assignee && <span className="muted">→ {e.assignee}</span>}<span className="muted">owner {e.owner_role} · #{e.id}</span>
            </div>
            <div className="t" style={{ marginTop: 6, cursor: "pointer" }} onClick={() => e.supplier_id && openSupplier(e.supplier_id)}>{e.supplier_name || "Portfolio"} · {e.title}</div>
            <div className="d">{e.detail}</div>
            <button className="ghost chip-btn" style={{ marginTop: 4 }} onClick={() => setOpen(open === e.id ? null : e.id)}>{open === e.id ? "Hide" : "History"} ({(e.history || []).length})</button>
            {open === e.id && <div className="inbox-hist">{(e.history || []).map((h, i) => <div key={i}><b>{h.status}</b> · {h.by} · {h.at?.slice(0, 16).replace("T", " ")}{h.assignee ? ` · → ${h.assignee}` : ""}{h.note ? ` · ${h.note}` : ""}</div>)}</div>}
          </div>
          {canAct && <div className="acts">
            {e.status === "OPEN" && <button className="primary chip-btn row-flex" onClick={() => act(e, "ack")}><Check size={13} /> Acknowledge</button>}
            {e.status !== "CLOSED" && <button className="ghost chip-btn row-flex" onClick={() => assign(e)}><UserPlus size={13} /> Assign</button>}
            {["OPEN", "ACKNOWLEDGED", "ASSIGNED"].includes(e.status) && e.supplier_id && <button className="ghost chip-btn row-flex" onClick={() => act(e, "request_response")}><MessageSquareReply size={13} /> Request supplier response</button>}
            {e.status !== "CLOSED" ? <button className="ghost chip-btn row-flex" onClick={() => act(e, "close", { note: prompt("Closing note:") || undefined })}><X size={13} /> Close</button>
              : <button className="ghost chip-btn" onClick={() => act(e, "reopen")}>Reopen</button>}
          </div>}
        </div>))}
      {!ev.loading && !rows.length && <div className="muted">No alerts in this status.</div>}
    </div>
  );
}
