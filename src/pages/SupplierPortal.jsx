import { useState } from "react";
import { CalendarClock, ClipboardList, MessageSquareReply, PackageOpen, ShieldAlert, ShieldQuestion } from "lucide-react";
import { api } from "../api";
import KpiTile from "../components/KpiTile";
import SupplierFleet from "../components/SupplierFleet";
import { FollowupRequests } from "../components/Followups";
import { Card, Empty, PageHead } from "../components/ui";
import { fmt, useLoad } from "../util";

// Supplier-facing portal (C4): a supplier user sees ONLY their own company - scorecard, open NCRs, approved corrective
// actions and open PO lines - and can respond to NCRs/actions and request promise-date changes for procurement approval.
export default function SupplierPortal() {
  const d = useLoad(() => api.portal(), []);
  const qi = useLoad(() => api.portalQi().catch(() => []), []);
  const [rep, setRep] = useState({});                       // reply drafts per inquiry
  const setR = (id, k, v) => setRep(r => ({ ...r, [id]: { ...(r[id] || {}), [k]: v } }));
  const sendReply = q => run(() => api.portalQiRespond(q.id, { reason: rep[q.id]?.reason || "", containment: rep[q.id]?.containment || "",
    corrective_action: rep[q.id]?.corrective_action || "", commit_date: rep[q.id]?.commit_date || null }).then(qi.reload), `Reply sent for inquiry #${q.id}.`);
  const [msg, setMsg] = useState(""), [err, setErr] = useState("");
  const run = async (fn, ok) => { setErr(""); setMsg(""); try { await fn(); setMsg(ok); d.reload(); } catch (e) { setErr(e.message); } };
  const respondNcr = n => { const r = prompt(`Response / root cause for ${n.ncr_id}:`); if (r) run(() => api.portalNcrRespond(n.ncr_id, { response: r }), `Response sent for ${n.ncr_id}.`); };
  const respondAct = a => { const r = prompt(`Response / containment for action #${a.id}:`); if (r) run(() => api.portalActionRespond(a.id, { response: r }), `Response sent for action #${a.id}.`); };
  const changeDate = l => {
    const nd = prompt(`New promise date for ${l.po_id}/${l.po_line} (YYYY-MM-DD). Current: ${l.promised_date}`); if (!nd) return;
    const reason = prompt("Reason for the change (sent to procurement for approval):"); if (!reason) return;
    run(() => api.portalPromiseChange({ po_id: l.po_id, po_line: l.po_line, new_promise: nd, reason }), "Promise-date change sent to procurement for approval.");
  };
  const x = d.data, sc = x?.scorecard;
  if (d.err) return <div className="err">{d.err}</div>;
  return (
    <>
      <PageHead eyebrow="Supplier portal" title={sc?.supplier_name || "Your performance"} sub={`Your scorecard as measured by the customer · data as of ${x?.as_of_date || "…"}`} />
      {msg && <div className="ok-note" style={{ marginBottom: 12 }}>{msg}</div>}
      {err && <div className="err" style={{ marginBottom: 12 }}>{err}</div>}
      <div className="grid g-kpi" style={{ marginBottom: 16 }}>
        <KpiTile label="Composite score" value={sc?.composite_score} decimals={1} hint={sc ? `Grade ${sc.grade} · health ${sc.health?.replace("_", " ").toLowerCase()}` : ""} />
        <KpiTile label="OTIF" value={sc?.otif_pct} unit="%" color="var(--chart-c1)" />
        <KpiTile label="Incoming PPM" value={sc?.incoming_ppm} decimals={0} color="var(--brand-orange)" hint={sc?.ppm_method === "INCOMING_INSPECTION" ? "Incoming inspection" : "Genealogy-attributed estimate"} />
        <KpiTile label="Avg NCR response" value={sc?.avg_response_days} unit=" d" color="var(--chart-c4)" hint="NCR opened → your first response" />
      </div>
      {!!x?.requests?.length && <Card title={`Requests from the customer (${x.requests.length})`} icon={ShieldAlert} sub="Respond through the matching NCR or corrective action below">
        {x.requests.slice(0, 8).map(r => <div key={r.id} className="dash-risk"><span className={`pill sev-${r.severity}`}>{r.severity}</span><b>{r.subject}</b>
          <span className="muted">{r.created_at?.slice(0, 10)}</span></div>)}
      </Card>}
      {!!qi.data?.length && <Card title={`Quality inquiries (${qi.data.filter(q => q.status === "SENT").length} waiting for your reply)`} icon={ShieldQuestion}
        sub="Your customer found a quality problem with material you supplied and asks for the reason">
        {qi.data.map(q => (
          <div key={q.id} className="task" style={{ marginBottom: 10 }}>
            <div className="row-flex" style={{ gap: 6 }}><span className={`pill ${q.status === "SENT" ? "sev-HIGH" : q.status === "RESPONDED" ? "sev-LOW" : "st"}`}>{q.status === "SENT" ? "reply needed" : q.status.toLowerCase()}</span>
              <span className="muted">#{q.id} · due {q.due_date}</span></div>
            <div className="tt">{q.subject}</div>
            <details><summary className="muted" style={{ cursor: "pointer" }}>Read the full request</summary><pre className="qi-msg">{q.message}</pre></details>
            {q.status === "SENT" ? <div className="qi-form">
              <textarea placeholder="1. Reason / root cause *" value={rep[q.id]?.reason || ""} onChange={e => setR(q.id, "reason", e.target.value)} aria-label="Reason" />
              <textarea placeholder="2. Containment (stock checked, lots blocked or sorted)" value={rep[q.id]?.containment || ""} onChange={e => setR(q.id, "containment", e.target.value)} aria-label="Containment" />
              <textarea placeholder="3. Corrective action" value={rep[q.id]?.corrective_action || ""} onChange={e => setR(q.id, "corrective_action", e.target.value)} aria-label="Corrective action" />
              <div className="row-flex"><label className="muted">Effective from <input type="date" value={rep[q.id]?.commit_date || ""} onChange={e => setR(q.id, "commit_date", e.target.value)} /></label>
                <button className="primary chip-btn" disabled={(rep[q.id]?.reason || "").trim().length < 5} onClick={() => sendReply(q)}><MessageSquareReply size={12} /> Send reply</button></div>
            </div> : q.reason && <div style={{ color: "var(--chart-c4)" }}>↳ {q.reason}</div>}
          </div>))}
      </Card>}
      <FollowupRequests />
      <SupplierFleet />
      <div className="grid g-2e portal-grid">
        <Card title={`Open NCRs (${x?.open_ncrs?.length ?? 0})`} icon={ShieldAlert} sub="Respond with root cause and containment">
          {!x?.open_ncrs?.length ? <Empty icon={ShieldAlert} title="No open NCRs" /> : (
            <div className="tbl-wrap"><table className="tbl"><thead><tr><th>NCR</th><th>Defect</th><th>Material</th><th>Due</th><th className="num">Age</th><th /></tr></thead>
              <tbody>{x.open_ncrs.map(n => (
                <tr key={n.ncr_id}><td>{n.ncr_id}{n.is_overdue && <span className="pill sev-HIGH" style={{ marginLeft: 6 }}>overdue</span>}</td>
                  <td>{n.defect_name}</td><td>{n.material_id}</td><td>{n.capa_due_date}</td><td className="num">{n.open_age_days} d</td>
                  <td style={{ whiteSpace: "nowrap" }}>{n.first_response_at ? <span className="muted">responded</span> : <button className="primary chip-btn" onClick={() => respondNcr(n)}><MessageSquareReply size={12} /> Respond</button>}</td></tr>))}
              </tbody></table></div>)}
        </Card>
        <Card title="Corrective actions" icon={ClipboardList} sub="Approved actions awaiting your response">
          {!x?.actions?.length ? <Empty icon={ClipboardList} title="No actions" /> : x.actions.map(a => (
            <div key={a.id} className="task" style={{ marginBottom: 8 }}>
              <div className="row-flex" style={{ gap: 6 }}><span className={`pill sev-${a.priority}`}>{a.priority}</span><span className="pill st">{a.status.replace("_", " ")}</span><span className="muted">due {a.due_date}</span></div>
              <div className="tt">#{a.id} {a.title}</div>
              {a.supplier_response && <div style={{ color: "var(--chart-c4)" }}>↳ {a.supplier_response}</div>}
              {a.status === "APPROVED" && <div className="row"><button className="primary chip-btn" onClick={() => respondAct(a)}>Respond</button></div>}
            </div>))}
        </Card>
      </div>
      <Card title="Open purchase-order lines" icon={PackageOpen} sub="Request a promise-date change - only changes approved before the original date move the OTIF baseline">
        {!x?.open_pos?.length ? <Empty icon={PackageOpen} title="No open lines" /> : (
          <div className="tbl-wrap"><table className="tbl"><thead><tr><th>PO line</th><th>Material</th><th>Plant</th><th>Promise</th><th className="num">Ordered</th><th>Status</th><th /></tr></thead>
            <tbody>{x.open_pos.map(l => (
              <tr key={`${l.po_id}-${l.po_line}`}><td>{l.po_id}/{l.po_line}</td><td>{l.material_name}</td><td>{l.plant_id}</td>
                <td>{l.promised_date}{l.promise_changed && <span className="muted"> (was {l.original_promised_date})</span>}</td>
                <td className="num">{fmt(l.ordered_qty, 0)}</td><td><span className={`pill ${l.delivery_status === "PAST_DUE" ? "sev-HIGH" : "st"}`}>{l.delivery_status.replace("_", " ")}</span></td>
                <td><button className="ghost chip-btn" onClick={() => changeDate(l)}><CalendarClock size={12} /> Change date</button></td></tr>))}
            </tbody></table></div>)}
      </Card>
      {!!x?.promise_changes?.length && <Card title="Your promise-date requests" icon={CalendarClock}>
        <div className="tbl-wrap"><table className="tbl"><thead><tr><th>PO line</th><th>Old</th><th>New</th><th>Reason</th><th>Status</th></tr></thead>
          <tbody>{x.promise_changes.map(c => <tr key={c.id}><td>{c.po_id}/{c.po_line}</td><td>{c.old_promise}</td><td>{c.new_promise}</td><td>{c.reason}</td>
            <td><span className={`pill ${c.status === "APPROVED" ? "sev-LOW" : c.status === "REJECTED" ? "sev-HIGH" : "st"}`}>{c.status}</span></td></tr>)}</tbody></table></div>
      </Card>}
    </>
  );
}
