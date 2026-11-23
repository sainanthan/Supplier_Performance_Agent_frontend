// Spend-concentration heatmap (material x supplier share %) with its click-through detail panel. Lives on the Overview.
// Click a cell -> material x supplier detail; a material code -> how its spend is split; a supplier code -> supplier profile.
// Actions that belong to Risk Radar (sourcing comparison, raising a corrective action) hand over through sessionStorage.
import { lazy, Suspense, useMemo, useState } from "react";
import { Grid3x3 } from "lucide-react";
import { api } from "../api";
import { Card } from "./ui";
import { fmt, useLoad } from "../util";
const ConcentrationDetail = lazy(() => import("./ConcentrationDetail"));

/* sequential yellow -> orange -> red, saturating at the concentration-alert share (approved setting, default 25 %) */
const YOR = [[0, [255, 247, 214]], [0.25, [252, 227, 138]], [0.5, [249, 160, 63]], [0.75, [232, 87, 42]], [1, [179, 32, 31]]];
export function yor(v, max) {
  const t = Math.max(0, Math.min(1, v / max));
  let i = 1; while (i < YOR.length - 1 && YOR[i][0] < t) i++;
  const [t0, a] = YOR[i - 1], [t1, b] = YOR[i], k = (t - t0) / ((t1 - t0) || 1);
  return `rgb(${a.map((c, j) => Math.round(c + (b[j] - c) * k)).join(",")})`;
}

const stash = (k, v) => { try { sessionStorage.setItem(k, typeof v === "string" ? v : JSON.stringify(v)); } catch { /* storage unavailable */ } };

export default function ConcentrationHeatmap({ scope, sups, alerts, openSupplier, ask, nav, user }) {
  const conc = useLoad(() => api.concentration(), []);
  const cfgQ = useLoad(() => api.config().catch(() => null), []);
  const concMax = cfgQ.data?.concentration_share_pct || 25;
  const canSource = ["ADMIN", "PROCUREMENT"].includes(user?.role);
  const [cell, setCell] = useState(null);
  const heat = useMemo(() => {
    const d0 = conc.data || [];
    const d = scope ? d0.filter(r => scope.has(r.supplier_id) && r.share_pct > 0) : d0;
    const sup = [...new Set(d.map(r => r.supplier_id))].sort();
    const m = [...new Set(d.map(r => r.material_id))].sort();
    const v = Object.fromEntries(d.map(r => [r.material_id + r.supplier_id, r.share_pct]));
    const over = d.filter(r => r.share_pct >= concMax).length;
    return { sup, m, v, over, name: Object.fromEntries(d.map(r => [r.material_id, r.material_name])), sname: Object.fromEntries(d.map(r => [r.supplier_id, r.supplier_name])) };
  }, [conc.data, scope, concMax]);

  return <Card title="Spend concentration" icon={Grid3x3} className="hm-conc lite"
    sub={`Share % of each material's spend by supplier${scope ? ` · ${heat.sup.length} filtered supplier(s)` : ""} · ${heat.over} cell(s) at or above the ${concMax}% alert level`}>
    {conc.loading ? <div className="skeleton" style={{ height: 300 }} /> : <>
      <div className="tbl-wrap">
        <div className="heat heat-lg heat-lite" style={{ gridTemplateColumns: `minmax(120px, 170px) repeat(${heat.sup.length}, minmax(30px, 44px))` }}>
          <span />{heat.sup.map(s => <button key={s} className="h hb hcol" onClick={() => openSupplier(s)} title={`${heat.sname[s] || s}: open supplier profile`}>
            <b>{s.slice(4)}</b><em>{(heat.sname[s] || "").split(" ")[0]}</em></button>)}
          {heat.m.map(m => [
            <button key={m} className="h hb hrow" title={`${heat.name[m]}: see how its spend is split`} onClick={() => setCell({ m })}>{heat.name[m]}</button>,
            ...heat.sup.map(s => {
              const v = heat.v[m + s] || 0;
              return <span key={m + s} className="c" role={v ? "button" : undefined} tabIndex={v ? 0 : -1}
                title={v ? `${heat.name[m]} · ${heat.sname[s]}: ${fmt(v)}% · click for details` : undefined}
                onKeyDown={e => v && e.key === "Enter" && setCell({ m, s })}
                style={{ background: v ? yor(v, concMax) : "var(--kg-bg-3)", color: v / concMax >= 0.62 ? "#FFF8F0" : "#4A2A0A", fontWeight: v >= concMax ? 800 : 600, cursor: v ? "pointer" : "default" }}
                onClick={() => v && setCell({ m, s })}>{v ? Math.round(v) : ""}</span>;
            }),
          ])}
        </div>
      </div>
      <div className="heat-foot">
        <div className="heat-legend" aria-label="Colour scale">
          <span>0%</span><i style={{ background: `linear-gradient(90deg, ${[0, 0.25, 0.5, 0.75, 1].map(t => yor(t * concMax, concMax)).join(", ")})` }} />
          <span>{concMax}%+ · concentration alert</span>
        </div>
        <span className="muted heat-hint">Click a cell for the detail, a material for its spend split, a supplier for its profile.</span>
      </div>
    </>}
    {cell && <Suspense fallback={null}><ConcentrationDetail cell={cell} conc={conc.data} sups={sups} alerts={alerts} concMax={concMax} colour={v => yor(v, concMax)} canSource={canSource}
      onClose={() => setCell(null)} onCell={setCell} onSupplier={id => { setCell(null); openSupplier(id); }} onAsk={q => { setCell(null); ask(q); }}
      onSourcing={m => { setCell(null); stash("rr.mat", m); nav("risk"); }}
      onAction={x => { setCell(null); stash("rr.seed", { supplier_id: x.supplier_id, title: `Concentration: ${x.supplier_name} holds ${Math.round(x.share)}% of ${x.name} spend`.slice(0, 190),
        description: `${x.supplier_name} holds ${Math.round(x.share)}% of spend on ${x.name} (${x.material_id}), at or near the ${concMax}% concentration alert level. Review dependency, qualified alternatives and safety stock.`,
        category: "COMMERCIAL", priority: x.share >= concMax ? "HIGH" : "MEDIUM", owner_role: "PROCUREMENT" }); nav("risk"); }} /></Suspense>}
  </Card>;
}
