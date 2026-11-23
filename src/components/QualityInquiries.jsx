import { useState } from "react";
import { Bot, CheckCircle2, Copy, Mail, MailWarning, MessageSquareReply, Plus, Send, ShieldQuestion } from "lucide-react";
import { api } from "../api";
import { useLoad } from "../util";

/* Supplier quality inquiries (flag quality_inquiry): ask a supplier for the reason behind poor-quality material.
   Draft (agent or person) -> Send (e-mail with signed reply link + supplier portal) -> Supplier replies (link or portal) -> Close.
   Nothing is e-mailed until a person clicks Send. Without SMTP the app says so and offers the reply link to copy. */
const STAGE = { DRAFT: "Draft · review and send", SENT: "Sent · waiting for the supplier", RESPONDED: "Supplier replied · review", CLOSED: "Closed" };
const EMAIL = { SENT: ["sev-LOW", "e-mailed"], NOT_CONFIGURED: ["sev-MEDIUM", "e-mail not set up · portal only"], NO_EMAIL: ["sev-MEDIUM", "no e-mail · portal only"], FAILED: ["sev-HIGH", "e-mail failed · portal only"] };

export default function QualityInquiries({ user, suppliers = [], flash, onMakeAction, reloadKey }) {
  const qi = useLoad(() => api.qiList().catch(() => ({ items: [] })), [reloadKey]);
  const [emails, setEmails] = useState({});
  const [newSup, setNewSup] = useState("");
  const [open, setOpen] = useState(null);
  const canSend = ["ADMIN", "QUALITY"].includes(user?.role);
  const canDraft = ["ADMIN", "QUALITY", "PROCUREMENT"].includes(user?.role);
  const items = qi.data?.items || [];
  const smtp = qi.data?.smtp;
  const by = st => items.filter(x => x.status === st);

  const draft = () => newSup && api.qiDraft({ supplier_id: newSup }).then(d => { setNewSup(""); qi.reload(); setOpen(d.id); flash(`Draft #${d.id} created for ${d.supplier_id}`); }).catch(e => flash(e.message));
  const send = q => {
    const email = (emails[q.id] ?? q.contact_email ?? "").trim();
    api.qiSend(q.id, { email: email || null, save_contact: true }).then(r => {
      qi.reload();
      flash(r.email_status === "SENT" ? `Sent to ${email} and to the supplier portal` : `In the supplier portal. E-mail: ${EMAIL[r.email_status]?.[1] || r.email_status}`);
    }).catch(e => flash(e.message));
  };
  const copyLink = q => api.qiLink(q.id).then(r => navigator.clipboard?.writeText(r.link).then(() => flash("Reply link copied: paste it into your own e-mail to the supplier"))).catch(e => flash(e.message));
  const close = q => { const n = prompt("Closing note (e.g. reason accepted, containment verified):", "Reason accepted"); if (n !== null) api.qiClose(q.id, { note: n }).then(() => { qi.reload(); flash(`Inquiry #${q.id} closed`); }).catch(e => flash(e.message)); };
  const toAction = q => onMakeAction?.({ supplier_id: q.supplier_id, title: `Quality: ${q.defect_name || q.material_id || "material"} (inquiry #${q.id})`.slice(0, 190),
    description: `Supplier reason: ${q.reason}\nContainment: ${q.containment || "–"}\nCorrective action: ${q.corrective_action || "–"}\nEffective from: ${q.commit_date || "–"}`,
    category: "QUALITY", priority: "HIGH", owner_role: "QUALITY" });

  return (
    <section className="qi">
      <header className="qi-h">
        <h4><ShieldQuestion size={15} /> Supplier quality inquiries <span className="muted">ask the supplier why their material failed; they reply by e-mail link or in the portal</span></h4>
        {smtp === false && <span className="pill sev-MEDIUM" title="Set SMTP_HOST / SMTP_USER / SMTP_PASSWORD / SMTP_FROM in backend/.env to e-mail suppliers"><MailWarning size={12} /> e-mail not set up</span>}
        {canDraft && <div className="qi-new">
          <select value={newSup} onChange={e => setNewSup(e.target.value)} aria-label="Supplier for a new inquiry">
            <option value="">Ask a supplier…</option>{suppliers.map(s => <option key={s.supplier_id} value={s.supplier_id}>{s.supplier_id} · {s.supplier_name}</option>)}</select>
          <button className="primary chip-btn row-flex" disabled={!newSup} onClick={draft}><Plus size={12} /> Draft</button>
        </div>}
      </header>
      <div className="qi-cols">
        {["DRAFT", "SENT", "RESPONDED", "CLOSED"].map(st => (
          <div key={st} className={`qi-col st-${st}`}>
            <div className="qi-col-h"><b>{STAGE[st]}</b><span className="wf-count">{by(st).length}</span></div>
            {by(st).length === 0 && <div className="set-hint">None</div>}
            {by(st).slice(0, st === "CLOSED" ? 4 : 20).map(q => (
              <div key={q.id} className={"qi-card" + (open === q.id ? " open" : "")}>
                <button className="qi-top" onClick={() => setOpen(open === q.id ? null : q.id)}>
                  <b>#{q.id} {q.supplier_id}</b>{q.origin === "AGENT" && <span className="pill sev-LOW"><Bot size={10} /> agent</span>}
                  <span className="qi-sub">{q.defect_name || "quality trend"}{q.material_id ? ` · ${q.material_id}` : ""}</span>
                </button>
                {st === "SENT" && <div className="qi-meta">due {String(q.due_date)} · <span className={`pill ${EMAIL[q.email_status]?.[0] || "st"}`}>{EMAIL[q.email_status]?.[1] || q.email_status}</span></div>}
                {open === q.id && <pre className="qi-msg">{q.message}</pre>}
                {st === "DRAFT" && canSend && <div className="qi-send">
                  <input type="email" placeholder="supplier quality e-mail" value={emails[q.id] ?? q.contact_email ?? ""} onChange={e => setEmails({ ...emails, [q.id]: e.target.value })} aria-label="Supplier e-mail" />
                  <button className="primary chip-btn row-flex" onClick={() => send(q)}><Send size={12} /> Send</button>
                </div>}
                {st === "SENT" && <div className="row-flex" style={{ gap: 6 }}><button className="ghost chip-btn row-flex" onClick={() => copyLink(q)}><Copy size={12} /> Copy reply link</button></div>}
                {(st === "RESPONDED" || st === "CLOSED") && q.reason && <div className="qi-reply">
                  <span><MessageSquareReply size={12} /> via {String(q.responded_via || "").toLowerCase().replace("_", " ")} · {String(q.responded_at || "").slice(0, 16).replace("T", " ")}</span>
                  <b>Reason:</b> {q.reason}{q.containment && <><br /><b>Containment:</b> {q.containment}</>}
                  {q.corrective_action && <><br /><b>Corrective action:</b> {q.corrective_action}</>}{q.commit_date && <><br /><b>Effective from:</b> {String(q.commit_date)}</>}
                </div>}
                {st === "RESPONDED" && canSend && <div className="row-flex" style={{ gap: 6 }}>
                  <button className="primary chip-btn row-flex" onClick={() => close(q)}><CheckCircle2 size={12} /> Accept & close</button>
                  <button className="ghost chip-btn row-flex" onClick={() => toAction(q)}><Mail size={12} /> Make corrective action</button></div>}
              </div>))}
          </div>))}
      </div>
    </section>
  );
}
