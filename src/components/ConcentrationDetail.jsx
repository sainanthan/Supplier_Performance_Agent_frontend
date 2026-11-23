// Detail behind one cell of the spend-concentration heatmap (material x supplier), or behind a material row:
// how dependent we are, how the material's spend is split, how this supplier performs on it, and what to do next.
// Decision support only: sourcing and award decisions stay with procurement.
import { useMemo } from "react";
import { AlertTriangle, ArrowRight, Bot, CheckCircle2, ClipboardPlus, Grid3x3, Layers, Scale, UserRound } from "lucide-react";
import SidePanel from "./SidePanel";
import { api } from "../api";
import { fmt, inr, useLoad } from "../util";

export default function ConcentrationDetail({ cell, conc, sups, alerts, concMax, colour, canSource, onClose, onCell, onSupplier, onAsk, onAction, onSourcing }) {
  const { m, s } = cell;
  const rows = useMemo(() => (conc || []).filter(r => r.material_id === m && r.share_pct > 0).sort((a, b) => b.share_pct - a.share_pct), [conc, m]);
  const me = s ? rows.find(r => r.supplier_id === s) : null;
  const name = rows[0]?.material_name || m;
  const total = rows.reduce((a, r) => a + (r.spend_inr || 0), 0);
  const top = rows[0];
  const hhi = Math.round(rows.reduce((a, r) => a + r.share_pct * r.share_pct, 0));          // Herfindahl index, 0-10,000
  const card = s ? (sups || []).find(c => c.supplier_id === s) : null;
  const src = useLoad(() => (canSource ? api.sourcing(m).catch(() => []) : Promise.resolve([])), [m]);
  const mine = s ? (src.data || []).find(r => r.supplier_id === s) : null;
  const best = k => { const v = (src.data || []).map(r => r[k]).filter(x => x != null); return v.length ? Math.max(...v) : null; };
  const avg = k => { const v = (src.data || []).map(r => r[k]).filter(x => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  const other = s ? (conc || []).filter(r => r.supplier_id === s && r.material_id !== m && r.share_pct > 0).sort((a, b) => b.share_pct - a.share_pct).slice(0, 6) : [];
  const supAlerts = s ? (alerts || []).filter(a => a.supplier_id === s) : [];

  const share = me ? me.share_pct : top?.share_pct || 0;
  const level = share >= concMax ? "bad" : share >= concMax * 0.62 ? "warn" : "ok";
  const verdict = s
    ? level === "bad" ? `${me?.supplier_name} holds ${fmt(share)}% of ${name} spend: above the ${concMax}% concentration alert level.`
      : level === "warn" ? `${me?.supplier_name} holds ${fmt(share)}% of ${name} spend: approaching the ${concMax}% alert level.`
      : `${me?.supplier_name} holds ${fmt(share)}% of ${name} spend: well spread, below the ${concMax}% alert level.`
    : `${name} is bought from ${rows.length} suppliers; the largest holds ${fmt(top?.share_pct)}%.`;
  const todo = level === "bad"
    ? ["Check whether a qualified second source exists and how much volume it could take.", "Review the supplier's capacity and delivery record before new orders are placed.", "Agree a safety-stock level for this material while dependence stays high."]
    : level === "warn"
      ? ["Watch this share in the next review: new orders could push it over the alert level.", "Confirm at least one other supplier stays qualified for this material."]
      : ["No action needed for concentration. Keep monitoring delivery and quality."];

  return <SidePanel onClose={onClose} width={760} icon={<span className="cc-ic"><Grid3x3 size={20} /></span>}
    title={s ? `${name} × ${me?.supplier_name || s}` : name} sub={s ? `${m} · ${s} · spend concentration` : `${m} · spend split across suppliers`}
    footer={<div className="cc-foot">
      {s && <button className="primary chip-btn" onClick={() => onSupplier(s)}><UserRound size={13} /> Supplier profile</button>}
      <button className="ghost chip-btn" onClick={() => onAsk(s ? `Assess the concentration risk of ${me?.supplier_name} for ${name} (${m}): share, delivery, quality and alternatives.` : `Assess the supplier concentration for ${name} (${m}).`)}><Bot size={13} /> Ask the agent</button>
      {canSource && <button className="ghost chip-btn" onClick={() => onSourcing(m)}><Scale size={13} /> Sourcing comparison</button>}
      {s && level !== "ok" && <button className="ghost chip-btn" onClick={() => onAction({ supplier_id: s, material_id: m, name, supplier_name: me?.supplier_name, share })}><ClipboardPlus size={13} /> Raise action</button>}
    </div>}>
    <div className="cc">
      <div className={`cc-verdict ${level}`}>{level === "ok" ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}<p>{verdict}</p></div>

      <div className="cc-kpis">
        <div><span>{s ? "Share of material spend" : "Largest share"}</span><b style={{ color: level === "bad" ? "var(--depth-0)" : undefined }}>{fmt(share)}%</b><em>alert at {concMax}%</em></div>
        <div><span>{s ? "Spend with supplier" : "Total spend"}</span><b>{inr(s ? me?.spend_inr : total)}</b><em>{s ? `of ${inr(total)} total` : `${rows.length} suppliers`}</em></div>
        <div><span>Suppliers for this material</span><b>{rows.length}</b><em>HHI {fmt(hhi, 0)} {hhi >= 2500 ? "· concentrated" : hhi >= 1500 ? "· moderate" : "· spread"}</em></div>
        {s && <div><span>Supplier risk</span><b>{me?.risk_tier || "–"}</b><em>{me?.supplier_country}</em></div>}
      </div>

      <section><h4><Layers size={14} /> How {name} spend is split</h4>
        <div className="cc-bars">{rows.map(r => <button key={r.supplier_id} className={"cc-bar" + (r.supplier_id === s ? " on" : "")} onClick={() => onCell({ m, s: r.supplier_id })} title={`Open ${r.supplier_name}`}>
          <span className="cc-bn">{r.supplier_name}<em>{r.risk_tier}</em></span>
          <span className="cc-track"><i style={{ width: `${Math.min(100, (r.share_pct / Math.max(concMax * 1.2, top?.share_pct || 1)) * 100)}%`, background: colour(r.share_pct) }} />
            <u style={{ left: `${(concMax / Math.max(concMax * 1.2, top?.share_pct || 1)) * 100}%` }} title={`${concMax}% alert level`} /></span>
          <span className="cc-bv">{fmt(r.share_pct)}%</span></button>)}</div>
        <p className="cc-note">Dashed line = {concMax}% concentration alert level. Click a supplier to switch.</p></section>

      {s && <section><h4><UserRound size={14} /> How {me?.supplier_name} performs</h4>
        <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Measure</th><th className="num">This supplier</th><th className="num">{mine ? "Material average" : "Portfolio"}</th></tr></thead><tbody>
          {mine ? <>
            <tr><td>OTIF on this material</td><td className="num">{fmt(mine.otif_pct)}%</td><td className="num">{fmt(avg("otif_pct"))}%</td></tr>
            <tr><td>Average price</td><td className="num">{inr(mine.avg_price_inr)}</td><td className="num">standard {inr(mine.standard_price_inr)}</td></tr>
            <tr><td>Average lead time</td><td className="num">{fmt(mine.avg_lead_time_days)} d</td><td className="num">{fmt(avg("avg_lead_time_days"))} d</td></tr>
            <tr><td>Order lines</td><td className="num">{fmt(mine.lines, 0)}</td><td className="num">{fmt(avg("lines"), 0)}</td></tr>
            {mine.commercial_score != null && <tr><td>Commercial score (quote)</td><td className="num">{fmt(mine.commercial_score)}</td><td className="num">best {fmt(best("commercial_score"))}</td></tr>}
          </> : card ? <>
            <tr><td>Grade / composite score</td><td className="num">{card.grade} · {fmt(card.composite_score)}</td><td className="num">–</td></tr>
            <tr><td>OTIF (all materials)</td><td className="num">{fmt(card.otif_pct)}%</td><td className="num">–</td></tr>
            <tr><td>Incoming PPM</td><td className="num">{fmt(card.incoming_ppm, 0)}</td><td className="num">–</td></tr>
          </> : <tr><td colSpan={3}>No performance data.</td></tr>}
        </tbody></table></div>
        {card && mine && <p className="cc-note">Overall: grade <b>{card.grade}</b>, OTIF {fmt(card.otif_pct)}%, PPM {fmt(card.incoming_ppm, 0)} across all materials.</p>}</section>}

      {s && !!supAlerts.length && <section><h4><AlertTriangle size={14} /> Open alerts for this supplier ({supAlerts.length})</h4>
        <ul className="cc-alerts">{supAlerts.slice(0, 4).map(a => <li key={a.id}><span className={`pill sev-${a.severity}`}>{a.severity}</span> {a.title}</li>)}</ul></section>}

      {s && !!other.length && <section><h4><Grid3x3 size={14} /> {me?.supplier_name}'s share of other materials</h4>
        <div className="cc-chips">{other.map(r => <button key={r.material_id} onClick={() => onCell({ m: r.material_id, s })} style={{ background: colour(r.share_pct) }}
          className={r.share_pct / concMax >= 0.62 ? "dark" : ""}>{r.material_name} <b>{fmt(r.share_pct, 0)}%</b></button>)}</div></section>}

      <section><h4><ArrowRight size={14} /> What to review</h4><ol className="cc-todo">{todo.map(t => <li key={t}>{t}</li>)}</ol>
        <p className="cc-note">Decision support only: sourcing and award decisions stay with procurement.</p></section>
    </div>
  </SidePanel>;
}
