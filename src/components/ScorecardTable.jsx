import { useEffect, useMemo, useState } from "react";
import { Download, FlaskConical, RotateCcw, Table2 } from "lucide-react";
import { api } from "../api";
import { Card, StarButton } from "./ui";
import { fmt, inr, pct, SCORE_VAR, scoreColor, useLoad } from "../util";

const COLS = [
  ["star", ""], ["performance_rank", "#"], ["supplier_name", "Supplier"], ["grade", "Grade"], ["composite_score", "Score"],
  ["otif_pct", "OTIF"], ["in_full_pct", "In-full"], ["lead_time_adherence_pct", "LT adh."], ["avg_lead_time_variance_days", "LT var (d)"],
  ["incoming_ppm", "PPM"], ["open_ncr", "Open NCR"], ["overdue_capa", "Overdue CAPA"], ["price_variance_pct", "Price var"],
  ["disruption_hours", "Disrupt. h"], ["spend_inr", "Spend"], ["risk_rank", "Risk #"],
];
const PILLARS = ["delivery", "quality", "responsiveness", "commercial"];
const LEFT = ["supplier_name", "grade", "composite_score", "star"];

/* Supplier scorecard table, embedded in Overview (uses Overview's filters). What-if re-ranks live; nothing is saved. */
export default function ScorecardTable({ plant, openSupplier, f = {} }) {
  const start = "", end = "";
  const [sort, setSort] = useState(["performance_rank", 1]);
  const [simOpen, setSimOpen] = useState(false);
  const [w, setW] = useState(null);
  const [sim, setSim] = useState(null);
  const cfg = useLoad(() => api.config(), []);
  const { data, err, loading } = useLoad(() => api.scorecard({ plant_id: plant, start, end }), [plant, start, end]);

  useEffect(() => { if (cfg.data && !w) setW(Object.fromEntries(PILLARS.map(k => [k, Math.round(cfg.data.weights[k] * 100)]))); }, [cfg.data]); // eslint-disable-line
  // Debounced live re-rank while the sliders move (nothing is saved).
  useEffect(() => {
    if (!simOpen || !w) { setSim(null); return; }
    const t = setTimeout(() => api.simulate({ weights: w, start: start || null, end: end || null, plant_id: plant || null })
      .then(r => setSim(Object.fromEntries(r.map(x => [x.supplier_id, x])))).catch(() => {}), 250);
    return () => clearTimeout(t);
  }, [simOpen, w, start, end, plant]);

  const merged = useMemo(() => (data || []).map(r => (sim?.[r.supplier_id]
    ? { ...r, composite_score: sim[r.supplier_id].composite_score, grade: sim[r.supplier_id].grade,
        performance_rank: sim[r.supplier_id].performance_rank, rank_change: sim[r.supplier_id].rank_change, scores: r.scores }
    : r)), [data, sim]);
  const rows = useMemo(() => [...merged].filter(r => (!f.grade || r.grade === f.grade)
    && (!f.tier || r.risk_tier === f.tier) && (!f.cat || r.material_category === f.cat)
    && (!f.q || `${r.supplier_id} ${r.supplier_name}`.toLowerCase().includes(f.q.toLowerCase()))).sort((a, b) => {
    const [k, d] = sort; const x = a[k] ?? -1e9, y = b[k] ?? -1e9;
    return (x > y ? 1 : x < y ? -1 : 0) * d;
  }), [merged, sort, f]);

  const csv = () => {
    const keys = COLS.map(c => c[0]).filter(k => k !== "star");
    const lines = [keys.join(","), ...rows.map(r => keys.map(k => JSON.stringify(r[k] ?? "")).join(","))];
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" }));
    a.download = "supplier_scorecard.csv"; a.click();
  };
  const total = w ? PILLARS.reduce((s, k) => s + Number(w[k]), 0) : 0;
  const cell = (r, k) => {
    switch (k) {
      case "star": return <StarButton id={r.supplier_id} size={15} />;
      case "performance_rank": return (
        <span className="row-flex" style={{ gap: 6, flexWrap: "nowrap", justifyContent: "flex-end" }}>
          {sim && r.rank_change !== 0 && <span className={`delta ${r.rank_change > 0 ? "good" : "bad"}`}>{r.rank_change > 0 ? "▲" : "▼"}{Math.abs(r.rank_change)}</span>}
          {r.performance_rank}
        </span>);
      case "grade": return <span className={`grade g-${r.grade}`}>{r.grade}</span>;
      case "composite_score": return (
        <div className="row-flex" style={{ gap: 8, flexWrap: "nowrap" }}>
          <b style={{ color: scoreColor(r.composite_score), minWidth: 34 }}>{fmt(r.composite_score)}</b>
          <span className="mini-scores" style={{ height: 22 }} title="Delivery / Quality / Responsiveness / Commercial">
            {PILLARS.map(n => <i key={n} style={{ height: `${Math.max(8, r.scores[n] || 0)}%`, background: SCORE_VAR[n] }} />)}
          </span>
        </div>);
      case "supplier_name": return <div><b>{r.supplier_name}</b><div className="muted">{r.supplier_id} · {r.material_category} · <span className={`pill tier-${r.risk_tier}`} style={{ padding: "0 6px" }}>{r.risk_tier}</span></div></div>;
      case "otif_pct": case "in_full_pct": case "lead_time_adherence_pct": case "price_variance_pct": return pct(r[k]);
      case "spend_inr": return inr(r[k]);
      case "incoming_ppm": return fmt(r[k], 0);
      default: return typeof r[k] === "number" ? fmt(r[k]) : r[k];
    }
  };
  return (
    <>
      {simOpen && w && (
        <Card title="What-if weight simulator" icon={FlaskConical} className="sim"
          sub="Try other weights. Nothing is saved."
          action={<button className="ghost chip-btn row-flex" onClick={() => setW(Object.fromEntries(PILLARS.map(k => [k, Math.round(cfg.data.weights[k] * 100)])))}><RotateCcw size={13} /> Reset</button>}>
          <div className="sim-grid">
            {PILLARS.map(k => (
              <div key={k} className="sim-slider">
                <div className="row-flex" style={{ justifyContent: "space-between" }}>
                  <span style={{ textTransform: "capitalize", fontWeight: 600 }}><i className="dot" style={{ background: SCORE_VAR[k] }} />{k}</span>
                  <b>{total ? Math.round((w[k] / total) * 100) : 0}%</b>
                </div>
                <input type="range" min="0" max="100" value={w[k]} style={{ accentColor: "var(--brand-purple)" }}
                  onChange={e => setW({ ...w, [k]: Number(e.target.value) })} />
              </div>
            ))}
          </div>
        </Card>
      )}

      {err && <div className="err">{err}</div>}
      <Card title={sim ? "Supplier scorecards · simulated ranking" : "Supplier scorecards"} icon={Table2} flush
        sub={`${rows.length} suppliers · weighted score · click a row for details, a header to sort`}
        action={<div className="row-flex" style={{ gap: 6 }}>
          <button className={`ghost chip-btn row-flex ${simOpen ? "active" : ""}`} onClick={() => setSimOpen(v => !v)}><FlaskConical size={13} /> What-if</button>
          <button className="ghost chip-btn row-flex" onClick={csv}><Download size={13} /> CSV</button></div>}>
        {loading && !data ? <div className="skeleton" style={{ height: 400, margin: 20 }} /> : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr>{COLS.map(([k, l]) => (
                <th key={k} className={LEFT.includes(k) ? "" : "num"} onClick={() => k !== "star" && setSort(([sk, d]) => [k, sk === k ? -d : 1])}>
                  {l}{sort[0] === k ? (sort[1] === 1 ? " ▲" : " ▼") : ""}</th>))}</tr></thead>
              <tbody>{rows.map(r => (
                <tr key={r.supplier_id} className="click" onClick={() => openSupplier(r.supplier_id)}>
                  {COLS.map(([k]) => <td key={k} className={LEFT.includes(k) ? "" : "num"}>{cell(r, k)}</td>)}
                </tr>))}
                {rows.length === 0 && <tr><td colSpan={COLS.length} className="muted" style={{ textAlign: "center", padding: 28 }}>No suppliers match these filters. Use Clear to reset.</td></tr>}</tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
