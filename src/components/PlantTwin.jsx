import { useMemo, useState } from "react";
import { ArrowLeft, Database, Factory, PackageCheck, ShieldAlert, Truck, Warehouse } from "lucide-react";
import { api } from "../api";
import { fmt, inr, useLoad } from "../util";
import { shipmentSourceRequest } from "./TwinPanels";

/* Plant digital twin (T4, flag plant_twin). A clean 2.5D floor plan of the plant - inbound docks -> quality hold ->
   warehouses -> production lines -> finished goods - plus days of cover per material, arrivals in 24 / 72 h and line
   exposure. Follows the Network Tracker clock (inventory snapshot of that day). Every figure opens its source rows. */
const ST = { critical: ["Critical", "var(--depth-0)"], watch: ["Watch", "var(--brand-orange)"], ok: ["OK", "var(--chart-c4)"],
  exposed: ["Exposed", "var(--depth-0)"], late: ["Delayed", "var(--depth-0)"], risk: ["At risk", "var(--brand-orange)"] };
const WH = { "RM-WH-01": "Raw material store", "SMT-KIT-01": "SMT kitting", "WIP-WH-01": "Work in progress", "FG-WH-01": "Finished goods" };

const plantRecords = (plantId, date, kind, label, opts = {}) => ({
  title: `${label} · ${plantId}`, sub: `As of ${date}. Same rows the plant twin uses.`,
  load: async () => { const d = await api.plantTwinRecords(plantId, { kind, date, ...opts }); return [{ title: `${d.title} · ${d.row_count} rows`, note: d.snapshot_date ? `Inventory snapshot ${d.snapshot_date}` : null, rows: d.rows }]; },
});

export default function PlantTwin({ plantId, date, onBack, openRecords, onPickShipment }) {
  const d = useLoad(() => api.plantTwin(plantId, { date }), [plantId, date]);
  const [hl, setHl] = useState(null);                    // highlighted material (shows its lines + inbound)
  const [flat, setFlat] = useState(false);
  const x = d.data;
  const mat = useMemo(() => Object.fromEntries((x?.materials || []).map(m => [m.material_id, m])), [x]);
  const hlLines = hl ? new Set(mat[hl]?.lines || []) : null;
  const R = (kind, label, opts) => openRecords(plantRecords(plantId, x?.date || date, kind, label, opts));
  const Src = ({ kind, label, opts }) => <button className="twp-src" onClick={e => { e.stopPropagation(); R(kind, label, opts); }} title="View source records"><Database size={11} /></button>;

  return (
    <div className="pt" role="region" aria-label={`Plant twin ${plantId}`}>
      <div className="pt-head">
        <button className="ghost chip-btn" onClick={onBack}><ArrowLeft size={13} /> Network</button>
        <div className="grow"><b><Factory size={14} /> {x?.plant?.plant_name || plantId}</b>
          <span className="muted"> · plant twin · {x ? `${x.date} (inventory snapshot ${x.snapshot_date})` : "loading…"}</span></div>
        <button className="ghost chip-btn" onClick={() => setFlat(f => !f)} aria-pressed={!flat}>{flat ? "2.5D" : "2D"}</button>
      </div>
      {d.err && <div className="err">{d.err}</div>}
      {!x && !d.err && <div className="skeleton" style={{ height: 420 }} />}
      {x && <>
        <div className="pt-kpis">
          {[["Critical materials", x.summary.critical, "critical", () => R("stock", "Inventory snapshot")],
            ["Watch", x.summary.watch, "watch", () => R("stock", "Inventory snapshot")],
            ["Arrivals 24 h", x.summary.arrivals_24h, null, null], ["Arrivals 72 h", x.summary.arrivals_72h, null, null],
            ["Late inbound", x.summary.late_inbound, x.summary.late_inbound ? "late" : null, null],
            ["Exposed lines", `${x.summary.exposed_lines}/${x.lines.length}`, x.summary.exposed_lines ? "exposed" : null, null],
            ["On quality hold", fmt(x.summary.quality_hold_units, 0), null, () => R("stock", "Inventory snapshot (quality hold)")],
            ["Usable stock value", inr(x.summary.stock_value_inr), null, () => R("stock", "Inventory snapshot")]].map(([l, v, s, fn]) => (
            <button key={l} className="pt-kpi" onClick={fn || undefined} disabled={!fn} style={{ "--c": s ? ST[s][1] : "var(--brand-purple)" }}>
              <span>{l}</span><b>{v}</b></button>))}
        </div>

        {/* 2.5D floor plan */}
        <div className={`pt-floor ${flat ? "flat" : ""}`}>
          <div className="pt-zone docks"><div className="pt-zh"><Truck size={13} /> Inbound docks</div>
            <div className="pt-bays">{x.inbound.filter(i => i.within_24h).slice(0, 12).map(i => (
              <button key={i.id} className={`pt-bay ${hl && i.material_id !== hl ? "dim" : ""}`} style={{ "--c": ST[i.status]?.[1] || "var(--chart-c4)" }}
                title={`${i.po_id} · ${i.material_name} · ${i.supplier_name} · ${ST[i.status]?.[0] || "On time"}`} onClick={() => onPickShipment(i.id)} />))}
              {!x.inbound.some(i => i.within_24h) && <span className="muted">No arrivals in 24 h</span>}</div>
            <div className="pt-zf">{x.summary.arrivals_24h} today · {x.summary.arrivals_72h} in 72 h</div></div>
          <div className="pt-arrow" />
          <div className="pt-zone qc"><div className="pt-zh"><ShieldAlert size={13} /> Incoming inspection</div>
            <div className="pt-big">{fmt(x.summary.quality_hold_units, 0)}</div><div className="pt-zf">units on quality hold <Src kind="stock" label="Quality hold" /></div>
            <div className="pt-note">{x.incoming_inspection_source === "fact_incoming_inspection" ? "from inspection lots" : "from inventory status (no inspection extract)"}</div></div>
          <div className="pt-arrow" />
          <div className="pt-zone wh"><div className="pt-zh"><Warehouse size={13} /> Warehouses</div>
            <div className="pt-whs">{x.warehouses.map(w => (
              <div key={w.warehouse_id} className="pt-wh"><b>{WH[w.warehouse_id] || w.warehouse_id}</b><span>{fmt(w.units, 0)} units · {w.materials} materials</span></div>))}</div></div>
          <div className="pt-arrow" />
          <div className="pt-zone lines"><div className="pt-zh"><Factory size={13} /> Production lines</div>
            {x.lines.map(l => (
              <div key={l.line_id} className={`pt-line ${hlLines && !hlLines.has(l.line_id) ? "dim" : ""}`} style={{ "--c": ST[l.status]?.[1] || "var(--chart-c4)" }}>
                <div className="row-flex" style={{ justifyContent: "space-between" }}><b>{l.line_id}</b><span className="pill" style={{ background: ST[l.status]?.[1] || "var(--chart-c4)", color: "var(--on-accent)" }}>{ST[l.status]?.[0] || "OK"}</span></div>
                <div className="pt-belt"><i style={{ animationDuration: `${Math.max(2, (l.takt_time_sec || 10) / 3)}s` }} /></div>
                <span>{l.line_type} · {fmt(l.capacity_per_hour, 0)}/h · min cover {fmt(l.min_cover_days, 1)} d</span>
              </div>))}</div>
          <div className="pt-arrow" />
          <div className="pt-zone fg"><div className="pt-zh"><PackageCheck size={13} /> Finished goods</div>
            <div className="pt-big">{fmt(x.warehouses.find(w => w.warehouse_id === "FG-WH-01")?.units || 0, 0)}</div><div className="pt-zf">units in FG store</div></div>
        </div>

        <div className="pt-grid">
          <div className="card pt-card">
            <h3>Days of stock cover <span className="muted">critical &lt; {x.thresholds.critical} d or below safety · watch &lt; {x.thresholds.watch} d (approved config) · hover to trace lines</span></h3>
            <div className="tbl-wrap pt-table"><table className="tbl">
              <thead><tr><th>Material</th><th>Status</th><th>Cover</th><th className="num">Usable</th><th className="num">Safety</th><th className="num">Daily use</th><th>Next arrival</th><th>Lines</th><th /></tr></thead>
              <tbody>{x.materials.map(m => (
                <tr key={m.material_id} onMouseEnter={() => setHl(m.material_id)} onMouseLeave={() => setHl(null)} className={hl === m.material_id ? "on" : ""}>
                  <td><b>{m.material_name}</b><div className="muted">{m.material_id} · {m.category}</div></td>
                  <td><span className="pill" style={{ background: ST[m.status][1], color: "var(--on-accent)" }}>{ST[m.status][0]}</span></td>
                  <td style={{ minWidth: 120 }}><div className="pt-cover"><i style={{ width: `${Math.min(100, ((m.days_cover || 0) / (x.thresholds.watch * 2)) * 100)}%`, background: ST[m.status][1] }} />
                    <em style={{ left: `${(x.thresholds.critical / (x.thresholds.watch * 2)) * 100}%` }} /><em style={{ left: "50%" }} /></div>
                    <span>{m.days_cover == null ? "no usage" : `${fmt(m.days_cover, 1)} d`}</span></td>
                  <td className="num">{fmt(m.usable, 0)}{m.below_safety && <div className="delta bad">below safety</div>}</td>
                  <td className="num">{fmt(m.safety, 0)}</td><td className="num">{fmt(m.daily_usage, 0)}</td>
                  <td>{m.next_arrival ? <button className="ghost chip-btn" onClick={() => onPickShipment(m.next_arrival.id)}>
                    in {fmt(m.next_arrival.eta_days, 1)} d{m.next_arrival.late ? " · late" : ""}</button> : <span className="muted">none open</span>}
                    {m.runs_out_before_next_arrival && <div className="delta bad">runs out first</div>}</td>
                  <td>{m.lines.join(", ")}</td>
                  <td style={{ whiteSpace: "nowrap" }}><Src kind="stock" label={`Stock ${m.material_id}`} opts={{ material_id: m.material_id }} />
                    <Src kind="usage" label={`Daily usage ${m.material_id}`} opts={{ material_id: m.material_id }} />
                    <Src kind="orders" label={`Open orders using ${m.material_id}`} opts={{ material_id: m.material_id }} /></td>
                </tr>))}</tbody>
            </table></div>
          </div>
          <div className="pt-side">
            <div className="card pt-card"><h3>Line exposure <span className="muted">if a shipment is late</span></h3>
              {x.lines.map(l => (
                <div key={l.line_id} className="pt-exp" style={{ "--c": ST[l.status]?.[1] || "var(--chart-c4)" }}>
                  <div className="row-flex" style={{ justifyContent: "space-between" }}><b>{l.line_id} · {l.line_type}</b>
                    <span className="pill" style={{ background: "var(--c)", color: "var(--on-accent)" }}>{ST[l.status]?.[0] || "OK"}</span></div>
                  {l.exposed_materials.length ? <div className="muted">Short: {l.exposed_materials.map(id => mat[id]?.material_name || id).join(", ")}</div> : <div className="muted">All consumed materials covered.</div>}
                  <div className="muted">{l.open_prod_orders} open production orders · {l.customer_orders} customer orders · NO_MATERIAL {fmt(l.no_material_hours_30d, 1)} h in 30 d
                    <Src kind="downtime" label={`Downtime ${l.line_id}`} opts={{ line_id: l.line_id }} /></div>
                </div>))}
            </div>
            <div className="card pt-card"><h3>Arriving in 72 h <span className="muted">{x.position_note}</span></h3>
              <div className="nt-drill-list" style={{ maxHeight: 300 }}>{x.inbound.map(i => (
                <button key={i.id} className={`nt-row ${hl && i.material_id !== hl ? "dim" : ""}`} onClick={() => onPickShipment(i.id)}>
                  <span className="grow ellipsis"><b>{i.po_id}</b> · {i.material_name} · {i.supplier_id}</span>
                  <span className="pill" style={{ background: ST[i.status]?.[1] || "var(--chart-c4)", color: "var(--on-accent)" }}>{ST[i.status]?.[0] || "On time"}</span>
                  <span className="muted">in {fmt(i.days_ahead, 0)} d{i.line_stop_risk ? " · line stop risk" : ""}</span></button>))}
                {!x.inbound.length && <div className="muted">Nothing due in the next 72 h.</div>}</div>
            </div>
          </div>
        </div>
        <div className="muted pt-foot">{x.assumptions.join(" · ")}{x.run_id ? ` · run ${String(x.run_id).slice(0, 8)}` : ""}</div>
      </>}
    </div>
  );
}

export { shipmentSourceRequest };
