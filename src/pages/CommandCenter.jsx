import { useState } from "react";
import { AlertTriangle, Clock, Factory, Gauge, IndianRupee, Layers, Orbit, PackageX, ShieldAlert, Star, Timer, Trophy } from "lucide-react";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "../api";
import OverviewCards from "../components/OverviewCards";
import ConcentrationHeatmap from "../components/ConcentrationHeatmap";
import { explain } from "../components/AlertLedger";
import ScorecardTable from "../components/ScorecardTable";
import KpiTile from "../components/KpiTile";
import { tipStyle } from "../components/SupplierDrawer";
import { Card, Empty, FDate, FilterBar, FSelect, PageHead, StarButton, supplierOptions, uniq, useWatchlist } from "../components/ui";
import { fmt, GRADE_VAR, inr, pct, SCORE_VAR, scoreColor, SEV_VAR, useLoad } from "../util";

// plain-language meaning of each headline KPI, shown in the tile's detail pop-up
const ABOUT = {
  otif: { series: "OTIF % of PO lines due that week", what: "Share of purchase-order lines delivered on or before the promised date AND in full (within the quantity tolerance). Only lines that are received or already past their promise date count." },
  ppm: { series: "Incoming PPM that week", what: "Defective parts per million received: defects traced back to a supplier's lots ÷ units received × 1,000,000. 85 PPM means 85 bad parts in every million." },
  lt: { series: "Average lead-time variance (days)", what: "How many days longer (positive) or shorter (negative) suppliers actually took than their standard lead time, averaged over received lines." },
  capa: { series: "NCRs opened per week", what: "The tile counts corrective actions (CAPA) past their due date. The chart shows how many new non-conformance reports (NCRs) were opened each week, which is what feeds the CAPA backlog." },
  dis: { series: "Line-stop hours (NO_MATERIAL) per week", what: "Hours our production lines stood still because supplier material was not available (downtime reason NO_MATERIAL)." },
  spend: { what: "Total purchase-order value with the selected suppliers in the period, in rupees (Cr = 1 crore = 10 million)." },
};

export default function CommandCenter({ plant, theme, openSupplier, ask, nav, user }) {
  const [f, setF] = useState({ grade: "", tier: "", cat: "", q: "" });
  // One request for the whole page (computed in parallel and cached on the server).
  const bs = useLoad(() => api.bootstrap({ plant_id: plant }), [plant]);
  const sc = { data: bs.data?.scorecard };
  const al = { data: bs.data?.alerts, loading: bs.loading };
  const wl = useWatchlist();
  const allCards = sc.data || [];
  const cards = allCards.filter(c => (!f.grade || c.grade === f.grade) && (!f.tier || c.risk_tier === f.tier) && (!f.cat || c.material_category === f.cat)
    && (!f.q || `${c.supplier_id} ${c.supplier_name}`.toLowerCase().includes(f.q.toLowerCase())));
  const ids = new Set(cards.map(c => c.supplier_id));
  const nF = Object.values(f).filter(Boolean).length;
  // Filters drive EVERYTHING on the page: with a filter, KPI tiles and sparklines are recomputed for the filtered suppliers.
  const fKey = nF && bs.data ? ([...ids].sort().join(",") || "__none__") : "";
  const fx = useLoad(() => (fKey ? Promise.all([api.overview({ plant_id: plant, suppliers: fKey }), api.pulse({ plant_id: plant, suppliers: fKey })]) : Promise.resolve(null)), [fKey, plant]);
  const ov = { data: fKey ? fx.data?.[0] : bs.data?.overview, err: bs.err || (fKey ? fx.err : null) };
  const o = ov.data || {}, p = (fKey ? fx.data?.[1] : bs.data?.pulse) || {};
  if (ov.err) return <div className="err">Could not load data: {ov.err}. Is the backend running? See README.</div>;

  const alerts = (al.data || []).filter(a => ids.has(a.supplier_id));
  const sevCount = alerts.reduce((m, a) => ({ ...m, [a.severity]: (m[a.severity] || 0) + 1 }), {});
  const pillars = ["delivery", "quality", "responsiveness", "commercial"].map(k => ({
    k, v: cards.length ? cards.reduce((s, c) => s + (c.scores[k] || 0), 0) / cards.length : 0,
  }));
  const watched = cards.filter(c => wl.has(c.supplier_id));

  return (
    <>
      <PageHead eyebrow="Overview" title="Overview" sub="Supplier health, risk signals and scorecards in one place.">
        <button className="glow-btn" onClick={() => ask("Give me today's supplier risk briefing: top risks, which suppliers need corrective action first, and why.")}>
          <ShieldAlert size={16} /> Risk briefing
        </button>
      </PageHead>
      <FilterBar active={nF} onClear={() => setF({ grade: "", tier: "", cat: "", q: "" })}>
        <FSelect label="Supplier" value={f.q} onChange={q => setF({ ...f, q })} options={[...allCards].sort((a, b) => a.supplier_name.localeCompare(b.supplier_name)).map(c => [c.supplier_id, c.supplier_name])} />
        <FSelect label="Grade" value={f.grade} onChange={grade => setF({ ...f, grade })} options={["A", "B", "C", "D"].map(g => [g, `Grade ${g}`])} />
        <FSelect label="Risk tier" value={f.tier} onChange={tier => setF({ ...f, tier })} options={uniq(allCards, "risk_tier")} />
        <FSelect label="Category" value={f.cat} onChange={cat => setF({ ...f, cat })} options={uniq(allCards, "material_category")} />
        <span className="fb-note">{cards.length} of {allCards.length} suppliers</span>
      </FilterBar>

      <div className="grid kpi-row">
        <KpiTile label="Supplier OTIF" value={o.otif_pct} unit="%" icon={Gauge} color="var(--chart-c1)" pulse={p.otif_pct} deltaUnit=" pts" hint="vs prior 4 wks" about={ABOUT.otif} />
        <KpiTile label="Incoming PPM" value={o.incoming_ppm} decimals={0} icon={PackageX} color="var(--chart-c3)" pulse={p.incoming_ppm} hint="vs prior 4 wks" about={ABOUT.ppm} />
        <KpiTile label="Lead-time var." value={o.avg_lead_time_variance_days} unit=" d" icon={Timer} color="var(--brand-orange)" pulse={p.avg_lead_time_variance_days} deltaUnit=" d" hint="actual − standard" about={ABOUT.lt} />
        <KpiTile label="Overdue CAPA" value={o.overdue_capa} decimals={0} icon={Clock} color="var(--depth-0)" pulse={p.ncr_opened} hint={`${fmt(o.open_ncr, 0)} NCRs open`} about={ABOUT.capa} />
        <KpiTile label="Disruption" value={o.disruption_hours} unit=" h" icon={Factory} color="var(--cyan)" pulse={p.disruption_hours} hint="NO_MATERIAL stops" about={ABOUT.dis} />
        <KpiTile label="Spend" value={o.spend_inr} format={inr} icon={IndianRupee} color="var(--chart-c4)" hint={`${o.past_due_lines ?? "–"} lines past due`} about={ABOUT.spend} />
      </div>

      <div className="grid g-hero">
        <OverviewCards cards={cards} plant={plant} openSupplier={openSupplier} asOf={o.as_of_date} supplierKey={fKey} />

        <Card title="Risk signals" icon={AlertTriangle} sub={`${alerts.length} active across ${new Set(alerts.map(a => a.supplier_id)).size} suppliers`}
          className="fill" action={<button className="ghost chip-btn" onClick={() => nav("risk")}>Open radar →</button>}>
          <div className="row-flex" style={{ marginBottom: 6 }}>
            {["CRITICAL", "HIGH", "MEDIUM", "LOW"].map(s => <span key={s} className={`pill sev-${s}`}>{s} {sevCount[s] || 0}</span>)}
          </div>
          <div className="scroll">
            {al.loading && <div className="skeleton" style={{ height: 200 }} />}
            {alerts.slice(0, 12).map(a => (
              <div className="alert compact" key={a.id} onClick={() => openSupplier(a.supplier_id)}>
                <i className="stripe" style={{ background: SEV_VAR[a.severity] }} />
                <div><div className="t">{a.supplier_name}: {a.title}</div><div className="d clamp2">{explain(a, false)}</div></div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {["ADMIN", "PROCUREMENT", "QUALITY"].includes(user?.role) && <ConcentrationHeatmap scope={nF ? ids : null} plant={plant} sups={allCards} alerts={al.data} openSupplier={openSupplier} ask={ask} nav={nav} user={user} />}

      <ScorecardTable plant={plant} openSupplier={openSupplier} f={f} />


    </>
  );
}
