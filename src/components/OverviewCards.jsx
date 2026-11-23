import { useState } from "react";
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Bug, Truck } from "lucide-react";
import { api } from "../api";
import { fmt, GRADE_VAR, useLoad } from "../util";
import { Card } from "./ui";
import { tipStyle } from "./SupplierDrawer";

/* Overview: two cards, one question each. OTIF = ranked bars (compare suppliers); defects = donut (what share of all
   defects each type makes up). Click a supplier bar to open that supplier. */
const short = n => (n || "").replace(/ (Solutions|Systems|Components|Materials|Modules|Works|Tech|Energy|Enclosures)$/, "");
const AX = { fontSize: 11, fill: "var(--text-secondary)" };
// top 5 defect types get their own, clearly different colour; the rest share one neutral "Other" slice
const SLICE = ["#6f3dba", "#1e88e5", "#f58a3a", "#00a39b", "#d81b60"], OTHER = "#b8bfcc", TOP = 5;

export default function OverviewCards({ cards = [], plant, openSupplier, asOf, supplierKey = "" }) {
  const defects = useLoad(() => api.defects(supplierKey ? { supplier_id: supplierKey } : {}).catch(() => []), [supplierKey]);   // follows the page filters
  const [hot, setHot] = useState(null);

  const otif = [...cards].filter(c => c.otif_pct != null).sort((a, b) => a.otif_pct - b.otif_pct).map(c => ({ ...c, name: short(c.supplier_name) }));
  // donut: largest defect types first; the long tail grouped as "Other" so every slice stays readable
  const byType = Object.values((defects.data || []).reduce((acc, d) => {
    const k = d.defect_name || d.defect_code; acc[k] = acc[k] || { name: k, defects: 0 }; acc[k].defects += Number(d.defects) || 0; return acc;
  }, {})).sort((a, b) => b.defects - a.defects);
  const total = byType.reduce((s, d) => s + d.defects, 0);
  const rest = byType.slice(TOP);
  const slices = [...byType.slice(0, TOP).map((d, i) => ({ ...d, color: SLICE[i] })),
    ...(rest.length ? [{ name: `Other (${rest.length} types)`, defects: rest.reduce((s, d) => s + d.defects, 0), color: OTHER, other: rest }] : [])]
    .map(d => ({ ...d, defects: Math.round(d.defects * 10) / 10, pct: total ? (100 * d.defects) / total : 0 }));
  const topShare = slices.filter(s => !s.other).reduce((s, d) => s + d.pct, 0);
  const avgOtif = otif.length ? otif.reduce((s, c) => s + c.otif_pct, 0) / otif.length : null;
  const click = d => d?.supplier_id && openSupplier(d.supplier_id);
  const centre = hot != null ? slices[hot] : null;

  return (
    <div className="ov-grid">
      <Card title="OTIF by supplier" icon={Truck} sub={`On time and in full · worst first · portfolio ${fmt(avgOtif)}%`}>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={otif} layout="vertical" margin={{ top: 2, right: 34, left: 4, bottom: 0 }}>
            <XAxis type="number" domain={[0, 100]} tick={AX} unit="%" />
            <YAxis type="category" dataKey="name" width={112} tick={AX} interval={0} />
            <Tooltip {...tipStyle} formatter={v => [`${fmt(v)}%`, "OTIF"]} cursor={{ fill: "var(--dr-hover)" }} />
            <Bar dataKey="otif_pct" radius={[0, 5, 5, 0]} barSize={13} onClick={click} cursor="pointer"
              label={{ position: "right", fontSize: 10.5, fill: "var(--text-secondary)", formatter: v => `${Math.round(v)}%` }}>
              {otif.map(c => <Cell key={c.supplier_id} fill={GRADE_VAR[c.grade]} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Card>

      <Card title="Defects by type" icon={Bug}
        sub={slices.length ? `Share of all defects traced to suppliers · top ${Math.min(TOP, byType.length)} types = ${fmt(topShare, 0)}%` : "Defects traced to suppliers"}>
        {!slices.length ? <div className="skeleton" style={{ height: 220 }} /> :
        <div className="ov-donut">
          <div className="ov-donut-chart">
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Tooltip {...tipStyle} formatter={(v, n, p) => [`${fmt(v, 1)} defects · ${fmt(p.payload.pct, 1)}%`, p.payload.name]} />
                <Pie data={slices} dataKey="defects" nameKey="name" innerRadius="60%" outerRadius="92%" paddingAngle={1.5} startAngle={90} endAngle={-270}
                  stroke="var(--white)" strokeWidth={2} onMouseEnter={(_, i) => setHot(i)} onMouseLeave={() => setHot(null)} isAnimationActive>
                  {slices.map((s, i) => <Cell key={s.name} fill={s.color} opacity={hot == null || hot === i ? 1 : 0.45} />)}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="ov-donut-centre" aria-live="polite">
              <b>{centre ? `${fmt(centre.pct, 0)}%` : fmt(total, 0)}</b>
              <span>{centre ? centre.name : "defects"}</span>
            </div>
          </div>
          <ul className="ov-donut-legend">
            {slices.map((s, i) => (
              <li key={s.name} className={hot === i ? "on" : ""} onMouseEnter={() => setHot(i)} onMouseLeave={() => setHot(null)}
                title={s.other ? s.other.map(o => `${o.name}: ${fmt(o.defects, 0)}`).join(" · ") : undefined}>
                <i style={{ background: s.color }} /><span>{s.name}</span><b>{fmt(s.defects, 0)}</b><em>{fmt(s.pct, 0)}%</em>
              </li>))}
          </ul>
        </div>}
      </Card>
    </div>
  );
}
