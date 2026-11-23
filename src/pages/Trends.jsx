import { useState } from "react";
import { FilterBar, FSelect, PageHead, supplierOptions, uniq } from "../components/ui";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from "recharts";
import { api } from "../api";
import { tipStyle } from "../components/SupplierDrawer";
import { useLoad } from "../util";

const axis = { stroke: "var(--chart-axis)", fontSize: 11 };
const M = { top: 8, right: 16, bottom: 0, left: -6 };
// defined once (not inside the page) so filter changes update the charts instead of remounting and re-animating them
const Chart = ({ title, children, h = 240 }) => (
  <div className="card"><h3>{title}</h3><ResponsiveContainer width="100%" height={h}>{children}</ResponsiveContainer></div>
);

export default function Trends({ plant, ask }) {
  const [sid, setSid] = useState("");
  const [grain, setGrain] = useState("week");
  const [period, setPeriod] = useState("");
  const [cat, setCat] = useState("");
  const sups = useLoad(() => api.scorecard({}), []);
  const supList = (sups.data || []).filter(s => !cat || s.material_category === cat);
  // the category filter applies to every chart: no supplier picked -> all suppliers of that category
  const scope = sid || (cat ? supList.map(s => s.supplier_id).join(",") || "__none__" : "");
  const t = useLoad(() => (cat && !sups.data && !sid ? Promise.resolve([]) : api.trends({ supplier_id: scope, grain, plant_id: plant })), [scope, grain, plant]);
  const all = (t.data || []).filter(r => r.otif_pct != null || r.ppm != null || (r.defects && r.lines));
  const data = period ? all.slice(-Number(period)) : all;
  const name = (sups.data || []).find(s => s.supplier_id === sid)?.supplier_name || (cat ? `${cat} suppliers (${supList.length})` : "All suppliers");
  const fmtX = d => (grain === "month" ? d.slice(0, 7) : d.slice(5));
  return (
    <>
      <PageHead eyebrow="Trends" title="OTIF / PPM Trends" sub="Is delivery and quality getting better or worse?">
          <button className="glow-btn" onClick={() => ask(`Analyse the ${grain}ly OTIF and PPM trend for ${name}. Is performance deteriorating? What is driving it?`)}>Explain trend</button>
      </PageHead>
      <FilterBar active={[sid, period, cat].filter(Boolean).length + (grain !== "week" ? 1 : 0)} onClear={() => { setSid(""); setPeriod(""); setCat(""); setGrain("week"); }}>
        <FSelect label="Category" value={cat} onChange={v => { setCat(v); setSid(""); }} options={uniq(sups.data, "material_category")} />
        <FSelect label="Supplier" value={sid} onChange={setSid} options={supplierOptions(supList)} all="All suppliers" />
        <FSelect label="Grain" value={grain} onChange={setGrain} options={[["week", "Weekly"], ["month", "Monthly"]]} all={null} />
        <FSelect label="Period" value={period} onChange={setPeriod} options={grain === "week" ? [["4", "Last 4 weeks"], ["8", "Last 8 weeks"], ["12", "Last 12 weeks"]] : [["2", "Last 2 months"], ["3", "Last 3 months"]]} all="All data" />
      </FilterBar>
      {t.err && <div className="err">{t.err}</div>}
      <div className="grid g-2e">
        <Chart title={`OTIF & on-time % · ${name}`}>
          <LineChart data={data} margin={M}>
            <CartesianGrid stroke="var(--dr-border)" vertical={false} />
            <XAxis dataKey="period" {...axis} tickFormatter={fmtX} /><YAxis {...axis} domain={[0, 100]} />
            <Tooltip {...tipStyle} /><Legend wrapperStyle={{ fontSize: 12 }} />
            <Line dataKey="otif_pct" name="OTIF %" stroke="var(--chart-c1)" strokeWidth={2.5} dot={{ r: 3 }} connectNulls />
            <Line dataKey="on_time_pct" name="On-time %" stroke="var(--chart-c4)" strokeWidth={2} strokeDasharray="5 4" dot={false} connectNulls />
          </LineChart>
        </Chart>
        <Chart title={`Incoming PPM · ${name}`}>
          <AreaChart data={data} margin={M}>
            <defs><linearGradient id="ppm" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--chart-c3)" stopOpacity={0.45} /><stop offset="100%" stopColor="var(--chart-c3)" stopOpacity={0} /></linearGradient></defs>
            <CartesianGrid stroke="var(--dr-border)" vertical={false} />
            <XAxis dataKey="period" {...axis} tickFormatter={fmtX} /><YAxis {...axis} />
            <Tooltip {...tipStyle} />
            <Area dataKey="ppm" name="PPM" stroke="var(--chart-c3)" fill="url(#ppm)" strokeWidth={2.5} connectNulls />
          </AreaChart>
        </Chart>
        <Chart title={`Average delay & lead-time variance (days) · ${name}`}>
          <LineChart data={data} margin={M}>
            <CartesianGrid stroke="var(--dr-border)" vertical={false} />
            <XAxis dataKey="period" {...axis} tickFormatter={fmtX} /><YAxis {...axis} />
            <Tooltip {...tipStyle} /><Legend wrapperStyle={{ fontSize: 12 }} />
            <Line dataKey="avg_delay_days" name="Avg delay" stroke="var(--chart-c2)" strokeWidth={2.5} dot={false} connectNulls />
            <Line dataKey="avg_lead_time_variance_days" name="LT variance" stroke="var(--chart-o3)" strokeWidth={2} dot={false} connectNulls />
          </LineChart>
        </Chart>
        <Chart title={`Attributed defects (critical highlighted) · ${name}`}>
          <BarChart data={data} margin={M}>
            <CartesianGrid stroke="var(--dr-border)" vertical={false} />
            <XAxis dataKey="period" {...axis} tickFormatter={fmtX} /><YAxis {...axis} />
            <Tooltip {...tipStyle} cursor={{ fill: "var(--dr-hover)" }} /><Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="defects" name="All defects" fill="var(--chart-o2)" radius={[6, 6, 0, 0]} />
            <Bar dataKey="critical_defects" name="Critical" fill="var(--depth-0)" radius={[6, 6, 0, 0]} />
          </BarChart>
        </Chart>
      </div>
    </>
  );
}
