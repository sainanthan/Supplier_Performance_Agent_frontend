import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Activity, AlertTriangle, BrainCircuit, CalendarClock, Gauge, Info, RefreshCw, ShieldAlert, TrendingDown, TrendingUp } from "lucide-react";
import { api } from "../api";
import { fmt, inr, useLoad } from "../util";
import { tipStyle } from "./SupplierDrawer";
import WhyLatePanel, { DelayCausesCard } from "./WhyLate";

/* Predictive layer (flag predictive_layer): what is likely to go wrong next, and why.
   Everything here is a model estimate - advisory only, never changes a KPI, ranking or sourcing decision. */
const BAND = { LATE: ["Already late", "bad"], HIGH: ["High", "bad"], MEDIUM: ["Medium", "warn"], LOW: ["Low", "ok"] };
const OUT = { WORSENING: ["Worsening", "bad", TrendingDown], IMPROVING: ["Improving", "ok", TrendingUp], STABLE: ["Stable", "muted", Activity] };
const pc = v => (v == null ? "–" : `${Math.round(v * 100)}%`);
const dm = s => (s ? new Date(s).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) : "–");

export default function PredictionsTab({ user, openSupplier }) {
  const [band, setBand] = useState("MEDIUM"), [sup, setSup] = useState(""), [busy, setBusy] = useState(false), [showModel, setShowModel] = useState(false);
  const [why, setWhy] = useState(null);
  const late = useLoad(() => api.predLate({}), [busy]);
  const model = useLoad(() => api.predModel(), [busy]);
  const fc = useLoad(() => api.predSuppliers(), [busy]);
  const q = useLoad(() => api.predQuality(), []);
  const m = model.data, mt = m?.metrics, h = mt?.holdout, fw = mt?.forward;
  const rank = { LATE: 3, HIGH: 2, MEDIUM: 1, LOW: 0 };
  const items = useMemo(() => (late.data?.items || []).filter(i => rank[i.risk_band] >= rank[band] && (!sup || i.supplier_id === sup)), [late.data, band, sup]); // eslint-disable-line react-hooks/exhaustive-deps
  const s = late.data?.summary || {};
  const suppliers = [...new Map((late.data?.items || []).map(i => [i.supplier_id, i.supplier_name])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const worsening = (fc.data || []).filter(x => x.outlook === "WORSENING").length;
  const retrain = async () => { setBusy(true); try { await api.predRetrain(); } catch (e) { alert(e.message); } setBusy(false); };

  if (late.err || model.err) return <div className="err">{late.err || model.err}</div>;
  if (late.data && !late.data.model) return <div className="card pr-empty"><BrainCircuit size={20} /> No model trained yet. {user?.role === "ADMIN" && <button className="primary chip-btn" onClick={retrain} disabled={busy}>{busy ? "Training…" : "Train the model"}</button>}</div>;
  return (
    <div className="pr">
      {/* model card */}
      <section className="card pr-model">
        <span className="pr-ic"><BrainCircuit size={18} /></span>
        <div className="pr-model-t">
          <b>Late-delivery prediction model</b>
          <span>{m?.version || "…"} · trained {m?.trained_at ? new Date(m.trained_at).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "–"} on {fmt(m?.train_rows, 0)} PO lines with a known outcome</span>
        </div>
        {h && <div className="pr-rel">
          <div title="How well the model separates late from on-time lines on LATER orders it never saw (0.5 = coin toss, 1.0 = perfect)">
            <span>Tested on later orders</span><b>{Math.round(h.auc * 100)} / 100</b><em>simple rule: {Math.round((h.baseline_auc || 0) * 100)}</em></div>
          <div title="Share of later orders where 'late' / 'on time' was called correctly"><span>Right calls</span><b>{pc(h.accuracy)}</b><em>{fmt(h.n, 0)} test lines</em></div>
          {fw && <div title="Orders due after the data cut-off, predicted with cut-off knowledge only, checked against their actual receipts">
            <span>Forward check</span><b>{Math.round(fw.auc * 100)} / 100</b><em>{fmt(fw.n, 0)} lines after cut-off</em></div>}
          <div><span>Delay error</span><b>± {fmt(h.delay_mae_days, 1)} d</b><em>average guess: ± {fmt(h.delay_mae_baseline, 1)} d</em></div>
        </div>}
        <button className="ghost chip-btn row-flex" onClick={() => setShowModel(v => !v)}><Info size={13} /> {showModel ? "Hide" : "How it works"}</button>
        {user?.role === "ADMIN" && <button className="ghost chip-btn row-flex" onClick={retrain} disabled={busy}><RefreshCw size={13} className={busy ? "spin" : ""} /> {busy ? "Training…" : "Retrain"}</button>}
      </section>

      {showModel && mt && <section className="card pr-how">
        <div className="pr-how-t">
          <h4>How the prediction works (in plain words)</h4>
          <ol>
            <li>It learns from <b>{fmt(m.train_rows, 0)} past PO lines</b> whose outcome is known: delivered on time, delivered late, or still not delivered after the promise date (counted as late).</li>
            <li>For each line it looks only at what was known <b>when the order was placed</b>: supplier, material group, plant, shipping terms, how long the promised lead time was compared with the supplier's standard, and the order size.</li>
            <li>It gives every open line a <b>chance of arriving late</b>, an <b>expected delay</b> and the <b>three main reasons</b>.</li>
            <li>It was tested on the <b>most recent orders it never saw</b> and checked again on orders due after the data cut-off. It is retrained every week.</li>
            <li>Inputs that pointed the wrong way in the data are <b>removed</b>, so no prediction is ever explained by an implausible reason.</li>
          </ol>
          <p className="muted">Advisory only: predictions never change a KPI, a ranking or a sourcing decision. Every prediction is stored with the model version for audit.</p>
          {mt.dropped?.length > 0 && <p className="muted">Not used this time: {mt.dropped.map(d => d.feature.replace("_", " ")).join(", ")} (their effect in the data was not plausible).</p>}
        </div>
        <div className="pr-cal">
          <b>Is a "70 %" really 70 %? (tested on later orders)</b>
          <ResponsiveContainer width="100%" height={190}>
            <BarChart data={h.calibration} margin={{ top: 8, right: 12, left: -14, bottom: 0 }}>
              <CartesianGrid stroke="var(--dr-border)" vertical={false} />
              <XAxis dataKey="bin" tick={{ fontSize: 11, fill: "var(--text-secondary)" }} />
              <YAxis domain={[0, 1]} tickFormatter={v => `${Math.round(v * 100)}%`} tick={{ fontSize: 10.5, fill: "var(--text-secondary)" }} />
              <Tooltip {...tipStyle} formatter={(v, k) => [`${Math.round(v * 100)}%`, k === "predicted" ? "Predicted" : "Actually late"]} />
              <Legend wrapperStyle={{ fontSize: 11.5 }} />
              <Bar dataKey="predicted" name="Predicted" fill="#9d6ff0" radius={[4, 4, 0, 0]} />
              <Bar dataKey="actual" name="Actually late" fill="#1f2f59" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>}

      {/* headline numbers */}
      <div className="pr-kpis">
        <div className="card"><span><CalendarClock size={14} /> Open lines likely late</span><b>{fmt(s.expected_late_open, 0)}</b><em>expected, of {fmt((late.data?.items || []).filter(i => i.status === "OPEN").length, 0)} not yet due</em></div>
        <div className="card bad"><span><ShieldAlert size={14} /> High risk</span><b>{fmt(s.high_risk_open, 0)}</b><em>≥ 70 % chance of being late</em></div>
        <div className="card"><span><AlertTriangle size={14} /> Already past due</span><b>{fmt(s.past_due, 0)}</b><em>not received, promise passed</em></div>
        <div className="card"><span><Gauge size={14} /> Value at risk</span><b>{inr(s.value_at_risk_inr)}</b><em>order value × chance of being late</em></div>
        <div className="card"><span><TrendingDown size={14} /> Suppliers getting worse</span><b>{worsening}</b><em>next 30 days vs last 60</em></div>
      </div>

      {/* lines likely to be late */}
      <section className="card pr-lines">
        <header>
          <h3>Lines likely to arrive late</h3>
          <div className="seg">{[["MEDIUM", "Medium +"], ["HIGH", "High +"], ["LATE", "Already late"], ["LOW", "All"]].map(([k, l]) => <button key={k} className={band === k ? "on" : ""} onClick={() => setBand(k)}>{l}</button>)}</div>
          <select value={sup} onChange={e => setSup(e.target.value)} aria-label="Supplier"><option value="">All suppliers</option>{suppliers.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select>
          <span className="muted">{items.length} line(s)</span>
        </header>
        {!late.data ? <div className="skeleton" style={{ height: 260 }} /> :
          <div className="pr-table-wrap"><table className="pr-table">
            <thead><tr><th>PO line</th><th>Supplier · material</th><th>Due</th><th>Chance late</th><th>Expected delay</th><th>Predicted arrival</th><th>Value</th><th>Why</th><th></th></tr></thead>
            <tbody>{items.slice(0, 80).map(i => (
              <tr key={`${i.po_id}-${i.po_line}`}>
                <td><b>{i.po_id}</b>/{i.po_line}</td>
                <td><button className="link" onClick={() => openSupplier?.(i.supplier_id)}>{i.supplier_name}</button><span className="muted">{i.material_name}</span></td>
                <td>{dm(i.promised_date)}<span className="muted">{i.days_to_due < 0 ? `${-i.days_to_due} d overdue` : `in ${i.days_to_due} d`}</span></td>
                <td><div className={`pr-risk ${BAND[i.risk_band][1]}`}><i style={{ width: `${i.p_late * 100}%` }} /><b>{pc(i.p_late)}</b></div><span className={`pill pr-b ${BAND[i.risk_band][1]}`}>{BAND[i.risk_band][0]}</span></td>
                <td>{i.expected_delay_days ? `+${fmt(i.expected_delay_days, 0)} d` : "–"}</td>
                <td>{dm(i.predicted_arrival)}</td>
                <td>{inr(i.value_inr)}</td>
                <td className="pr-why">{i.drivers.map((d, k) => <span key={k} className={d.effect === "raises" ? "up" : "down"}>{d.effect === "raises" ? "▲" : "▼"} {d.text}</span>)}</td>
                <td><button className="ghost chip-btn" onClick={() => setWhy({ po: i.po_id, line: i.po_line })} title="Where the time is lost, root cause, impact and what to do">Why late?</button></td>
              </tr>))}</tbody>
          </table></div>}
      </section>

      <DelayCausesCard supplierId={sup} />
      {why && <WhyLatePanel po={why.po} line={why.line} onClose={() => setWhy(null)} />}

      <div className="pr-two">
        {/* supplier outlook */}
        <section className="card">
          <h3>Supplier on-time outlook · next 30 days</h3>
          <p className="muted pr-sub">Predicted share of each supplier's deliveries due in the next 30 days that will be on time, against what it actually achieved in the last 60 days.</p>
          {fc.data && <ResponsiveContainer width="100%" height={Math.max(220, fc.data.length * 30)}>
            <BarChart data={fc.data} layout="vertical" margin={{ top: 4, right: 24, left: 10, bottom: 0 }}>
              <CartesianGrid stroke="var(--dr-border)" horizontal={false} />
              <XAxis type="number" domain={[0, 100]} tickFormatter={v => `${v}%`} tick={{ fontSize: 10.5, fill: "var(--text-secondary)" }} />
              <YAxis type="category" dataKey="supplier_name" width={150} tick={{ fontSize: 11, fill: "var(--text-primary)" }} interval={0} />
              <Tooltip {...tipStyle} formatter={(v, k) => [`${fmt(v, 1)}%`, k]} />
              <Legend wrapperStyle={{ fontSize: 11.5 }} />
              <Bar dataKey="last_60d_on_time_pct" name="Last 60 days (actual)" fill="#b8bfcc" radius={[0, 4, 4, 0]} />
              <Bar dataKey="predicted_on_time_pct" name="Next 30 days (predicted)" fill="#6f3dba" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>}
          <div className="pr-outlook">{(fc.data || []).map(x => { const [l, c, I] = OUT[x.outlook]; return (
            <span key={x.supplier_id} className={`pr-o ${c}`} title={`${x.lines} lines due · value at risk ${inr(x.value_at_risk_inr)}`}><I size={12} /> {x.supplier_name}: {l} {x.change_pts != null ? `(${x.change_pts > 0 ? "+" : ""}${fmt(x.change_pts, 0)} pts)` : ""}</span>); })}</div>
        </section>

        {/* quality early warning */}
        <section className="card">
          <h3>Quality early warning</h3>
          <p className="muted pr-sub">{q.data?.method || "Defects traced to each supplier's material, per week, against its own expected level."}</p>
          {q.data && (q.data.anomalies.length ? <div className="pr-anoms">{q.data.anomalies.slice(0, 6).map((a, i) => (
            <div key={i} className={`pr-anom ${a.severity === "HIGH" ? "bad" : "warn"}`}><b>{a.supplier_name} · {a.material_name}</b>
              <span>week of {dm(a.week)}: {a.defects} defects vs {a.expected} expected (limit {a.upper_limit}) · {a.z}σ</span></div>))}</div>
            : <div className="pr-ok">No unusual jump in defects in the last 2 weeks: every supplier × material is inside its control limit.</div>)}
          <b className="pr-tt">Defect trend, projected 4 weeks ahead</b>
          {q.data && <ResponsiveContainer width="100%" height={200}>
            <BarChart data={q.data.trend} margin={{ top: 6, right: 8, left: -14, bottom: 0 }}>
              <CartesianGrid stroke="var(--dr-border)" vertical={false} />
              <XAxis dataKey="supplier_id" tick={{ fontSize: 10.5, fill: "var(--text-secondary)" }} />
              <YAxis tick={{ fontSize: 10.5, fill: "var(--text-secondary)" }} />
              <Tooltip {...tipStyle} labelFormatter={id => q.data.trend.find(t => t.supplier_id === id)?.supplier_name || id} formatter={(v, k) => [`${fmt(v, 1)} / week`, k]} />
              <Legend wrapperStyle={{ fontSize: 11.5 }} />
              <Bar dataKey="current_per_week" name="Now (last 4 weeks)" fill="#b8bfcc" radius={[4, 4, 0, 0]} />
              <Bar dataKey="projected_per_week_4w" name="In 4 weeks (trend)" fill="#e4572e" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>}
        </section>
      </div>
    </div>
  );
}
