// Risk Radar alert list, built as a ledger of exposure: every alert leads with the number that says how bad it is
// (money outstanding, hours of line stoppage, overdue CAPA, failed inspections), then who and what, the materials by name,
// one plain next step, and buttons named for what they do and who they reach.
import { useMemo, useState } from "react";
import { Bell, Bot, Check, ClipboardPlus, MailQuestion, Scale } from "lucide-react";
import { fmt, inr } from "../util";

const SEV = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, INFO: 4 };
const SEV_WORD = { CRITICAL: "Critical", HIGH: "High", MEDIUM: "Medium", LOW: "Low", INFO: "Info" };
const NAME = { PAST_DUE_SUPPLY: "Past-due supply", SUPPLY_DISRUPTION: "Line stoppage", OVERDUE_CAPA: "Overdue CAPA", REPEATED_DEFECT: "Repeat defect",
  QUALITY_DETERIORATION: "Rising defects", OTIF_DETERIORATION: "Falling OTIF", REPEATED_LATE_DELIVERY: "Repeated late delivery", CONCENTRATION: "Concentration" };
const owner = a => (/DEFECT|QUALITY|CAPA/.test(a.type) ? "quality" : "procurement");
const num = (s, rx) => { const m = (s || "").match(rx); return m ? Number(m[1].replace(/,/g, "")) : null; };

/* the headline number of one alert, by kind */
function measure(a) {
  const m = a.metric || {};
  switch (a.type) {
    case "PAST_DUE_SUPPLY": {
      const old = num(a.detail, /oldest (\d+) days?/);
      return { big: inr(m.value_inr), unit: "outstanding", sub: `${fmt(m.lines, 0)} PO lines${old != null ? `, oldest ${old} days late` : ""}`, v: m.value_inr || 0 };
    }
    case "SUPPLY_DISRUPTION": {
      const units = num(a.detail, /~([\d,]+) units/);
      return { big: `${fmt(m.hours, 1)} h`, unit: "line stopped", sub: units != null ? `about ${fmt(units, 0)} units of output lost` : "", v: (m.hours || 0) * 1e6 };
    }
    case "OVERDUE_CAPA":
      return { big: fmt(Math.round(m.overdue || 0), 0), unit: "CAPA overdue", sub: m.max_age_days ? `oldest open ${m.max_age_days} days` : "", v: (m.overdue || 0) * 1e5 };
    case "REPEATED_DEFECT":
      return { big: fmt(m.inspections, 0), unit: "failed inspections", sub: "in the last 30 days", v: (m.inspections || 0) * 1e4 };
    default: {
      const n = num(a.title, /([\d.,]+)/);
      return { big: n != null ? fmt(n, 1) : "–", unit: NAME[a.type] || a.type, sub: "", v: n || 0 };
    }
  }
}

/* the detail without its trailing list of material codes (shown as named tags instead) */
/* why the alert has its severity: the server's own rule, in words */
export function why(a) {
  const m = a.metric || {}, s = a.severity;
  const w = { CRITICAL: "Critical", HIGH: "High", MEDIUM: "Medium", LOW: "Low" }[s] || s;
  switch (a.type) {
    case "PAST_DUE_SUPPLY": { const old = num(a.detail, /oldest (\d+) days?/); return [w, `the oldest line is ${old} days late (critical from 14 days, high from 7)`]; }
    case "SUPPLY_DISRUPTION": return [w, `${fmt(m.hours, 1)} hours of stoppage (high from 4 hours)`];
    case "OVERDUE_CAPA": return [w, s === "HIGH" ? `${fmt(m.overdue, 1)} overdue or the oldest open ${m.max_age_days} days (high from 5 overdue or 60 days)` : "fewer than 5 overdue and none older than 60 days"];
    case "REPEATED_DEFECT": return [w, `${fmt(m.attributed, 1)} defects traced to this supplier in 30 days (high from 3.5)`];
    case "REPEATED_LATE_DELIVERY": return [w, "the last 3 deliveries were all late"];
    case "CONCENTRATION": return [w, "it follows the supplier's own risk tier"];
    default: return null;
  }
}

/* one plain sentence: what the numbers mean for us */
export function explain(a, listed = true) {
  const m = a.metric || {};
  switch (a.type) {
    case "PAST_DUE_SUPPLY": {
      const old = num(a.detail, /oldest (\d+) days?/);
      return `${fmt(m.lines, 0)} order lines worth ${inr(m.value_inr)} should already have arrived from this supplier and have not.${old != null ? ` The oldest is ${old} days past its promised date.` : ""}${listed ? " The affected materials are listed below." : ""}`;
    }
    case "SUPPLY_DISRUPTION": {
      const units = num(a.detail, /~([\d,]+) units/);
      return `Our production lines stood still for ${fmt(m.hours, 1)} hours waiting for this supplier's late material${units != null ? `, losing about ${fmt(units, 0)} units of output` : ""}.`;
    }
    case "OVERDUE_CAPA": {
      const ncr = num(a.detail, /^(\d+) NCRs/);
      return `This supplier owes us corrective actions that are past their due date${ncr != null ? `: ${ncr} quality problems (NCRs) involve its parts` : ""}${m.max_age_days ? `, and the oldest has been open ${m.max_age_days} days` : ""}. Where a problem involves several suppliers it is shared between them, so the count can be a fraction.`;
    }
    case "REPEATED_DEFECT": {
      const what = (a.title || "").replace(/^Repeat defect:\s*/i, "");
      return `The same defect, ${what.toLowerCase()}, keeps coming back: ${fmt(m.inspections, 0)} failed inspections in the last 30 days point to this supplier's parts (${fmt(m.attributed, 1)} defects traced to it after sharing with other suppliers in the same build).`;
    }
    default: return cleanDetail(a.detail);
  }
}
const cleanDetail = d => (d || "").replace(/\s*\(materials? [^)]*\)/i, "").replace(/;?\s*materials? (MAT-[A-Z0-9-]+,?\s*)+\.?\s*$/i, "").replace(/\s*$/, "").replace(/([^.])$/, "$1.");

/* exposure strip: one tile per signal, with the total that matters for it */
function strip(all) {
  const by = {};
  for (const a of all) (by[a.type] ||= []).push(a);
  const sups = xs => new Set(xs.map(a => a.supplier_id)).size;
  const tile = (type, big, label, xs) => ({ type, big, label, n: xs.length, sups: sups(xs), crit: xs.filter(a => a.severity === "CRITICAL").length });
  const out = [];
  if (by.PAST_DUE_SUPPLY) out.push(tile("PAST_DUE_SUPPLY", inr(by.PAST_DUE_SUPPLY.reduce((s, a) => s + (a.metric?.value_inr || 0), 0)), "outstanding on late orders", by.PAST_DUE_SUPPLY));
  if (by.SUPPLY_DISRUPTION) out.push(tile("SUPPLY_DISRUPTION", `${fmt(by.SUPPLY_DISRUPTION.reduce((s, a) => s + (a.metric?.hours || 0), 0), 1)} h`, "of line stoppage", by.SUPPLY_DISRUPTION));
  if (by.OVERDUE_CAPA) out.push(tile("OVERDUE_CAPA", fmt(Math.round(by.OVERDUE_CAPA.reduce((s, a) => s + (a.metric?.overdue || 0), 0)), 0), "corrective actions overdue", by.OVERDUE_CAPA));
  if (by.REPEATED_DEFECT) out.push(tile("REPEATED_DEFECT", fmt(by.REPEATED_DEFECT.length, 0), "defects repeating", by.REPEATED_DEFECT));
  for (const t of Object.keys(by)) if (!out.some(o => o.type === t)) out.push(tile(t, fmt(by[t].length, 0), (NAME[t] || t).toLowerCase(), by[t]));
  return out;
}

export default function AlertLedger({ rows, all, loading, type, setType, mats, canAct, canSource, quality, followups = {}, onFollowups, onSourcing, onNotify, onAction, onAsk, onAskSupplier, onMaterial, onSupplier }) {
  const [open, setOpen] = useState({});                  // alert id -> show all materials
  const [sent, setSent] = useState({});                  // alert id -> notified
  const matName = useMemo(() => Object.fromEntries((mats || []).map(m => [m.material_id, m.material_name])), [mats]);
  const tiles = useMemo(() => strip(all || []), [all]);
  const sorted = useMemo(() => rows.map(a => ({ a, m: measure(a) })).sort((x, y) => (SEV[x.a.severity] ?? 9) - (SEV[y.a.severity] ?? 9) || y.m.v - x.m.v), [rows]);

  const notify = async a => { try { await onNotify(a); setSent(s => ({ ...s, [a.id]: true })); } catch { /* the page shows the error */ } };

  return <div className="al">
    <div className="al-strip" role="group" aria-label="Filter alerts by signal">
      {tiles.map(t => <button key={t.type} className={"al-tile" + (type === t.type ? " on" : "")} aria-pressed={type === t.type} onClick={() => setType(type === t.type ? "" : t.type)}>
        <span className="al-tile-n">{NAME[t.type] || t.type}</span>
        <b>{t.big}</b>
        <span className="al-tile-l">{t.label}</span>
        <span className="al-tile-f">{t.n} alert{t.n === 1 ? "" : "s"}, {t.sups} supplier{t.sups === 1 ? "" : "s"}{t.crit ? <>, <em>{t.crit} critical</em></> : ""}</span>
      </button>)}
    </div>

    <div className="al-head"><h3>{type ? `${NAME[type] || type} alerts` : "All alerts"} <span className="muted">{rows.length}</span></h3>
      {type && <button className="ghost chip-btn" onClick={() => setType("")}>Show all signals</button>}</div>
    {loading && <div className="skeleton" style={{ height: 300 }} />}
    {!loading && !rows.length && <p className="al-empty">No alerts match these filters. Clear a filter to see more.</p>}

    <ol className="al-list">{sorted.map(({ a, m }) => {
      const codes = [...new Set((a.detail || "").match(/MAT-[A-Z]+-\d+/g) || [])];
      const shown = open[a.id] ? codes : codes.slice(0, 5);
      const who = owner(a);
      return <li key={a.id} className={`al-row al-s-${a.severity}`}>
        <div className="al-mag">
          <b>{m.big}</b><span className="al-unit">{m.unit}</span>
          {m.sub && <span className="al-sub">{m.sub}</span>}
        </div>
        <div className="al-body">
          <div className="al-meta"><span className={`al-sev s-${a.severity}`}>{SEV_WORD[a.severity] || a.severity}</span><span className="al-kind">{NAME[a.type] || a.type}</span></div>
          <h4><button className="al-sup" onClick={() => onSupplier(a.supplier_id)} title="Open supplier profile">{a.supplier_name}</button>: {a.title}</h4>
          {(() => { const y = why(a); return y && <p className="al-why"><b>{y[0]}</b> because {y[1]}.</p>; })()}
          <p className="al-detail">{explain(a)}</p>
          {!!codes.length && <div className="al-mats">{shown.map(c => <button key={c} className="al-mat" onClick={() => onMaterial(c)} disabled={!canSource}
              title={canSource ? `${c}: compare suppliers for this material` : c}>{matName[c] || c}</button>)}
            {codes.length > 5 && <button className="al-more" onClick={() => setOpen(o => ({ ...o, [a.id]: !o[a.id] }))}>{open[a.id] ? "Show fewer" : `${codes.length - 5} more`}</button>}</div>}
          {a.type === "PAST_DUE_SUPPLY" && followups[a.supplier_id] ? (() => { const f = followups[a.supplier_id]; return <button className="al-auto" onClick={onFollowups} title="See the agent's follow-up for these lines">
            <span>Agent is on it</span>Asked the supplier for new dates on {f.asked} line{f.asked === 1 ? "" : "s"}: {f.confirmed} confirmed{f.escalated ? `, ${f.escalated} escalated to procurement` : ""}.</button>; })()
            : <p className="al-next"><span>Next step</span>{a.recommended_action}</p>}
          <div className="al-acts">
            {sent[a.id] ? <span className="al-done"><Check size={13} /> Sent to {who}</span>
              : <button className="ghost chip-btn" onClick={() => notify(a)} title={`Post this alert to the ${who} team's notifications in the app`}><Bell size={13} /> Notify {who}</button>}
            {canAct && a.supplier_id && <button className="ghost chip-btn" onClick={() => onAction(a)} title="Open a prefilled corrective action in the Actions tab"><ClipboardPlus size={13} /> Draft corrective action</button>}
            {quality(a) && <button className="ghost chip-btn" onClick={() => onAskSupplier(a)} title="Draft an e-mail and portal request asking the supplier for the reason; a person sends it"><MailQuestion size={13} /> Ask the supplier why</button>}
            {onSourcing && ["REPEATED_DEFECT", "REPEATED_LATE_DELIVERY", "OTIF_DETERIORATION"].includes(a.type) && <button className="ghost chip-btn" onClick={onSourcing} title="See whether another supplier should take this material"><Scale size={13} /> Review alternative suppliers</button>}
            <button className="ghost chip-btn" onClick={() => onAsk(a)} title="The agent investigates exposure and next steps in the chat"><Bot size={13} /> Ask the agent</button>
          </div>
        </div>
      </li>;
    })}</ol>
  </div>;
}
