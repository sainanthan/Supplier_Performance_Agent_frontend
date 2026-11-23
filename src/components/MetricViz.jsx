import { useState } from "react";
import { Database, X } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "../api";
import { tipStyle } from "./SupplierDrawer";
import { fmt, useLoad } from "../util";

const SERIES = ["var(--chart-c1)", "var(--chart-c2)", "var(--chart-c3)", "var(--chart-c4)", "var(--brand-orange)", "var(--brand-purple)"];
const axis = { stroke: "var(--chart-axis)", fontSize: 11 };

// Renders a chart spec produced by the backend safe query layer (app/metrics.py): line | bar | kpi.
export function MetricChart({ chart, height = 220 }) {
  if (!chart) return null;
  if (chart.type === "kpi") return <div className="mv-kpi"><b>{fmt(chart.value)}</b><span>{chart.unit}</span></div>;
  const data = chart.data || [];
  if (chart.type === "line") return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 12, left: -10, bottom: 0 }}>
        <CartesianGrid stroke="var(--dr-border)" vertical={false} />
        <XAxis dataKey={chart.x} {...axis} tickFormatter={v => String(v).slice(0, 7)} /><YAxis {...axis} />
        <Tooltip {...tipStyle} />{chart.series.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} />}
        {chart.series.map((s, i) => <Line key={s.key} dataKey={s.key} name={s.label} stroke={SERIES[i % SERIES.length]} strokeWidth={2.2} dot={{ r: 3 }} connectNulls />)}
      </LineChart>
    </ResponsiveContainer>);
  const k = chart.series[0].key;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 12, left: -10, bottom: 0 }}>
        <CartesianGrid stroke="var(--dr-border)" vertical={false} />
        <XAxis dataKey={chart.x || "name"} {...axis} interval={0} angle={data.length > 5 ? -25 : 0} textAnchor={data.length > 5 ? "end" : "middle"} height={data.length > 5 ? 60 : 30}
          tickFormatter={v => String(v).length > 16 ? String(v).slice(0, 15) + "…" : v} />
        <YAxis {...axis} /><Tooltip {...tipStyle} />
        <Bar dataKey={k} name={chart.series[0].label} isAnimationActive={false} radius={data.some(d => d[k] < 0) ? 0 : [6, 6, 0, 0]}>
          {data.map((d, i) => <Cell key={i} fill={k === "change" ? (d[k] < 0 ? "var(--depth-0)" : "var(--chart-c4)") : "var(--chart-c1)"} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>);
}

// "Show source records": the exact rows behind a metric figure (GET /api/metrics/{id}/records).
export function SourceRecords({ source, onClose }) {
  const { data, err, loading } = useLoad(() => api.metricRecords(source.metric, source.filters || {}), [JSON.stringify(source)]);
  const rows = data?.rows || [];
  const cols = rows.length ? Object.keys(rows[0]) : [];
  const csv = () => {
    const esc = v => `"${String(v ?? "").replaceAll('"', '""')}"`;
    const blob = new Blob([[cols.join(","), ...rows.map(r => cols.map(c => esc(r[c])).join(","))].join("\n")], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `${source.metric}_records.csv`; a.click();
  };
  return (
    <div className="mv-records">
      <div className="row-flex" style={{ justifyContent: "space-between" }}>
        <b><Database size={13} /> Source records · {data?.label || source.metric}</b>
        <span className="row-flex" style={{ gap: 6 }}>{rows.length > 0 && <button className="ghost chip-btn" onClick={csv}>CSV</button>}
          {onClose && <button className="ghost icon-btn" style={{ width: 26, height: 26 }} onClick={onClose}><X size={13} /></button>}</span>
      </div>
      {loading && <div className="skeleton" style={{ height: 80 }} />}
      {err && <div className="err">{err}</div>}
      {data && <>
        <div className="ev-def">{data.definition} · {data.view} where {data.condition}{Object.keys(data.filters || {}).length ? ` · filters ${JSON.stringify(data.filters)}` : ""} · {data.row_count} rows{data.row_count > rows.length ? ` (showing ${rows.length})` : ""}{data.note ? ` · ${data.note}` : ""}</div>
        <div className="tbl-wrap ev-table"><table className="tbl">
          <thead><tr>{cols.map(c => <th key={c}>{c.replaceAll("_", " ")}</th>)}</tr></thead>
          <tbody>{rows.slice(0, 200).map((r, i) => <tr key={i}>{cols.map(c => <td key={c}>{typeof r[c] === "boolean" ? (r[c] ? "✓" : "✗") : String(r[c] ?? "–")}</td>)}</tr>)}</tbody>
        </table></div>
      </>}
    </div>
  );
}

// Chart + definition + "show source records" link, used in chat answers and dashboards.
export function MetricArtifact({ a, height }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mv-art">
      <div className="mv-title">{a.chart?.title || a.label}</div>
      <MetricChart chart={a.chart} height={height} />
      <div className="row-flex" style={{ justifyContent: "space-between", gap: 8 }}>
        <span className="muted" style={{ fontSize: 11 }}>{a.definition}</span>
        <button className="ghost chip-btn" onClick={() => setOpen(o => !o)}><Database size={12} /> {open ? "Hide" : "Show"} source records</button>
      </div>
      {open && <SourceRecords source={a.source} onClose={() => setOpen(false)} />}
    </div>
  );
}
