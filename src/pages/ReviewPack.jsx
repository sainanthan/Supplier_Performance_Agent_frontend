import { useState } from "react";
import { explain, why } from "../components/AlertLedger";
import ReactMarkdown from "react-markdown";
import { FileDown, Presentation, Printer, Sparkles } from "lucide-react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from "recharts";
import { api } from "../api";
import { tipStyle } from "../components/SupplierDrawer";
import { fmt, inr, pct, useLoad } from "../util";
import { FDate, FilterBar, FSelect, PageHead, supplierOptions } from "../components/ui";

export default function ReviewPack({ reviewId, setReviewId, llmReady, features }) {
  const [exp, setExp] = useState("");
  const doExport = async (fmt, narrative) => {
    setExp(`Building ${fmt.toUpperCase()}…`);
    try { const name = await api.exportPack(reviewId, { fmt, narrative: narrative ? "true" : undefined }); setExp(`Downloaded ${name}`); }
    catch (e) { setExp(`Export failed: ${e.message}`); }
  };
  const sups = useLoad(() => api.scorecard({}), []);
  const [start, setStart] = useState(""), [end, setEnd] = useState(""), [sec, setSec] = useState("");
  const p = useLoad(() => api.reviewPack(reviewId, { start, end }), [reviewId, start, end]);
  const show = k => !sec || sec === k;
  const [nar, setNar] = useState({ text: "", busy: false, err: "" });
  const gen = async () => {
    setNar({ text: "", busy: true, err: "" });
    try { setNar({ text: (await api.narrative(reviewId)).narrative, busy: false, err: "" }); }
    catch (e) { setNar({ text: "", busy: false, err: e.message }); }
  };
  const d = p.data; const s = d?.scorecard;
  return (
    <>
      <div className="no-print"><PageHead eyebrow="Reports" title="Supplier Review Pack" sub="Printable business review for one supplier.">
          <button className="glow-btn" disabled={!llmReady || nar.busy} onClick={gen} title={llmReady ? "" : "Configure DOMO_TOKEN first"}>
            <Sparkles size={15} /> {nar.busy ? "Writing…" : "AI executive summary"}</button>
          <button className="ghost row-flex" onClick={() => window.print()}><Printer size={15} /> Print this page</button>
          {features?.review_pack_export && <>
            <button className="ghost row-flex" onClick={() => doExport("pdf")}><FileDown size={15} /> Download PDF</button>
            <button className="ghost row-flex" onClick={() => doExport("pptx")}><Presentation size={15} /> Download PowerPoint</button>
            {llmReady && <button className="ghost row-flex" title="Adds the AI summary only if every figure passes the grounding check" onClick={() => doExport("pdf", true)}><Sparkles size={15} /> PDF with AI summary</button>}
          </>}
      </PageHead>
      {exp && <div className="muted" style={{ marginBottom: 8 }}>{exp}</div>}
      <FilterBar active={[start, end, sec].filter(Boolean).length} onClear={() => { setStart(""); setEnd(""); setSec(""); }}>
        <FSelect label="Supplier" value={reviewId} onChange={v => { setReviewId(v); setNar({ text: "", busy: false, err: "" }); }} options={supplierOptions(sups.data)} all={null} />
        <FDate label="From" value={start} onChange={setStart} /><FDate label="To" value={end} onChange={setEnd} />
        <FSelect label="Section" value={sec} onChange={setSec} all="All sections"
          options={[["score", "Scorecard"], ["trend", "Trend"], ["risk", "Risks & exposure"], ["actions", "Actions & issues"]]} />
      </FilterBar></div>
      {p.err && <div className="err">{p.err}</div>}
      {!d ? <div className="skeleton" style={{ height: 500 }} /> : (
        <div className="pack">
          <div className="pack-brand"><img src="/gwc-logo.png" alt="GWC Data.AI" /><span className="muted">Supplier Performance Agent</span></div>
          <div className="eyebrow">Supplier review pack · as of {d.as_of_date}</div>
          <h1>{s.supplier_name}</h1>
          <div className="muted">{s.supplier_id} · {s.material_category} · {s.country} · {s.quality_certification} · risk tier {s.risk_tier}</div>

          {show("score") && <><h2>Scorecard</h2>
          <div className="kv">
            <div><span className="muted">Grade / score</span><b>{s.grade} · {fmt(s.composite_score)}</b></div>
            <div><span className="muted">Rank (perf / risk)</span><b>#{s.performance_rank} / #{s.risk_rank}</b></div>
            <div><span className="muted">OTIF (peer avg)</span><b>{pct(s.otif_pct)} <small className="muted">({pct(d.peer_benchmark.avg_otif_pct)})</small></b></div>
            <div><span className="muted">Incoming PPM (peer avg)</span><b>{fmt(s.incoming_ppm, 0)} <small className="muted">({fmt(d.peer_benchmark.avg_ppm, 0)})</small></b></div>
            <div><span className="muted">Lead-time variance</span><b>{fmt(s.avg_lead_time_variance_days)} d</b></div>
            <div><span className="muted">Open NCR / overdue CAPA</span><b>{fmt(s.open_ncr)} / {fmt(s.overdue_capa)}</b></div>
            <div><span className="muted">Spend · price variance</span><b>{inr(s.spend_inr)} · {pct(s.price_variance_pct)}</b></div>
            <div><span className="muted">Disruption hours</span><b>{fmt(s.disruption_hours)} h</b></div>
          </div>
          <p className="muted">Weights: {Object.entries(d.weights).map(([k, v]) => `${k} ${Math.round(v * 100)}%`).join(" · ")}. Sub-scores: {Object.entries(s.scores).map(([k, v]) => `${k} ${fmt(v, 0)}`).join(" · ")}.</p>

          {(nar.text || nar.err) && (<><h2>Executive summary (AI-generated)</h2>
            {nar.err ? <div className="err">{nar.err}</div> : <ReactMarkdown>{nar.text}</ReactMarkdown>}</>)}</>}
          {show("trend") && <><h2>Monthly trend</h2>
          <ResponsiveContainer width="100%" height={230}>
            <LineChart data={d.monthly_trends.filter(t => t.lines || t.defects)}>
              <CartesianGrid stroke="var(--dr-border)" vertical={false} />
              <XAxis dataKey="period" stroke="var(--chart-axis)" fontSize={11} tickFormatter={x => x.slice(0, 7)} />
              <YAxis yAxisId="l" stroke="var(--chart-axis)" fontSize={11} /><YAxis yAxisId="r" orientation="right" stroke="var(--chart-axis)" fontSize={11} />
              <Tooltip {...tipStyle} /><Legend wrapperStyle={{ fontSize: 12 }} />
              <Line yAxisId="l" dataKey="otif_pct" name="OTIF %" stroke="var(--chart-c1)" strokeWidth={2.5} connectNulls />
              <Line yAxisId="r" dataKey="ppm" name="PPM" stroke="var(--chart-c3)" strokeWidth={2.5} connectNulls />
            </LineChart>
          </ResponsiveContainer></>}
          {show("risk") && <><h2>Risk alerts</h2>
          {d.alerts.length ? <ul className="rp-alerts">{d.alerts.map(a => { const y = why(a); return <li key={a.id}><b>{a.title}.</b> {explain(a, false)}{y && <span className="rp-why"> {y[0]} because {y[1]}.</span>}</li>; })}</ul> : <p className="muted">No active alerts.</p>}</>}
          {show("risk") && <><h2>Exposure</h2>
          <ul>
            <li>{d.exposure.past_due_lines.length} PO lines past due ({d.exposure.materials_past_due.join(", ") || "none"}).</li>
            <li>{d.exposure.at_risk_production_orders} open production orders and {d.exposure.at_risk_customer_orders} customer orders depend on past-due materials ({fmt(d.exposure.at_risk_order_qty, 0)} units).</li>
            <li>Quality impact on lines: {d.exposure.quality_exposure_by_line.map(l => `${l.line_id}@${l.plant_id} ${fmt(l.attributed_defects)} defects`).join("; ") || "none"}.</li>
          </ul></>}
          {show("risk") && <><h2>Top defects</h2>
          <ul>{d.defects.slice(0, 5).map(x => <li key={x.defect_code + x.material_id}>{x.defect_name} on {x.material_id}: {fmt(x.defects, 2)} attributed ({x.inspections} inspections)</li>)}</ul></>}
          {show("actions") && <><h2>Recommended corrective actions</h2>
          <ul>{d.recommendations.map(r => <li key={r}>{r}</li>)}</ul></>}
          {show("actions") && <><h2>Corrective-action tracker</h2>
          {d.corrective_actions.length ? (
            <table className="tbl"><thead><tr><th>#</th><th>Title</th><th>Status</th><th>Owner</th><th>Due</th></tr></thead>
              <tbody>{d.corrective_actions.map(a => <tr key={a.id}><td>{a.id}</td><td>{a.title}</td><td>{a.status}</td><td>{a.owner_role}</td><td>{a.due_date}</td></tr>)}</tbody></table>
          ) : <p className="muted">No tracked actions yet.</p>}</>}
          {show("actions") && <><h2>Open NCR / CAPA (top 10)</h2>
          <table className="tbl"><thead><tr><th>NCR</th><th>Defect</th><th>Status</th><th className="num">Age</th><th>Due</th></tr></thead>
            <tbody>{d.open_issues.slice(0, 10).map(n => <tr key={n.ncr_id + n.material_id}><td>{n.ncr_id}</td><td>{n.defect_name}</td><td>{n.is_overdue ? "OVERDUE" : n.capa_status}</td><td className="num">{n.open_age_days}</td><td>{n.capa_due_date}</td></tr>)}</tbody></table></>}
          <p className="muted" style={{ marginTop: 20 }}>Supplier ranking and sourcing decisions remain with procurement. Figures exclude documented KPI exclusions.</p>
        </div>
      )}
    </>
  );
}
