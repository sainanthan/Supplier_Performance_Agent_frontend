// Risk Radar > Sourcing reviews: when a supplier keeps failing on a material (repeat defects, unreliable delivery, prices over budget)
// the agent builds the case for moving that material, or a trial share of it, to a better qualified supplier.
// Each case is a guided, hands-on flow:  1 the problem  ->  2 choose the alternative (compare visually)  ->  3 plan the trial
// (slider; every figure recalculates live)  ->  4 decide (one-line plan + "Propose to procurement").
// Procurement decides: the proposal becomes an approval item in the corrective-action workflow.
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, Bot, Check, CheckCircle2, ClipboardPlus, Coins, PackageX, ShieldAlert, Truck, Scale, Star, UserRound } from "lucide-react";
import { api } from "../api";
import { useLoad } from "../util";

const TRIG = { quality: [PackageX, "Repeat defects"], delivery: [Truck, "Unreliable delivery"], budget: [Coins, "Over budget"], risk: [ShieldAlert, "High-risk supplier"] };
const inr = v => (v == null || isNaN(v) ? "–" : Math.abs(v) >= 1e7 ? `₹${(v / 1e7).toFixed(2)} Cr` : Math.abs(v) >= 1e5 ? `₹${(v / 1e5).toFixed(1)} L` : `₹${Math.round(v).toLocaleString("en-IN")}`);
const n = (v, d = 1) => (v == null || isNaN(v) ? "–" : Number(v).toLocaleString("en-IN", { maximumFractionDigits: d }));
const poss = s => (s || "").endsWith("s") ? `${s}'` : `${s}'s`;
const plural = (x, one, many) => `${n(x, 0)} ${Math.round(x) === 1 ? one : many}`;

/* measures compared visually; `low` = lower is better */
const BARS = [
  ["On time and in full", c => c.otif_pct, v => `${n(v, 0)}%`, "high", () => 100],
  ["Defects (PPM)", c => c.ppm, v => n(v, 0), "low"],
  ["Unit price", c => c.avg_price, v => inr(v), "low"],
  ["Lead time", c => c.lead_time, v => `${n(v)} days`, "low"],
  ["Lines past due", c => c.past_due, v => n(v, 0), "low"],
  ["Overall score", c => c.score, v => `${n(v)} / 100`, "high", () => 100],
];

function Compare({ i, a }) {
  return <div className="sr-bars">
    <div className="sr-bars-key"><span className="cur" /> {i.supplier_name} (current) <span className="alt" /> {a.supplier_name} (chosen)</div>
    {BARS.map(([label, get, fmt, better, maxFn]) => {
      const vi = get(i), va = get(a); const mx = maxFn ? maxFn() : Math.max(vi || 0, va || 0) || 1;
      const win = vi == null || va == null || vi === va ? null : (better === "high" ? va > vi : va < vi) ? "a" : "i";
      return <div key={label} className="sr-bar">
        <span className="sr-bar-l">{label}</span>
        <div className="sr-bar-t">
          <div className="row cur"><i style={{ width: `${Math.max(2, 100 * (vi || 0) / mx)}%` }} /><b>{fmt(vi)}</b>{win === "i" && <Check size={13} />}</div>
          <div className="row alt"><i style={{ width: `${Math.max(2, 100 * (va || 0) / mx)}%` }} /><b>{fmt(va)}</b>{win === "a" && <Check size={13} />}</div>
        </div>
      </div>;
    })}
  </div>;
}

/* advantages / trade-offs of the chosen supplier, worked out for whichever supplier is selected */
function pros(i, a, m) {
  const adv = [], trade = [];
  const cmp = (vi, va, hi, good, bad) => { if (vi == null || va == null || vi === va) return; ((hi ? va > vi : va < vi) ? adv : trade).push(hi ? (va > vi ? good : bad) : (va < vi ? good : bad)); };
  cmp(i.otif_pct, a.otif_pct, true, `Delivers on time and in full ${n(a.otif_pct, 0)}% of the time against ${n(i.otif_pct, 0)}%`, `Lower on-time rate on ${m} (${n(a.otif_pct, 0)}% against ${n(i.otif_pct, 0)}%)`);
  cmp(i.ppm, a.ppm, false, a.ppm ? `Fewer defects: ${n(a.ppm, 0)} PPM against ${n(i.ppm, 0)}` : `No defects traced to its ${m} lots`, `More defects: ${n(a.ppm, 0)} PPM against ${n(i.ppm, 0)}`);
  cmp(i.avg_price, a.avg_price, false, `Cheaper: ${inr(a.avg_price)} a unit against ${inr(i.avg_price)}${a.avg_price <= a.budget_price ? ", within budget" : ""}`, `Costs more: ${inr(a.avg_price)} a unit against ${inr(i.avg_price)}`);
  cmp(i.lead_time, a.lead_time, false, `Faster: ${n(a.lead_time)} days lead time against ${n(i.lead_time)}`, `Slower: ${n(a.lead_time)} days lead time against ${n(i.lead_time)}`);
  const rk = { LOW: 1, MEDIUM: 2, HIGH: 3 };
  cmp(rk[i.risk_tier], rk[a.risk_tier], false, `Lower supplier risk (${a.risk_tier?.toLowerCase()} against ${i.risk_tier?.toLowerCase()})`, `Higher supplier risk (${a.risk_tier?.toLowerCase()})`);
  if (a.technical_compliance === "COMPLIANT") adv.push("Technically compliant for this material");
  if ((a.lines || 0) < (i.lines || 0)) trade.push(`Less order history on ${m} (${a.lines} lines against ${i.lines})`);
  trade.push("Capacity for extra volume is not confirmed: check before moving more than a trial share");
  return { adv, trade };
}

/* the trial, recalculated for any share and supplier */
function plan(c, i, a, share) {
  const f = c.impact.fwd_qty || 0, s = share / 100, b = c.impact.budget_price || i.budget_price || 0, move = f * s;
  const costNow = (i.avg_price || 0) * f, costAfter = (i.avg_price || 0) * f * (1 - s) + (a.avg_price || 0) * move;
  const overNow = Math.max(0, (i.avg_price || 0) - b) * f, overAfter = Math.max(0, (i.avg_price || 0) - b) * f * (1 - s) + Math.max(0, (a.avg_price || 0) - b) * move;
  return { move, costNow, costAfter, saving: costNow - costAfter, overNow, overAfter,
    late: Math.max(0, ((a.otif_pct || 0) - (i.otif_pct || 0)) / 100 * (i.lines || 0) * s),
    defects: Math.max(0, ((i.ppm || 0) - (a.ppm || 0)) * move / 1e6) };
}

function Step({ no, title, children, done }) {
  return <section className={"sr-step" + (done ? " done" : "")}><div className="sr-step-h"><span>{done ? <Check size={13} /> : no}</span><h4>{title}</h4></div><div className="sr-step-b">{children}</div></section>;
}

export default function SourcingReviews({ openSupplier, ask, onProposed }) {
  const d = useLoad(() => api.sourcingReviews(), []);
  const [sel, setSel] = useState(null), [busy, setBusy] = useState(false), [msg, setMsg] = useState({}), [err, setErr] = useState("");
  const [showAll, setShowAll] = useState(false), [altId, setAltId] = useState(null), [share, setShare] = useState(30);
  const cases = d.data?.cases || [];
  const list = showAll ? cases : cases.slice(0, 12);
  const c = useMemo(() => cases.find(x => x.id === sel) || cases[0], [cases, sel]);
  const cands = c ? [c.alternative, ...(c.others || [])].filter(Boolean) : [];
  const a = cands.find(x => x.supplier_id === altId) || cands[0];
  useEffect(() => { if (c) { setAltId(c.alternative?.supplier_id || null); setShare(c.impact?.share_pct || 30); setErr(""); } }, [c?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const propose = async () => {
    setBusy(true); setErr("");
    try { const r = await api.sourcingPropose({ case_id: c.id, alt_supplier_id: a?.supplier_id || null, share_pct: a ? share : null });
      setMsg(m => ({ ...m, [c.id]: `Sent to procurement as action #${r.action_id}.` })); }
    catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  if (d.loading) return <div className="skeleton" style={{ height: 480 }} />;
  if (d.err) return <div className="err">{d.err}</div>;
  if (!cases.length) return <div className="card"><p className="muted">No sourcing review is needed: no supplier is failing on a material badly enough to suggest a switch.</p></div>;
  const i = c.incumbent, P = a ? plan(c, i, a, share) : null, pr = a ? pros(i, a, c.material_name) : null;

  return <div className="sr">
    <div className="card sr-head">
      <h3>Sourcing reviews</h3>
      <p>When a supplier keeps failing on a material, the agent finds a better qualified supplier and shows you why. Pick a case, compare, plan a trial, and send it to procurement.
        <b> {d.data.count}</b> cases, <b>{d.data.high}</b> high priority. Procurement decides; nothing changes in purchasing until a buyer approves.</p>
    </div>
    <div className="sr-grid">
      <aside className="card sr-list">
        <ol>{list.map(x => <li key={x.id}><button className={"sr-item" + (x.id === c.id ? " on" : "") + (x.severity === "HIGH" ? " hi" : "")} onClick={() => setSel(x.id)}>
          <b>{x.material_name}</b>
          <span>{x.incumbent.supplier_name} <ArrowRight size={11} /> {x.alternative ? x.alternative.supplier_name : "new RFQ"}</span>
          <em>{x.triggers.map(t => <i key={t.kind} className={`k-${t.kind}`}>{TRIG[t.kind][1]}</i>)}</em>
          {msg[x.id] && <small><CheckCircle2 size={11} /> sent to procurement</small>}
        </button></li>)}</ol>
        {cases.length > 12 && <button className="ghost chip-btn" onClick={() => setShowAll(v => !v)}>{showAll ? "Show top 12" : `Show all ${cases.length}`}</button>}
      </aside>

      <div className="sr-case">
        <Step no={1} title={`The problem: why review ${i.supplier_name} for ${c.material_name}`} done>
          <ul className="sr-trig">{c.triggers.map(t => { const [I, l] = TRIG[t.kind]; return <li key={t.kind} className={`k-${t.kind}`}><I size={15} /><span><b>{l}:</b> {t.detail}.</span></li>; })}</ul>
        </Step>

        {!a ? <Step no={2} title="No better supplier on file">
          <p className="sr-action">{c.action}</p>
        </Step> : <>
          <Step no={2} title="Choose the alternative" done={!!altId}>
            <p className="sr-hint">{cands.length > 1 ? "The agent recommends the first card. Click another to compare it instead." : "This is the only qualified supplier that beats the current one on this material."}</p>
            <div className="sr-cands">{cands.map((x, k) => <button key={x.supplier_id} className={"sr-cand" + (x.supplier_id === a.supplier_id ? " on" : "")} onClick={() => setAltId(x.supplier_id)} aria-pressed={x.supplier_id === a.supplier_id}>
              <span className="sr-cand-h"><b>{x.supplier_name}</b>{k === 0 && <em><Star size={11} /> recommended</em>}</span>
              <span className="sr-cand-s"><b>{n(x.score)}</b> score</span>
              <span className="sr-cand-m">{n(x.otif_pct, 0)}% on time · {n(x.ppm, 0)} PPM · {inr(x.avg_price)}</span>
            </button>)}</div>
            <Compare i={i} a={a} />
            <div className="sr-two">
              <div><h5><CheckCircle2 size={13} /> Why {a.supplier_name} is better</h5><ul className="sr-adv">{pr.adv.map(x => <li key={x}>{x}</li>)}</ul></div>
              <div><h5><AlertTriangle size={13} /> Check before switching</h5><ul className="sr-trade">{pr.trade.map(x => <li key={x}>{x}</li>)}</ul></div>
            </div>
          </Step>

          <Step no={3} title="Plan the trial: how much volume to move">
            <div className="sr-slider">
              <input type="range" min="10" max="100" step="10" value={share} onChange={e => setShare(+e.target.value)} aria-label="Share of volume to move" />
              <div className="sr-presets">{[30, 50, 100].map(v => <button key={v} className={share === v ? "on" : ""} onClick={() => setShare(v)}>{v === 100 ? "Move all" : `${v}%`}</button>)}</div>
              <span className="sr-share"><b>{share}%</b> of next quarter's {c.material_name} (about {n(P.move, 0)} of {n(c.impact.fwd_qty, 0)} units)</span>
            </div>
            <div className="sr-impact">
              <div><span>Quarterly cost</span><b>{inr(P.costAfter)}</b><em>{P.saving >= 0 ? `${inr(P.saving)} less than now (${inr(P.costNow)})` : `${inr(-P.saving)} more than now`}</em></div>
              <div><span>Spend over budget</span><b>{inr(P.overAfter)}</b><em>{P.overNow > P.overAfter ? `down from ${inr(P.overNow)}` : P.overNow ? `was ${inr(P.overNow)}` : "within budget"}</em></div>
              <div><span>Late deliveries avoided</span><b>{n(P.late)}</b><em>a quarter, at {poss(a.supplier_name)} on-time rate</em></div>
              <div><span>Defects avoided</span><b>{n(P.defects)}</b><em>a quarter, at {poss(a.supplier_name)} defect rate</em></div>
            </div>
          </Step>
        </>}

        <Step no={a ? 4 : 3} title="Decide" done={!!msg[c.id]}>
          <p className="sr-plan">{a ? <>Move <b>{share}%</b> of the next {c.material_name} orders (about <b>{n(P.move, 0)}</b> units a quarter) from {i.supplier_name} to <b>{a.supplier_name}</b>
            {P.saving > 0 ? <>, saving about <b>{inr(P.saving)}</b> a quarter</> : null}{P.late >= 0.5 ? <> and avoiding about <b>{plural(P.late, "late delivery", "late deliveries")}</b></> : null}.
            Keep {i.supplier_name} on the rest while its corrective action runs, and review after 4 weeks.</> : c.action}</p>
          <div className="sr-acts">
            {msg[c.id] ? <span className="sr-ok"><CheckCircle2 size={14} /> {msg[c.id]} <button className="link-btn" onClick={onProposed}>Open Actions</button></span>
              : <button className="primary" disabled={busy} onClick={propose}><ClipboardPlus size={14} /> {busy ? "Sending…" : "Propose to procurement"}</button>}
            <button className="ghost chip-btn" onClick={() => openSupplier(i.supplier_id)}><UserRound size={13} /> {i.supplier_name}</button>
            {a && <button className="ghost chip-btn" onClick={() => openSupplier(a.supplier_id)}><UserRound size={13} /> {a.supplier_name}</button>}
            <button className="ghost chip-btn" onClick={() => ask(`Should we move ${c.material_name} from ${i.supplier_name} to another supplier? Explain the sourcing review.`)}><Bot size={13} /> Ask the agent</button>
            {err && <span className="err">{err}</span>}
          </div>
          <p className="sr-note"><Scale size={12} /> {c.note}</p>
        </Step>
      </div>
    </div>
  </div>;
}
