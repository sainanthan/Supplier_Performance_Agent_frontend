import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Bot, FileSearch, FileText, X } from "lucide-react";
import { Area, CartesianGrid, ComposedChart, Line, PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "../api";
import { StarButton } from "./ui";
import { fmt, inr, pct, SCORE_VAR, scoreColor, SEV_VAR, useLoad } from "../util";

const axis = { stroke: "var(--chart-axis)", fontSize: 11 };
export const tipStyle = { contentStyle: { background: "var(--node-glass)", border: "1px solid var(--dr-border)", borderRadius: 12, fontSize: 12, color: "var(--text-primary)" } };

export default function SupplierDrawer({ id, onClose, onAsk, onNav }) {
  return (
    <AnimatePresence>
      {id && (
        <>
          <motion.div className="scrim" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
          <motion.aside className="drawer" initial={{ x: "100%", rotateY: -8 }} animate={{ x: 0, rotateY: 0 }} exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 260, damping: 30 }} style={{ transformPerspective: 1200 }}>
            <Body id={id} onClose={onClose} onAsk={onAsk} onNav={onNav} />
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

function Body({ id, onClose, onAsk, onNav }) {
  const { data, err, loading } = useLoad(() => api.supplier(id), [id]);
  const [ev, setEv] = useState(null);
  if (loading) return <div style={{ padding: 30 }}><div className="skeleton" style={{ height: 300 }} /></div>;
  if (err) return <div style={{ padding: 30 }} className="err">{err}</div>;
  const s = data.scorecard, ex = data.exposure;
  const Ev = ({ m, children }) => <button className="ev-link" onClick={() => setEv(m)} title="Show the source rows behind this figure">{children}</button>;
  const radar = Object.entries(s.scores).map(([k, v]) => ({ k: k[0].toUpperCase() + k.slice(1), v: v ?? 0 }));
  const trend = data.trends.filter(t => t.lines || t.defects);
  return (
    <>
      <div className="drawer-head">
        <span className={`grade g-${s.grade}`} style={{ width: 48, height: 48, fontSize: 22, borderRadius: 14 }}>{s.grade}</span>
        <div style={{ flex: 1 }}>
          <div className="eyebrow">{s.supplier_id} · {s.material_category} · {s.country}</div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>{s.supplier_name}</div>
          <div className="row-flex" style={{ marginTop: 6 }}>
            <span className={`pill tier-${s.risk_tier}`}>{s.risk_tier} tier</span>
            <span className="pill st">Score {fmt(s.composite_score)}</span>
            <span className="pill st">Perf #{s.performance_rank} · Risk #{s.risk_rank}</span>
            <span className="muted">{s.quality_certification}</span>
          </div>
        </div>
        <StarButton id={id} size={18} />
        <button className="ghost icon-btn" onClick={onClose}><X size={18} /></button>
      </div>
      <div className="drawer-body">
        <div className="row-flex">
          <button className="glow-btn" onClick={() => onAsk(`Give me a full performance review of ${s.supplier_name} (${s.supplier_id}): scorecard, trends, open issues, exposure, and recommended corrective actions.`)}><Bot size={16} /> Ask agent</button>

          <button className="ghost row-flex" onClick={() => onNav("review", id)}><FileText size={16} /> Review pack</button>
        </div>

        <div className="grid g-2e">
          <div className="card">
            <h3>Scorecard balance</h3>
            <ResponsiveContainer width="100%" height={220}>
              <RadarChart data={radar} outerRadius="72%">
                <PolarGrid stroke="var(--dr-border)" />
                <PolarAngleAxis dataKey="k" tick={{ fill: "var(--text-secondary)", fontSize: 11 }} />
                <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                <Radar dataKey="v" stroke="var(--brand-purple)" fill="var(--brand-purple)" fillOpacity={0.3} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
          <div className="card">
            <h3>Sub-scores</h3>
            {Object.entries(s.scores).map(([k, v]) => (
              <div className="subscore" key={k}>
                <span style={{ textTransform: "capitalize" }}>{k}</span>
                <div className="bar"><i style={{ width: `${v ?? 0}%`, background: SCORE_VAR[k] }} /></div>
                <b className="num" style={{ color: scoreColor(v) }}>{fmt(v, 0)}</b>
              </div>
            ))}
            <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 12, fontSize: 12 }}>
              <Ev m="otif"><span className="sec">OTIF <b>{pct(s.otif_pct)}</b></span></Ev><Ev m="otif"><span className="sec">In-full <b>{pct(s.in_full_pct)}</b></span></Ev>
              <Ev m="ppm"><span className="sec">PPM <b>{fmt(s.incoming_ppm, 0)}</b></span></Ev><Ev m="lead_time"><span className="sec">LT var <b>{fmt(s.avg_lead_time_variance_days)} d</b></span></Ev>
              <Ev m="ncr"><span className="sec">Overdue CAPA <b>{fmt(s.overdue_capa)}</b></span></Ev><Ev m="disruption"><span className="sec">Disruption <b>{fmt(s.disruption_hours)} h</b></span></Ev>
              <Ev m="price"><span className="sec">Spend <b>{inr(s.spend_inr)}</b></span></Ev><Ev m="price"><span className="sec">Price var <b>{pct(s.price_variance_pct)}</b></span></Ev>
            </div>
            <div className="muted" style={{ fontSize: 11, marginTop: 8 }}>
              <FileSearch size={11} /> Click a figure for its source rows · PPM: {s.ppm_method === "INCOMING_INSPECTION" ? "incoming inspection" : "genealogy-attributed estimate"}
              {s.avg_response_days != null && <> · NCR response {fmt(s.avg_response_days)} d</>} · health {s.health?.replace("_", " ").toLowerCase()}</div>
          </div>
        </div>

        {ev && <Evidence id={id} metric={ev} onClose={() => setEv(null)} />}

        <div className="card">
          <h3>Weekly trend <span className="muted">OTIF % and attributed defects</span></h3>
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart data={trend}>
              <CartesianGrid stroke="var(--dr-border)" vertical={false} />
              <XAxis dataKey="period" {...axis} tickFormatter={d => d.slice(5)} />
              <YAxis yAxisId="l" {...axis} domain={[0, 100]} />
              <YAxis yAxisId="r" orientation="right" {...axis} />
              <Tooltip {...tipStyle} />
              <Area yAxisId="r" dataKey="defects" name="Defects" fill="var(--chart-c3)" stroke="var(--chart-c3)" fillOpacity={0.15} />
              <Line yAxisId="l" dataKey="otif_pct" name="OTIF %" stroke="var(--chart-c1)" strokeWidth={2.5} dot={false} connectNulls />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {data.alerts.length > 0 && (
          <div className="card">
            <h3>Active risk alerts <span className="muted">{data.alerts.length}</span></h3>
            {data.alerts.map(a => (
              <div className="alert" key={a.id}>
                <i className="stripe" style={{ background: SEV_VAR[a.severity] }} />
                <div><div className="t">{a.title}</div><div className="d">{a.detail}</div><div className="r">→ {a.recommended_action}</div></div>
                <span className={`pill sev-${a.severity}`}>{a.severity}</span>
              </div>
            ))}
          </div>
        )}

        <div className="grid g-2e">
          <div className="card">
            <h3>Exposure</h3>
            <div className="sec" style={{ fontSize: 13, lineHeight: 1.8 }}>
              <div>Past-due PO lines: <b>{ex.past_due_lines.length}</b> ({ex.materials_past_due.join(", ") || "none"})</div>
              <div>Open production orders at risk: <b>{ex.at_risk_production_orders}</b></div>
              <div>Customer orders at risk: <b>{ex.at_risk_customer_orders}</b> · qty <b>{fmt(ex.at_risk_order_qty, 0)}</b></div>
            </div>
            <table className="tbl" style={{ marginTop: 10 }}>
              <thead><tr><th>Line</th><th>Plant</th><th className="num">Defects</th><th className="num">Prod. orders</th></tr></thead>
              <tbody>{ex.quality_exposure_by_line.map(l => (
                <tr key={l.line_id + l.plant_id}><td>{l.line_id}</td><td>{l.plant_id}</td><td className="num">{fmt(l.attributed_defects)}</td><td className="num">{l.production_orders}</td></tr>
              ))}</tbody>
            </table>
          </div>
          <div className="card">
            <h3>Top defects</h3>
            <table className="tbl">
              <thead><tr><th>Defect</th><th>Material</th><th className="num">Attributed</th></tr></thead>
              <tbody>{data.defects.slice(0, 8).map(d => (
                <tr key={d.defect_code + d.material_id}><td>{d.defect_name}</td><td>{d.material_id}</td><td className="num">{fmt(d.defects, 2)}</td></tr>
              ))}</tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <h3>Open NCR / CAPA <span className="muted">{data.open_issues.length} open · oldest first</span></h3>
          <div className="tbl-wrap" style={{ maxHeight: 300 }}>
            <table className="tbl">
              <thead><tr><th>NCR</th><th>Defect</th><th>Root cause</th><th>Status</th><th className="num">Age (d)</th><th>Due</th><th>Material</th></tr></thead>
              <tbody>{data.open_issues.slice(0, 40).map(n => (
                <tr key={n.ncr_id + n.material_id}>
                  <td>{n.ncr_id}</td><td>{n.defect_name}</td><td>{n.root_cause_category}</td>
                  <td><span className={`pill ${n.is_overdue ? "sev-CRITICAL" : "sev-LOW"}`}>{n.is_overdue ? "OVERDUE" : n.capa_status}</span></td>
                  <td className="num">{n.open_age_days}</td><td>{n.capa_due_date}</td><td>{n.material_id}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}


// Evidence drill (F4): the exact rows behind a figure, with the definition and config version used.
function Evidence({ id, metric, onClose }) {
  const { data, err, loading } = useLoad(() => api.evidence(id, metric), [id, metric]);
  const rows = data?.rows || [];
  const cols = rows.length ? Object.keys(rows[0]) : [];
  const csv = () => {
    const esc = v => `"${String(v ?? "").replaceAll('"', '""')}"`;
    const blob = new Blob([[cols.join(","), ...rows.map(r => cols.map(c => esc(r[c])).join(","))].join("\n")], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `${id}_${metric}_evidence.csv`; a.click();
  };
  return (
    <div className="card">
      <h3 style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><span><FileSearch size={15} /> Evidence · {metric.replace("_", " ")}</span>
        <span className="row-flex" style={{ gap: 6 }}>{rows.length > 0 && <button className="ghost chip-btn" onClick={csv}>CSV</button>}<button className="ghost icon-btn" onClick={onClose}><X size={14} /></button></span></h3>
      {loading && <div className="skeleton" style={{ height: 120 }} />}
      {err && <div className="err">{err}</div>}
      {data && <>
        <div className="ev-def">{data.definition} · {data.row_count} rows · as of {data.as_of_date} · definitions v{data.config_version} ({data.config_hash})</div>
        <div className="tbl-wrap ev-table"><table className="tbl">
          <thead><tr>{cols.map(c => <th key={c}>{c.replaceAll("_", " ")}</th>)}</tr></thead>
          <tbody>{rows.slice(0, 200).map((r, i) => <tr key={i}>{cols.map(c => <td key={c}>{typeof r[c] === "boolean" ? (r[c] ? "✓" : "✗") : Array.isArray(r[c]) ? r[c].join(", ") : String(r[c] ?? "–")}</td>)}</tr>)}</tbody>
        </table></div>
      </>}
    </div>
  );
}
