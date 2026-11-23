import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Factory, Mail, Save, Send, Users } from "lucide-react";
import { api } from "../api";

/** Supplier ids named in an agent answer: explicit SUP-ids, supplier names, and supplier_id inputs of the tools it ran. */
export function suppliersIn(answer, steps, suppliers) {
  const ids = new Set((answer || "").match(/\bSUP-\d{3,}\b/g) || []);
  const low = (answer || "").toLowerCase();
  (suppliers || []).forEach(s => s.supplier_name && low.includes(s.supplier_name.toLowerCase()) && ids.add(s.supplier_id));
  (steps || []).forEach(s => { const v = s.input?.supplier_id; if (typeof v === "string" && /^SUP-\d+$/.test(v)) ids.add(v); });
  return [...ids];
}

const ST = { SENT: ["ok", "e-mailed"], NO_EMAIL: ["warn", "portal only (no address)"], NOT_CONFIGURED: ["warn", "portal only (SMTP not set)"], FAILED: ["bad", "e-mail failed, in portal"] };

/** Layer 6, supplier side: one draft per affected supplier, reviewed here, sent with one click by Quality/Admin. */
export default function SupplierMailOut({ data, canSend, onSent }) {
  const [pick, setPick] = useState({}), [mail, setMail] = useState({}), [open, setOpen] = useState(null);
  const [sent, setSent] = useState({}), [busy, setBusy] = useState(false), [err, setErr] = useState(null);
  useEffect(() => {
    setPick(Object.fromEntries((data?.drafts || []).map(d => [d.id, true])));
    setMail(Object.fromEntries((data?.drafts || []).map(d => [d.supplier_id, d.contact_email || ""])));
    setSent({}); setErr(null); setOpen(data?.drafts?.[0]?.id ?? null);
  }, [data]);
  if (!data) return null;
  const drafts = data.drafts || [], chosen = drafts.filter(d => pick[d.id] && !sent[d.id]);

  async function saveContact(d) {
    const e = (mail[d.supplier_id] || "").trim();
    if (!e) return;
    try { await api.contactSave(d.supplier_id, { email: e }); d.contact_email = e; setErr(null); setMail(m => ({ ...m })); }
    catch (x) { setErr(`${d.supplier_name}: ${x.message}`); }
  }
  async function sendAll() {
    setBusy(true); setErr(null);
    try {
      for (const d of chosen) if ((mail[d.supplier_id] || "").trim() && mail[d.supplier_id].trim() !== (d.contact_email || "")) await saveContact(d);
      const r = await api.qiSendAll({ ids: chosen.map(d => d.id) });
      const m = { ...sent }; r.results.forEach(x => { m[x.id] = x; }); setSent(m); onSent?.(r);
    } catch (x) { setErr(x.message); }
    setBusy(false);
  }

  return (
    <div className="sm-out">
      <div className="sm-head">
        <span className="ax-badge-ic sm sup"><Factory size={16} /></span>
        <div><b>Supplier quality e-mails</b><span>One e-mail per supplier, listing only that supplier's own poor-quality / damaged material and asking for the reason. Nothing is sent until you click Send.</span></div>
        {drafts.length > 0 && (canSend
          ? <button className="ax-go sm" disabled={busy || !chosen.length} onClick={sendAll}><Send size={14} /> {busy ? "Sending…" : `Send to ${chosen.length} supplier${chosen.length === 1 ? "" : "s"}`}</button>
          : <span className="sm-lock">Sending is approved by Quality or an admin</span>)}
      </div>
      {!data.smtp && drafts.length > 0 && <div className="ax-mail-note">E-mail (SMTP) is not configured on this server, so each request is delivered to the supplier's portal inbox with its reply link. Once SMTP_HOST is set in backend/.env the same e-mails go to the addresses below.</div>}
      {err && <div className="ax-mail-note bad"><AlertTriangle size={13} /> {err}</div>}
      {drafts.length === 0 && <div className="sm-empty"><Users size={16} /> No supplier named in this answer has poor-quality or damaged material in the last 60 days, so no supplier e-mail was prepared.</div>}
      <div className="sm-list">
        {drafts.map(d => {
          const s = sent[d.id], tone = s ? (s.ok ? ST[s.email_status]?.[0] || "ok" : "bad") : null;
          const ev = Array.isArray(d.evidence) ? d.evidence : [];
          return (
            <article key={d.id} className={"sm-card" + (open === d.id ? " open" : "") + (s ? " done" : "")}>
              <header onClick={() => setOpen(open === d.id ? null : d.id)}>
                <input type="checkbox" checked={!!pick[d.id]} disabled={!!s} onClick={e => e.stopPropagation()} onChange={e => setPick(p => ({ ...p, [d.id]: e.target.checked }))} aria-label={`Include ${d.supplier_name}`} />
                <div className="sm-who"><b>{d.supplier_name}</b><span>{d.supplier_id} · inquiry #{d.id}{d.existing ? " · existing draft" : ""}</span></div>
                <div className="sm-mats">{ev.slice(0, 3).map((r, i) => <span key={i} className="sm-mat">{r.material_id} · {r.defect_name} · {r.defects}</span>)}</div>
                {s ? <span className={`ax-dl ${tone}`}>{s.ok ? <><CheckCircle2 size={11} /> {ST[s.email_status]?.[1] || s.email_status}</> : s.error}</span>
                  : <span className={`ax-dl ${d.contact_email ? "ok" : "warn"}`}>{d.contact_email ? "address on file" : "no address"}</span>}
              </header>
              {open === d.id && <div className="sm-body">
                <div className="sm-to">
                  <span><Mail size={12} /> To</span>
                  <input type="email" placeholder="supplier quality e-mail (optional; portal is always used)" value={mail[d.supplier_id] || ""} disabled={!!s}
                    onChange={e => setMail(m => ({ ...m, [d.supplier_id]: e.target.value }))} />
                  {!s && (mail[d.supplier_id] || "") !== (d.contact_email || "") && (mail[d.supplier_id] || "").trim() &&
                    <button className="ax-ghost sm" onClick={() => saveContact(d)}><Save size={12} /> Save address</button>}
                </div>
                <div className="sm-subj"><span>Subject</span><b>{d.subject}</b></div>
                <pre className="sm-msg">{d.message}</pre>
                {s?.reply_link && <div className="sm-link">Reply link sent: <code>{s.reply_link}</code></div>}
              </div>}
            </article>);
        })}
      </div>
      {(data.skipped || []).length > 0 && <div className="sm-skip"><b>Not e-mailed:</b> {data.skipped.map(x => `${x.supplier_name || x.supplier_id} (${x.reason})`).join(" · ")}</div>}
    </div>
  );
}
