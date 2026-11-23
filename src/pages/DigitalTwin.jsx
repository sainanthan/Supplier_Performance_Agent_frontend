import { useEffect, useMemo, useState } from "react";
import { Activity, Bot, Lightbulb, ListChecks, ShieldAlert, Boxes, CheckCircle2, Factory, FlaskConical, Gauge, Network, Play, Save, ShieldCheck, Target, Timer } from "lucide-react";
import { Area, Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "../api";
import KpiTile from "../components/KpiTile";
import { tipStyle } from "../components/SupplierDrawer";
import TwinNetwork3D from "../components/TwinNetwork3D";
import { Card, Empty, PageHead } from "../components/ui";
import { fmt, inr, pct, useLoad } from "../util";

const DEFAULT = { scope: "SUP-008", delay_days: 0, capacity_pct: 100, outage_days: 14, lot_reject_pct: 0, demand_pct: 0,
  dual_source_pct: 0, safety_boost_days: 0, expedite_days: 0, horizon_days: 60, response_days: 5, runs: 200 };
const DISRUPT = [["delay_days", "Shipping delay", 0, 30, " d"], ["outage_days", "Supplier outage", 0, 30, " d"],
  ["capacity_pct", "Remaining capacity", 0, 100, "%"], ["lot_reject_pct", "Lots rejected", 0, 60, "%"], ["demand_pct", "Demand change", -30, 50, "%"]];
const MITIGATE = [["dual_source_pct", "Shift to existing suppliers", 0, 100, "%"], ["safety_boost_days", "Safety-stock build", 0, 14, " d"],
  ["expedite_days", "Expedite others", 0, 7, " d"], ["response_days", "Planner response", 0, 14, " d"]];
const ax = { stroke: "var(--chart-axis)", fontSize: 11 };

function Slider({ k, label, min, max, unit, p, set }) {
  return (
    <label className="tw-slider">
      <span><b>{label}</b><em>{p[k]}{unit}</em></span>
      <input type="range" min={min} max={max} value={p[k]} onChange={e => set({ ...p, [k]: Number(e.target.value) })} />
    </label>
  );
}

function DeltaStat({ label, value, base, format = v => fmt(v, 0), goodDown = true }) {
  const d = value - (base ?? value);
  const cls = Math.abs(d) < 1e-9 ? "flat" : (d > 0) === goodDown ? "bad" : "good";
  return (
    <div className="tw-stat">
      <span className="muted">{label}</span>
      <b>{format(value)}</b>
      {base !== undefined && <span className={`delta ${cls}`}>{d > 0 ? "▲" : d < 0 ? "▼" : "●"} {format(Math.abs(d))} vs baseline</span>}
    </div>
  );
}

export default function DigitalTwin({ theme, ask, embedded }) {
  const net = useLoad(() => api.twinNetwork(), []);
  const fid = useLoad(() => api.twinFidelity(), []);
  const presets = useLoad(() => api.twinPresets(), []);
  const [saved, setSaved] = useState([]);
  const [p, setP] = useState(DEFAULT);
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [focus, setFocus] = useState(0);
  const [flash, setFlash] = useState("");
  const [mit, setMit] = useState(null);           // same scenario re-run with a standard mitigation
  const supplierId = p.scope && p.scope.startsWith("SUP-") ? p.scope : null;
  const state = useLoad(() => (supplierId ? api.twinState(supplierId) : Promise.resolve(null)), [supplierId]);
  const loadSaved = () => api.twinScenarios().then(setSaved).catch(() => {});
  useEffect(() => { loadSaved(); }, []);

  const suppliers = useMemo(() => (net.data?.nodes || []).filter(n => n.kind === "supplier"), [net.data]);
  const MITIGATION = { dual_source_pct: 50, safety_boost_days: 5 };
  const run = async (params = p) => {
    setBusy(true); setErr(""); setMit(null);
    const disrupted = params.scope && params.scope !== "NONE" && (params.delay_days || params.outage_days || params.capacity_pct < 100 || params.lot_reject_pct);
    const mitigated = params.dual_source_pct || params.safety_boost_days || params.expedite_days;
    try {
      const [r, m] = await Promise.all([api.twinSimulate(params),
        disrupted && !mitigated ? api.twinSimulate({ ...params, ...MITIGATION }) : Promise.resolve(null)]);
      setRes(r); setMit(m); setFocus(0);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const applyPreset = pr => {
    const next = { ...DEFAULT, delay_days: 0, outage_days: 0, scope: pr.needs_supplier ? (supplierId || "SUP-008") : "NONE", ...pr.params };
    setP(next); run(next);
  };
  const save = async () => {
    const scopeName = p.scope === "OVERSEAS" ? "Overseas suppliers" : p.scope === "NONE" ? "Network" : suppliers.find(s => s.id === p.scope)?.label || p.scope;
    const name = prompt("Scenario name", `${scopeName}: ${p.outage_days ? `outage ${p.outage_days}d ` : ""}${p.delay_days ? `delay +${p.delay_days}d ` : ""}${p.capacity_pct < 100 ? `capacity ${p.capacity_pct}% ` : ""}${p.demand_pct ? `demand ${p.demand_pct > 0 ? "+" : ""}${p.demand_pct}% ` : ""}${p.dual_source_pct ? `· dual ${p.dual_source_pct}%` : ""}`.trim());
    if (!name) return;
    await api.twinSave({ name, params: res.params, summary: res.summary });
    setFlash("Scenario saved as draft. Submit it for approval below."); setTimeout(() => setFlash(""), 3000); loadSaved();
  };
  const decide = async (s, status) => {
    try { await api.twinDecide(s.id, { status, actor: "procurement.user" }); loadSaved(); } catch (e) { setErr(e.message); }
  };
  const S = res?.summary, f = fid.data;
  const scopeLabel = sc => sc === "OVERSEAS" ? "all overseas suppliers" : sc === "ALL" ? "every supplier" : !sc || sc === "NONE" ? "no supplier" : (suppliers.find(x => x.id === sc)?.label || sc);
  const whatHappens = q => [q.outage_days && `stops shipping for ${q.outage_days} days`, q.delay_days && `ships ${q.delay_days} days late`,
    q.capacity_pct < 100 && `can only supply ${q.capacity_pct}% of orders`, q.lot_reject_pct && `has ${q.lot_reject_pct}% of lots rejected`,
    q.demand_pct && `demand ${q.demand_pct > 0 ? "rises" : "falls"} ${Math.abs(q.demand_pct)}%`].filter(Boolean).join(" and ") || "nothing changes";
  const verdict = useMemo(() => {
    if (!S) return null;
    const extra = S.incremental_revenue_at_risk_inr, newFlows = S.materials_at_risk - S.baseline_materials_at_risk;
    const level = extra > 5e7 || newFlows >= 4 ? "Severe" : extra > 1e7 || newFlows >= 1 ? "Moderate" : "Low";
    return { level, extra, newFlows, cls: level === "Severe" ? "sev-CRITICAL" : level === "Moderate" ? "sev-HIGH" : "sev-LOW" };
  }, [S]);
  const traj = res?.trajectories?.[focus];
  const fanData = (traj?.series || []).map(d => ({ ...d, band: [d.p10, d.p90] }));
  const atRiskNow = (net.data?.edges || []).filter(e => e.kind === "consume" && e.days_cover !== null && e.days_cover < 2).length;

  return (
    <>
      {!embedded && <PageHead eyebrow="Mirror · Simulate · Decide" title="Supplier Digital Twin"
        sub="A calibrated, living model of your inbound supply network. Stress-test suppliers before disruption happens; decisions stay with procurement.">
        <button className="glow-btn" onClick={() => ask(`Using the digital twin, simulate a 14-day outage at ${suppliers.find(s => s.id === (supplierId || "SUP-008"))?.label || "SUP-008"} and recommend the best mitigation.`)}>
          <Bot size={16} /> Ask agent to stress-test</button>
      </PageHead>}

      <div className="grid kpi-row">
        <KpiTile label="Twin fidelity" value={f?.supply_twin?.fidelity_pct} unit="%" icon={Target} color="var(--chart-c4)" hint={`on-time MAE ${fmt(f?.supply_twin?.on_time_mae_pts)} pts (backtest)`} />
        <KpiTile label="Factory twin" value={f?.factory_twin?.fidelity_pct} unit="%" icon={Factory} color="var(--depth-3)" hint={`${f?.factory_twin?.model_version || ""} · ${f?.factory_twin?.runs || 0} runs`} />
        <KpiTile label="Flows" value={(net.data?.edges || []).length} decimals={0} icon={Network} color="var(--depth-1)" hint={`${suppliers.length} suppliers · 18 materials · 2 plants`} />
        <KpiTile label="Thin cover" value={atRiskNow} decimals={0} icon={Boxes} color="var(--depth-0)" hint="< 2 days of stock today" />
        <KpiTile label="Snapshot" value={net.data?.snapshot_date} format={x => x} icon={Timer} color="var(--depth-2)" hint="latest inventory mirror" />
        <KpiTile label="MC runs" value={p.runs} decimals={0} icon={Activity} color="var(--brand-purple)" hint={`${p.horizon_days}-day horizon`} />
      </div>

      <div className="tw-steps">
        {[["1", "Who is disrupted?", scopeLabel(p.scope)], ["2", "What happens?", whatHappens(p)],
          ["3", "Run the twin", busy ? "Simulating 200 possible futures…" : res ? "Done: results below" : "Press Run twin"],
          ["4", "Read the verdict & approve", res ? `${verdict?.level} impact · save it for approval` : "Plain-language summary appears here"]].map(([n, t, d], i) => (
          <div key={n} className={`tw-step ${(i === 2 && busy) || (i === 3 && res) || (i < 2) ? "on" : ""}`}>
            <b>{n}</b><div><span>{t}</span><em>{d}</em></div>
          </div>))}
      </div>

      <div className="grid g-hero">
        <Card className="stage" title="Live supply-network twin" icon={Network} flush
          sub="Click a supplier to target it">
          <div className="stage-canvas">
            <TwinNetwork3D net={net.data} theme={theme} result={res} selected={supplierId}
              onSelect={n => n.kind === "supplier" && setP({ ...p, scope: n.id })} />
          </div>
          <div className="legend">
            <span><i style={{ background: "var(--depth-1)" }} />Supplier</span><span><i style={{ background: "var(--depth-2)" }} />Material</span>
            <span><i style={{ background: "var(--depth-3)" }} />Plant</span>
            {res && <><span><i style={{ background: "var(--depth-4)" }} />Safe</span><span><i style={{ background: "var(--brand-orange)" }} />Watch</span><span><i style={{ background: "var(--depth-0)" }} />Stockout ≥50%</span></>}
          </div>
        </Card>

        <Card title="Scenario builder" icon={FlaskConical} sub="Disrupt, mitigate, run" className="fill">
          <div className="scroll">
            <div className="tw-presets">{(presets.data || []).map(pr => <button key={pr.id} className="ghost chip-btn" onClick={() => applyPreset(pr)}>{pr.name}</button>)}</div>
            <label className="tw-field">Scope
              <select value={p.scope || "NONE"} onChange={e => setP({ ...p, scope: e.target.value })}>
                <option value="NONE">No supplier (demand only)</option><option value="OVERSEAS">All overseas suppliers</option><option value="ALL">All suppliers</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.label} ({s.country})</option>)}
              </select>
            </label>
            <div className="tw-group">Disruption</div>
            {DISRUPT.map(([k, l, a, b, u]) => <Slider key={k} k={k} label={l} min={a} max={b} unit={u} p={p} set={setP} />)}
            <div className="tw-group">Mitigation</div>
            {MITIGATE.map(([k, l, a, b, u]) => <Slider key={k} k={k} label={l} min={a} max={b} unit={u} p={p} set={setP} />)}
            <div className="row-flex" style={{ justifyContent: "space-between", marginTop: 6 }}>
              <div className="seg">{[30, 60, 90].map(h => <button key={h} className={p.horizon_days === h ? "on" : ""} onClick={() => setP({ ...p, horizon_days: h })}>{h} d</button>)}</div>
              <button className="primary row-flex" disabled={busy} onClick={() => run()}><Play size={15} /> {busy ? "Simulating…" : "Run twin"}</button>
            </div>
            {err && <div className="err" style={{ marginTop: 10 }}>{err}</div>}
          </div>
        </Card>
      </div>

      {!res ? (
        <Card><Empty icon={FlaskConical} title={busy ? "Running the Monte Carlo twin…" : "Run a scenario to see its impact"}>
          Pick a preset or set the sliders, then press <b>Run twin</b>. Results compare against the baseline with identical random draws.</Empty></Card>
      ) : (
        <>
          {flash && <div className="card" style={{ padding: 14, color: "var(--chart-c4)", fontWeight: 600 }}>{flash}</div>}
          <Card title="What this means, in plain words" icon={Lightbulb} className="tw-verdict"
            action={<span className={`pill ${verdict.cls}`} style={{ fontSize: 12, padding: "5px 12px" }}><ShieldAlert size={13} /> {verdict.level} impact</span>}>
            <p className="tw-headline">
              If <b>{scopeLabel(res.params.scope)}</b> {whatHappens(res.params)}, the twin expects{" "}
              {verdict.newFlows > 0 ? <><b>{verdict.newFlows} more material flow{verdict.newFlows > 1 ? "s" : ""}</b> to run short</> : <>no additional material shortages</>}{" "}
              and <b>{inr(Math.max(0, verdict.extra))}</b> of extra revenue at risk over the next {res.params.horizon_days} days.
            </p>
            <div className="tw-story">
              <div><ListChecks size={16} /><span><b>What happens</b>
                {res.materials.slice(0, 3).map(m => `${m.material_name} at ${m.plant_id === "IN-TN-01" ? "Chennai" : "Bengaluru"} (${pct(m.stockout_prob_pct)} chance of running short)`).join("; ")}.</span></div>
              <div><Timer size={16} /><span><b>When</b>
                {S.earliest_stockout_day == null ? "No new shortage is likely within the horizon."
                  : S.earliest_stockout_day <= 1 ? "Immediately: the affected materials already have less than 2 days of stock, so any interruption shows up at once."
                  : `The first new shortage is likely around day ${S.earliest_stockout_day}, so you have about ${S.earliest_stockout_day} days to react.`}</span></div>
              <div><ShieldCheck size={16} /><span><b>What helps</b>
                {mit ? <>Spreading 50% of the affected orders across the existing other suppliers of each material (pro-rata to their current share) and building 5 extra days of stock cuts revenue at risk from{" "}
                  <b>{inr(S.revenue_at_risk_inr)}</b> to <b>{inr(mit.summary.revenue_at_risk_inr)}</b>
                  {" "}(saves <b>{inr(Math.max(0, S.revenue_at_risk_inr - mit.summary.revenue_at_risk_inr))}</b>).{" "}
                  <button className="primary chip-btn" onClick={() => { const q = { ...p, ...MITIGATION }; setP(q); run(q); }}>Apply this fix</button></>
                  : res.params.dual_source_pct || res.params.safety_boost_days || res.params.expedite_days
                    ? "This run already includes your mitigation; compare it with a run without mitigation to see the saving."
                    : "Choose a supplier disruption to get a mitigation suggestion."}</span></div>
            </div>
          </Card>
          <Card title="Scenario impact vs baseline" icon={Gauge}
            sub={`Affected: ${S.affected_suppliers.length ? S.affected_suppliers.join(", ") : "none (demand scenario)"} · ${res.params.runs} runs · ${res.params.horizon_days}-day horizon`}
            action={<div className="row-flex">
              <button className="ghost chip-btn row-flex" onClick={() => ask(`Explain this digital-twin result and recommend actions: ${JSON.stringify(S)}`)}><Bot size={13} /> Explain</button>
              <button className="primary chip-btn row-flex" onClick={save}><Save size={13} /> Save scenario</button></div>}>
            <div className="tw-stats">
              <DeltaStat label="Flows at risk (≥20%)" value={S.materials_at_risk} base={S.baseline_materials_at_risk} />
              <DeltaStat label="Finished units at risk (P50)" value={S.units_at_risk_p50} base={S.baseline_units_at_risk_p50} />
              <DeltaStat label="Revenue at risk" value={S.revenue_at_risk_inr} base={S.baseline_revenue_at_risk_inr} format={inr} />
              <DeltaStat label="Line hours lost (P50)" value={S.line_hours_lost_p50} format={v => fmt(v, 1)} />
              <DeltaStat label="Customer backlog at risk" value={S.backlog_at_risk_inr} format={inr} />
              <DeltaStat label="Earliest new stockout" value={S.earliest_stockout_day} format={v => (v === null || v === undefined ? "none" : `day ${v}`)} />
            </div>
            <details className="tw-gloss"><summary>What do these numbers mean?</summary>
              <ul>
                <li><b>Baseline</b>: the same 200 simulated futures with no disruption, so the difference is caused by your scenario only.</li>
                <li><b>Flow at risk</b>: a material at a plant with at least a 20% chance of losing half a day of production or more.</li>
                <li><b>P50 (typical)</b>: half of the simulated futures are better than this and half are worse. <b>P90</b> is a bad-case outcome (only 1 in 10 is worse).</li>
                <li><b>Revenue at risk</b>: phones that cannot be built because a component runs out, times the average selling price.</li>
                <li><b>Line hours lost</b>: those phones divided by the final-assembly line rate (300 per hour).</li>
              </ul>
            </details>
          </Card>

          <div className="grid g-2e">
            <Card title="Inventory projection" icon={Activity} sub="P10–P90 band and P50 under the scenario · dashed = baseline P50 · red line = safety stock"
              action={<div className="seg">{res.trajectories.map((t, i) => <button key={i} className={focus === i ? "on" : ""} onClick={() => setFocus(i)}>{t.material_id.replace("MAT-", "")} · {t.plant_id.slice(3)}</button>)}</div>}>
              {traj && (
                <ResponsiveContainer width="100%" height={300}>
                  <ComposedChart data={fanData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke="var(--dr-border)" vertical={false} />
                    <XAxis dataKey="day" {...ax} tickFormatter={d => `d${d}`} /><YAxis {...ax} tickFormatter={v => fmt(v / 1000, 1) + "k"} />
                    <Tooltip {...tipStyle} formatter={v => (Array.isArray(v) ? `${fmt(v[0], 0)} – ${fmt(v[1], 0)}` : fmt(v, 0))} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Area dataKey="band" name="P10–P90" stroke="none" fill="var(--chart-c3)" fillOpacity={0.18} />
                    <Line dataKey="p50" name="Scenario P50" stroke="var(--chart-c3)" strokeWidth={2.5} dot={false} />
                    <Line dataKey="baseline_p50" name="Baseline P50" stroke="var(--chart-c1)" strokeWidth={2} strokeDasharray="6 4" dot={false} />
                    {traj.safety_stock ? <ReferenceLine y={traj.safety_stock} stroke="var(--depth-0)" strokeDasharray="3 3" label={{ value: "safety", fill: "var(--depth-0)", fontSize: 11, position: "insideTopRight" }} /> : null}
                  </ComposedChart>
                </ResponsiveContainer>
              )}
            </Card>
            <Card title="Plant & factory-twin impact" icon={Factory} sub="Supply-constrained utilisation uses the factory twin (TWIN-1.7) baseline runs">
              {res.plants.map(pl => (
                <div key={pl.plant_id} className="tw-plant">
                  <div className="row-flex" style={{ justifyContent: "space-between" }}>
                    <b>{pl.plant_id}</b>
                    <span className="muted">{fmt(pl.daily_units_planned, 0)} units/day · output loss {pct(pl.output_loss_pct)}</span>
                  </div>
                  <div className="tw-mini">
                    <span>Units at risk <b>{fmt(pl.units_at_risk_p50, 0)}</b> <em>P90 {fmt(pl.units_at_risk_p90, 0)}</em></span>
                    <span>Revenue <b>{inr(pl.revenue_at_risk_inr)}</b></span>
                    <span>Line hours <b>{fmt(pl.line_hours_lost_p50, 1)}</b></span>
                    <span>Backlog at risk <b>{inr(pl.backlog_at_risk_inr)}</b></span>
                  </div>
                  <table className="tbl" style={{ marginTop: 8 }}>
                    <thead><tr><th>Line</th><th className="num">Twin util.</th><th className="num">Supply-constrained</th><th className="num">Model error</th></tr></thead>
                    <tbody>{pl.factory_twin_lines.map(l => (
                      <tr key={l.line_id}><td>{l.line_id} <span className="muted">{l.line_type}</span></td>
                        <td className="num">{pct(l.predicted_utilization_pct)}</td>
                        <td className="num" style={{ color: l.supply_constrained_utilization_pct < l.predicted_utilization_pct - 5 ? "var(--depth-0)" : undefined }}>{pct(l.supply_constrained_utilization_pct)}</td>
                        <td className="num">{pct(l.prediction_error_pct)}</td></tr>))}</tbody>
                  </table>
                </div>
              ))}
            </Card>
          </div>

          <Card title="Most impacted plant / material flows" icon={Boxes} sub="Sorted by change in stockout probability vs baseline" flush>
            <div className="tbl-wrap">
              <table className="tbl">
                <thead><tr><th>Plant</th><th>Material</th><th className="num">Affected share</th><th className="num">Days cover now</th>
                  <th className="num">Stockout prob.</th><th className="num">Baseline</th><th className="num">Units short</th><th className="num">First stockout</th></tr></thead>
                <tbody>{res.materials.slice(0, 14).map(r => (
                  <tr key={r.plant_id + r.material_id}>
                    <td>{r.plant_id}</td><td><b>{r.material_name}</b> <span className="muted">{r.material_id}</span></td>
                    <td className="num">{pct(r.affected_share_pct)}</td><td className="num">{fmt(r.start_days_cover)}</td>
                    <td className="num"><span className={`pill ${r.stockout_prob_pct >= 50 ? "sev-CRITICAL" : r.stockout_prob_pct >= 20 ? "sev-HIGH" : "sev-LOW"}`}>{pct(r.stockout_prob_pct)}</span></td>
                    <td className="num">{pct(r.baseline_stockout_prob_pct)}</td><td className="num">{fmt(r.expected_short_units, 0)}</td>
                    <td className="num">{r.first_stockout_day_p50 === null ? "–" : `day ${r.first_stockout_day_p50}`}</td>
                  </tr>))}</tbody>
              </table>
            </div>
          </Card>
          <details className="card tw-assume"><summary>Model assumptions</summary><ul>{res.assumptions.map(a => <li key={a}>{a}</li>)}</ul></details>
        </>
      )}

      <div className="grid g-2e">
        <Card title={supplierId ? `Supplier mirror · ${state.data?.supplier_name || supplierId}` : "Supplier mirror"} icon={Target}
          sub="What the twin has learned about this supplier from history">
          {!supplierId ? <Empty icon={Target} title="Select a supplier">Click a supplier node or choose one in Scope.</Empty> : !state.data ? <div className="skeleton" style={{ height: 220 }} /> : (
            <>
              <div className="tw-mini">
                <span>Lead time <b>{fmt(state.data.calibrated.lead_time_mean_days)} d</b> <em>P90 {fmt(state.data.calibrated.lead_time_p90_days)} d</em></span>
                <span>On-time prob. <b>{pct(state.data.calibrated.on_time_probability_pct)}</b></span>
                <span>Fill rate <b>{pct(state.data.calibrated.mean_fill_pct)}</b></span>
                <span>Open pipeline <b>{fmt(state.data.pipeline.open_qty, 0)}</b> <em>{state.data.pipeline.past_due_lines} past due</em></span>
              </div>
              <ResponsiveContainer width="100%" height={170}>
                <BarChart data={state.data.calibrated.lead_time_histogram.map((n, i) => ({ bin: `${fmt(state.data.calibrated.lead_time_bins[i], 0)}–${fmt(state.data.calibrated.lead_time_bins[i + 1], 0)}`, n }))} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                  <XAxis dataKey="bin" {...ax} /><YAxis {...ax} allowDecimals={false} /><Tooltip {...tipStyle} cursor={{ fill: "var(--dr-hover)" }} />
                  <Bar dataKey="n" name="PO lines" fill="var(--depth-1)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
              <p className="muted" style={{ margin: "6px 0 0" }}>Lead-time distribution (days). Backtest: twin predicted <b>{pct(state.data.fidelity.predicted_on_time_pct)}</b> on-time vs actual <b>{pct(state.data.fidelity.actual_on_time_pct)}</b> on {state.data.fidelity.test_lines} recent lines.</p>
            </>
          )}
        </Card>

        <Card title="Saved scenarios" icon={ShieldCheck} sub="Simulations are advisory: Draft → Submitted → Approved by procurement">
          {saved.length === 0 ? <Empty icon={Save} title="No saved scenarios">Run a scenario and press Save.</Empty> : (
            <div className="scroll" style={{ maxHeight: 300 }}>
              {saved.map(s => (
                <div key={s.id} className="tw-scn">
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div className="ellipsis"><b>#{s.id} {s.name}</b></div>
                    <div className="muted">Revenue at risk {inr(s.summary?.revenue_at_risk_inr)} · {s.summary?.materials_at_risk} flows at risk · {s.created_at?.slice(0, 10)}</div>
                  </div>
                  <span className={`pill ${s.status === "APPROVED" ? "sev-LOW" : s.status === "REJECTED" ? "sev-CRITICAL" : "st"}`}>{s.status === "APPROVED" && <CheckCircle2 size={11} />} {s.status}</span>
                  {s.status === "DRAFT" && <button className="ghost chip-btn" onClick={() => decide(s, "SUBMITTED")}>Submit</button>}
                  {s.status === "SUBMITTED" && <><button className="primary chip-btn" onClick={() => decide(s, "APPROVED")}>Approve</button><button className="ghost chip-btn" onClick={() => decide(s, "REJECTED")}>Reject</button></>}
                  <button className="ghost chip-btn" onClick={() => { setP({ ...DEFAULT, ...s.params }); run({ ...DEFAULT, ...s.params }); }}>Re-run</button>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {f?.supply_twin?.suppliers?.length > 0 && (
        <Card title="Twin fidelity backtest" icon={Target} sub={f.supply_twin.method}>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={f.supply_twin.suppliers} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
              <CartesianGrid stroke="var(--dr-border)" vertical={false} />
              <XAxis dataKey="supplier_id" {...ax} /><YAxis {...ax} domain={[0, 100]} /><Tooltip {...tipStyle} cursor={{ fill: "var(--dr-hover)" }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="predicted" name="Twin predicted on-time %" fill="var(--chart-c3)" radius={[6, 6, 0, 0]} />
              <Bar dataKey="actual" name="Actual on-time %" fill="var(--chart-c1)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}
    </>
  );
}
