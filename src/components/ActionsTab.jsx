import { useState } from "react";
import { Bot, CalendarClock, ClipboardList, FileCheck2, FileText, Mail, Plus, Send, Sparkles, X } from "lucide-react";
import { api } from "../api";
import { useLoad } from "../util";
import QualityInquiries from "./QualityInquiries";

/* Corrective-action tracker + promise-date change approvals (Risk Radar → Actions tab).
   Workflow (top to bottom): Proposed → Approved → Supplier responded → Verified → Closed. The agent may only propose;
   approval / verification / closure belong to the owning function (backend enforces it). */
const STAGES = [
  { id: "PROPOSED", label: "Proposed", hint: "awaiting the owner's approval (agent proposals land here)" },
  { id: "APPROVED", label: "Approved", hint: "with the supplier for containment and root cause" },
  { id: "SUPPLIER_RESPONDED", label: "Supplier responded", hint: "owner verifies the response or reopens" },
  { id: "VERIFIED", label: "Verified", hint: "fix confirmed effective; ready to close" },
  { id: "CLOSED", label: "Closed / rejected", hint: "finished or declined" },
];
const PRI = { CRITICAL: "sev-CRITICAL", HIGH: "sev-HIGH", MEDIUM: "sev-MEDIUM", LOW: "sev-LOW" };
const EMPTY = { supplier_id: "", title: "", description: "", category: "DELIVERY", priority: "HIGH", owner_role: "PROCUREMENT" };

export default function ActionsTab({ user, features, openSupplier, suppliers = [], seed, clearSeed }) {
  const extras = !!features?.workflow_extras;
  const [dRole, setDRole] = useState(user?.role === "QUALITY" ? "quality" : "procurement");
  const dg = useLoad(() => (extras ? api.digest(dRole).catch(() => null) : Promise.resolve(null)), [dRole, extras]);
  const [ev, setEv] = useState({ po: "", line: 1 }), [evData, setEvData] = useState(null), [busy, setBusy] = useState(false);
  const acts = useLoad(() => api.actions(), []);
  const stats = useLoad(() => api.actionStats(), [acts.data]);
  const pcs = useLoad(() => api.promiseChanges({ status: "PROPOSED" }).catch(() => []), []);
  const [form, setForm] = useState(seed && !seed.qi ? seed : null);
  const [msg, setMsg] = useState("");
  const role = user?.role;
  const canEdit = ["ADMIN", "PROCUREMENT", "QUALITY"].includes(role);
  const owns = a => role === "ADMIN" || role === a.owner_role;
  const canDecideDates = ["ADMIN", "PROCUREMENT"].includes(role);
  const flash = m => { setMsg(m); setTimeout(() => setMsg(""), 3500); };
  const move = (a, status, extra = {}) => api.updateAction(a.id, { status, ...extra }).then(() => { acts.reload(); flash(`#${a.id} → ${status.replace("_", " ").toLowerCase()}`); }).catch(e => flash(e.message));
  const respond = a => { const r = prompt("Supplier response / containment details:"); if (r) move(a, "SUPPLIER_RESPONDED", { supplier_response: r }); };
  const decide = (c, status) => api.decidePromiseChange(c.id, { status }).then(() => { pcs.reload(); flash(`Promise change ${status.toLowerCase()}`); }).catch(e => flash(e.message));
  const create = () => api.createAction(form).then(() => { setForm(null); clearSeed?.(); acts.reload(); flash("Action proposed; the owner approves it below."); }).catch(e => flash(e.message));
  const draft8d = () => form?.supplier_id && api.capaDraft(form.supplier_id).then(d => setForm({ ...form, title: d.title, description: d.description,
    category: d.category, priority: d.priority, owner_role: d.owner_role })).catch(e => flash(e.message));
  const sendDigest = () => api.runJob("digest").then(r => flash(r.status === "OK" ? "Weekly digest sent to procurement and quality" : `Digest: ${r.error || r.status}`)).catch(e => flash(e.message));
  const lookEv = () => { setEvData(null); api.evidence(ev.po.trim(), ev.line).then(setEvData).catch(e => flash(e.message)); };
  const getPdf = () => { setBusy(true); api.evidencePdf(ev.po.trim(), ev.line).then(n => flash(`Downloaded ${n}`)).catch(e => flash(e.message)).finally(() => setBusy(false)); };
  const list = acts.data || [];
  const s = stats.data || {};

  return (
    <div className="at">
      <div className="at-kpis">
        <div><span>Open actions</span><b>{list.filter(a => !["CLOSED", "REJECTED"].includes(a.status)).length}</b></div>
        <div><span>Awaiting approval</span><b className={s.by_status?.PROPOSED ? "warn" : ""}>{s.by_status?.PROPOSED || 0}</b></div>
        <div><span>Overdue</span><b className={s.overdue ? "bad" : ""}>{s.overdue || 0}</b></div>
        <div><span>Avg supplier response</span><b>{s.avg_supplier_response_days != null ? `${s.avg_supplier_response_days} d` : "–"}</b></div>
        <div><span>Promise changes to decide</span><b className={(pcs.data || []).length ? "warn" : ""}>{(pcs.data || []).length}</b></div>
        {canEdit && <button className="primary row-flex" onClick={() => setForm(form ? null : EMPTY)}>{form ? <X size={14} /> : <Plus size={14} />} {form ? "Cancel" : "New action"}</button>}
      </div>
      {msg && <div className="set-flash">{msg}</div>}

      {form && <section className="at-form">
        <select value={form.supplier_id} onChange={e => setForm({ ...form, supplier_id: e.target.value })} aria-label="Supplier">
          <option value="">Supplier…</option>{suppliers.map(x => <option key={x.supplier_id} value={x.supplier_id}>{x.supplier_id} · {x.supplier_name}</option>)}</select>
        <input className="grow" placeholder="Title" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} aria-label="Title" />
        <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} aria-label="Category">
          {["DELIVERY", "QUALITY", "RESPONSIVENESS", "COMMERCIAL", "CAPACITY"].map(c => <option key={c}>{c}</option>)}</select>
        <select value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })} aria-label="Priority">
          {["CRITICAL", "HIGH", "MEDIUM", "LOW"].map(c => <option key={c}>{c}</option>)}</select>
        <select value={form.owner_role} onChange={e => setForm({ ...form, owner_role: e.target.value })} aria-label="Owner">
          <option value="PROCUREMENT">Procurement</option><option value="QUALITY">Quality</option></select>
        <textarea className={form.description.startsWith("8D") ? "at-letter" : ""} placeholder="What should the supplier do, and why (evidence)" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} aria-label="Description" />
        {extras && <button className="ghost row-flex" disabled={!form.supplier_id} onClick={draft8d} title="Fill an 8D request from this supplier's data"><Sparkles size={14} /> Draft 8D request</button>}
        <button className="primary" disabled={!form.supplier_id || form.title.trim().length < 4} onClick={create}>Propose</button>
        {form.description.startsWith("8D") && <span className="set-hint">After approval the supplier sees this request in their portal; their reply is tracked here.</span>}
      </section>}

      {features?.quality_inquiry && <QualityInquiries user={user} suppliers={suppliers} flash={flash} reloadKey={seed?.qi}
        onMakeAction={f => { setForm({ ...EMPTY, ...f }); window.scrollTo?.(0, 0); }} />}

      <div className="at-grid">
        <section className="at-wf">
          <h4><ClipboardList size={14} /> Corrective-action workflow <span className="muted">{list.length} action(s)</span></h4>
          <ol className="caw">
            {STAGES.map((c, i) => {
              const items = list.filter(a => (c.id === "CLOSED" ? ["CLOSED", "REJECTED"].includes(a.status) : a.status === c.id));
              return (
                <li key={c.id} className={"wf-stage" + (items.length ? " has" : " idle")}>
                  <span className="caw-node" aria-hidden="true">{i + 1}</span>
                  <div className="wf-body">
                    <div className="wf-head"><b>{c.label}</b><span className="wf-count">{items.length}</span><span className="wf-hint">{c.hint}</span></div>
                    {items.length > 0 && <div className="wf-cards">{items.map(a => (
                      <div className="task" key={a.id}>
                        <div className="row-flex" style={{ gap: 6 }}>
                          <span className={`pill ${PRI[a.priority]}`}>{a.priority}</span><span className="pill st">{a.category}</span>
                          {a.origin === "AGENT" && <span className="pill sev-LOW"><Bot size={11} /> agent</span>}
                          {a.status === "REJECTED" && <span className="pill sev-HIGH">rejected</span>}
                        </div>
                        <div className="tt">#{a.id} {a.title}</div>
                        <div className="muted" style={{ cursor: "pointer" }} onClick={() => openSupplier(a.supplier_id)}>{a.supplier_id} · owner {a.owner_role.toLowerCase()} · due {a.due_date || "–"}</div>
                        {a.description && <div className="sec" style={{ marginTop: 4, whiteSpace: "pre-wrap" }}>{a.description.slice(0, 200)}</div>}
                        {a.supplier_response && <div style={{ marginTop: 4, color: "var(--chart-c4)" }}>↳ {a.supplier_response}</div>}
                        <div className="row">
                          {a.status === "PROPOSED" && owns(a) && <><button className="primary chip-btn" onClick={() => move(a, "APPROVED")}>Approve</button>
                            <button className="ghost chip-btn" onClick={() => move(a, "REJECTED")}>Reject</button></>}
                          {a.status === "APPROVED" && canEdit && <button className="primary chip-btn" onClick={() => respond(a)}>Record response</button>}
                          {a.status === "SUPPLIER_RESPONDED" && owns(a) && <><button className="primary chip-btn" onClick={() => move(a, "VERIFIED")}>Verify effective</button>
                            <button className="ghost chip-btn" onClick={() => move(a, "APPROVED", { note: "Response insufficient" })}>Reopen</button></>}
                          {a.status === "VERIFIED" && owns(a) && <button className="primary chip-btn" onClick={() => move(a, "CLOSED")}>Close</button>}
                        </div>
                      </div>))}</div>}
                  </div>
                </li>);
            })}
          </ol>
        </section>

        <div className="at-side">
        <section className="at-pc">
          <h4><CalendarClock size={14} /> Promise-date changes <span className="muted">only approved changes move the OTIF baseline</span></h4>
          {(pcs.data || []).length === 0 && <div className="set-hint">No changes waiting for a decision. Suppliers request them in the supplier portal.</div>}
          {(pcs.data || []).map(c => (
            <div key={c.id} className="at-pc-row">
              <div><b>{c.po_id}/{c.po_line}</b> <span className="muted">{c.supplier_id}</span></div>
              <div className="sec">{String(c.old_promise).slice(0, 10)} → <b>{String(c.new_promise).slice(0, 10)}</b> · {c.reason || "no reason given"}</div>
              {canDecideDates && <div className="row-flex" style={{ gap: 6 }}>
                <button className="primary chip-btn" onClick={() => decide(c, "APPROVED")}>Approve</button>
                <button className="ghost chip-btn" onClick={() => decide(c, "REJECTED")}>Reject</button></div>}
            </div>))}
        </section>

        {extras && <section className="at-pc">
          <h4><FileCheck2 size={14} /> Dispute evidence pack <span className="muted">everything recorded about one PO line</span></h4>
          <div className="row-flex" style={{ gap: 6, flexWrap: "nowrap" }}>
            <input placeholder="PO id, e.g. POC-000001" value={ev.po} onChange={e => setEv({ ...ev, po: e.target.value })} aria-label="PO id" style={{ flex: 1, minWidth: 0 }} />
            <input type="number" min={1} value={ev.line} onChange={e => setEv({ ...ev, line: Number(e.target.value) || 1 })} aria-label="PO line" style={{ width: 58 }} />
            <button className="ghost chip-btn" disabled={!ev.po.trim()} onClick={lookEv}>Check</button>
          </div>
          {evData && <div className="at-ev">
            <b>{evData.po.supplier_name} · {evData.po.material_name}</b>
            <span>Promise {String(evData.po.promised_date)}{evData.po.promise_changed ? " (approved change)" : ""} · received {String(evData.po.receipt_date || "not yet")}</span>
            <span>OTIF <b className={evData.po.otif ? "okt" : "badt"}>{evData.po.otif ? "met" : "missed"}</b> · {evData.promise_changes.length} change request(s) · {evData.exclusions.length} exclusion(s) · {evData.grn.length} GRN · {evData.invoices.length} invoice(s)</span>
          </div>}
          <button className="primary row-flex" disabled={!ev.po.trim() || busy} onClick={getPdf}><FileText size={14} /> {busy ? "Building…" : "Download evidence PDF"}</button>
        </section>}

        {extras && <section className="at-pc">
          <h4><Mail size={14} /> Weekly supplier digest <span className="muted">sent every Monday</span></h4>
          <div className="seg" style={{ alignSelf: "flex-start" }}>{["procurement", "quality"].map(r => <button key={r} className={dRole === r ? "on" : ""} onClick={() => setDRole(r)}>{r[0].toUpperCase() + r.slice(1)}</button>)}</div>
          {dg.loading && !dg.data && <div className="skeleton" style={{ height: 120 }} />}
          {dg.data && <><b className="at-dg-s">{dg.data.subject}</b><pre className="at-dg">{dg.data.body}</pre></>}
          {role === "ADMIN" && <button className="ghost row-flex" onClick={sendDigest}><Send size={14} /> Send now to both owners</button>}
        </section>}
        </div>
      </div>
    </div>
  );
}
