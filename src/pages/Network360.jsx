import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Bot, Calendar, CheckCircle2, Compass, Factory, FlaskConical, Gauge, Handshake, Home, Minus, Moon, Pause, Play, Plus, RotateCcw, RotateCw, Route,
  Ship, ShieldCheck, Sparkles, Sun, TriangleAlert, Truck, X, Network as NetIcon, ScanEye, Layers3 } from "lucide-react";
import { api } from "../api";
import { Sparkline } from "../components/ui";
import { fmt, inr, pct, useLoad } from "../util";

const Scene = lazy(() => import("../components/Network360Scene"));

/* Supplier Network 360: premium digital-twin view (diorama) with KPI header, filters, supplier panel and timeline. */
const DAY_MS = 86400000;
const dateOf = (start, t) => new Date(new Date(start).getTime() + t * DAY_MS);
const fmtDate = d => d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
const STATUS = { HEALTHY: { label: "Healthy", c: "var(--chart-c4)" }, WATCH: { label: "Watch", c: "var(--brand-orange)" }, RISK: { label: "At risk", c: "var(--depth-0)" } };
export const statusFromRisk = r => (r == null ? "WATCH" : r >= 55 ? "RISK" : r >= 45 ? "WATCH" : "HEALTHY");
const WINDOWS = [["1D", 1], ["1W", 7], ["1M", 30], ["3M", 90]];

function Kpi({ icon: I, value, label, delta, good = "up", series, color }) {
  const better = delta == null ? null : good === "up" ? delta > 0 : delta < 0;
  return (
    <div className="n3-kpi">
      <span className="n3-kpi-ic" style={{ color }}><I size={22} /></span>
      <div className="n3-kpi-txt"><b>{value}</b><span>{label}</span></div>
      <div className="n3-kpi-r">
        {delta != null && <em className={better ? "good" : "bad"}>{delta > 0 ? "▲" : "▼"} {fmt(Math.abs(delta), 1)}</em>}
        {series && <Sparkline data={series} color={color} width={70} height={24} />}
      </div>
    </div>
  );
}

export default function Network360({ theme, toggleTheme, openSupplier, ask, nav }) {
  const trk = useLoad(() => api.tracker({}), []);
  const bs = useLoad(() => api.bootstrap({}), []);
  const mats = useLoad(() => api.materials(), []);
  const data = trk.data, cards = bs.data?.scorecard, ov = bs.data?.overview, pulse = bs.data?.pulse, alerts = bs.data?.alerts || [];
  const statusOf = useMemo(() => {
    const m = Object.fromEntries((cards || []).map(c => [c.supplier_id, statusFromRisk(c.risk_score)]));
    return id => m[id] || "WATCH";
  }, [cards]);
  const catOf = useMemo(() => Object.fromEntries((mats.data || []).map(m => [m.material_id, m.material_category])), [mats.data]);
  const categories = useMemo(() => [...new Set((mats.data || []).map(m => m.material_category))].sort(), [mats.data]);

  const [status, setStatus] = useState(new Set(["HEALTHY", "WATCH", "RISK"]));
  const [plant, setPlant] = useState("");
  const [road, setRoad] = useState(true), [sea, setSea] = useState(true);
  const [category, setCategory] = useState("");
  const filters = useMemo(() => ({ status, plant, road, sea, category, catOf }), [status, plant, road, sea, category, catOf]);
  const resetFilters = () => { setStatus(new Set(["HEALTHY", "WATCH", "RISK"])); setPlant(""); setRoad(true); setSea(true); setCategory(""); };

  const [selected, setSelected] = useState(null);
  const [tab, setTab] = useState("overview");
  const [panelOpen, setPanelOpen] = useState(true);
  const [ship, setShip] = useState(null);
  const sceneApi = useRef(null);

  // timeline: replay a window that ends at the as-of date
  const [win, setWin] = useState(7);
  const simDay = useRef(0);
  const [day, setDay] = useState(0);
  const [playing, setPlaying] = useState(true);
  const playRef = useRef(playing); playRef.current = playing;
  const winRef = useRef(win); winRef.current = win;
  useEffect(() => { if (data) { simDay.current = data.t_as_of - win; setDay(simDay.current); } }, [data, win]);
  useEffect(() => {
    let raf, last = performance.now(), acc = 0;
    const loop = now => {
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      if (data && playRef.current) {
        const w = winRef.current, start = data.t_as_of - w;
        simDay.current += dt * Math.max(0.12, w / 24);            // a window replays in about 24 s, then loops
        if (simDay.current > data.t_as_of) simDay.current = start;
      }
      acc += dt; if (acc > 0.25) { acc = 0; setDay(simDay.current); }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [data]);

  const inbound = useMemo(() => {
    const o = { port: 0 };
    if (!data) return o;
    const lanes = Object.fromEntries(data.lanes.map(l => [l.id, l]));
    for (const s of data.shipments) if (day >= s.t_depart && day < s.t_eta) {
      o[s.plant_id] = (o[s.plant_id] || 0) + 1;
      if (lanes[s.lane]?.mode === "SEA" && (day - s.t_depart) / (s.t_eta - s.t_depart) < 0.85) o.port++;
    }
    return o;
  }, [data, Math.floor(day * 4)]); // eslint-disable-line

  const counts = useMemo(() => {
    const c = { HEALTHY: 0, WATCH: 0, RISK: 0 };
    (cards || []).forEach(x => c[statusOf(x.supplier_id)]++);
    return c;
  }, [cards, statusOf]);

  // default selection: the riskiest supplier
  useEffect(() => { if (cards && !selected) setSelected([...cards].sort((a, b) => b.risk_score - a.risk_score)[0]?.supplier_id); }, [cards]); // eslint-disable-line
  const sc = cards?.find(c => c.supplier_id === selected);
  const st = sc ? statusFromRisk(sc.risk_score) : null;
  const supAlerts = alerts.filter(a => a.supplier_id === selected);
  const lanes = (data?.lanes || []).filter(l => l.supplier_id === selected);
  const trend = useLoad(() => (selected ? api.trends({ supplier_id: selected, grain: "week" }) : Promise.resolve([])), [selected]);
  const insight = useMemo(() => {
    if (!sc) return "";
    const top = supAlerts.slice(0, 2).map(a => a.title.toLowerCase());
    if (st === "HEALTHY") return `${sc.supplier_name} is among the more reliable suppliers (risk ${fmt(sc.risk_score, 0)}/100). Keep monitoring${top.length ? `; watch: ${top.join(", ")}` : ""}.`;
    if (st === "WATCH") return `${sc.supplier_name} needs attention: OTIF ${pct(sc.otif_pct)}, ${fmt(sc.overdue_capa, 0)} overdue CAPA${top.length ? `; ${top.join(", ")}` : ""}. Agree a recovery plan.`;
    return `${sc.supplier_name} is a priority risk: OTIF ${pct(sc.otif_pct)}, ${sc.past_due_lines} PO lines past due, ${fmt(sc.overdue_capa, 0)} overdue CAPA. Raise a corrective action and test a dual-source scenario in the twin.`;
  }, [sc, st, supAlerts]);

  const shipObj = ship && data?.shipments.find(s => s.id === ship);
  const selectSupplier = id => { setSelected(id); setPanelOpen(true); setTab("overview"); sceneApi.current?.focus(id); };
  const windowStart = data ? data.t_as_of - win : 0;
  const toggle = k => setStatus(s => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });

  return (
    <div className="n3">
      {/* ---------------- 3D scene ---------------- */}
      <div className="n3-stage">
        {data && cards
          ? <Suspense fallback={<div className="n3-loading">Building the 3D network…</div>}>
              <Scene ref={sceneApi} data={data} cards={cards} theme={theme} simDayRef={simDay} filters={filters} statusOf={statusOf}
                selected={selected} onSelectSupplier={selectSupplier} onPickShipment={id => { setShip(id); const s = data.shipments.find(x => x.id === id); if (s) { setSelected(s.supplier_id); setPanelOpen(true); } }} inbound={inbound} />
            </Suspense>
          : <div className="n3-loading">{trk.err || bs.err || "Loading the supplier network…"}</div>}
      </div>

      {/* ---------------- header ---------------- */}
      <div className="n3-head">
        <div className="n3-brand"><span className="n3-logo"><Layers3 size={20} /></span><div><b>Supplier Network 360</b><span>Supplier Performance Digital Twin</span></div></div>
        <div className="n3-tabs">
          <button className="on"><NetIcon size={14} /> Network View</button>
          <button onClick={() => nav("command")}><Gauge size={14} /> Performance</button>
          <button onClick={() => nav("risk")}><ScanEye size={14} /> Risk Intelligence</button>
          <button onClick={() => nav("twin")}><FlaskConical size={14} /> Simulation</button>
          <button onClick={() => ask("Give me a network briefing: which suppliers and lanes need attention this week, and what should procurement do first?")}><Bot size={14} /> AI Copilot</button>
        </div>
        <div className="n3-upd"><Calendar size={16} /><div><span>Network date</span><b>{data ? fmtDate(dateOf(data.start, day)) : "–"}</b></div></div>
        <button className="n3-icon" onClick={toggleTheme} title={theme === "dark" ? "Day view" : "Night view"}>{theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}</button>
      </div>

      {/* ---------------- KPIs ---------------- */}
      <div className="n3-kpis">
        <Kpi icon={Handshake} value={pct(ov?.otif_pct)} label="Network OTIF" delta={pulse?.otif_pct?.delta} series={pulse?.otif_pct?.series} color="var(--chart-c1)" />
        <Kpi icon={ShieldCheck} value={pct(ov?.quality_acceptance_pct)} label="Quality acceptance" delta={pulse?.incoming_ppm?.delta == null ? null : -pulse.incoming_ppm.delta / 100} series={pulse?.incoming_ppm?.series?.map(x => ({ ...x, v: x.v == null ? null : -x.v }))} color="var(--chart-c4)" />
        <Kpi icon={Factory} value={pct(ov?.fill_rate_pct)} label="Plant fulfilment" color="var(--depth-1)" />
        <Kpi icon={TriangleAlert} value={counts.RISK} label="At-risk suppliers" color="var(--depth-0)" />
      </div>

      {/* ---------------- filters ---------------- */}
      <aside className="n3-filters n3-glass">
        <h4>Filters</h4>
        <div className="n3-sub">Supplier status</div>
        {Object.entries(STATUS).map(([k, v]) => (
          <label key={k} className="n3-row"><input type="checkbox" checked={status.has(k)} onChange={() => toggle(k)} />
            <i style={{ background: v.c }} />{v.label}<em>{counts[k]}</em></label>))}
        <div className="n3-sub">Plant</div>
        <select value={plant} onChange={e => setPlant(e.target.value)}><option value="">All plants</option><option value="IN-TN-01">Chennai (IN-TN-01)</option><option value="IN-KA-01">Bengaluru (IN-KA-01)</option></select>
        <div className="n3-sub">Transport mode</div>
        <label className="n3-row"><Truck size={15} /> Road<input type="checkbox" checked={road} onChange={e => setRoad(e.target.checked)} /></label>
        <label className="n3-row"><Ship size={15} /> Sea<input type="checkbox" checked={sea} onChange={e => setSea(e.target.checked)} /></label>
        <div className="n3-sub">Material category</div>
        <select value={category} onChange={e => setCategory(e.target.value)}><option value="">All</option>{categories.map(c => <option key={c}>{c}</option>)}</select>
        <button className="n3-reset" onClick={resetFilters}><RotateCcw size={13} /> Reset filters</button>
      </aside>

      {/* ---------------- supplier panel ---------------- */}
      {sc && panelOpen && (
        <aside className="n3-panel n3-glass">
          <div className="n3-p-head">
            <i style={{ background: STATUS[st].c }} />
            <div><b>{sc.supplier_name}</b><span>{sc.supplier_id} · {sc.material_category} · {sc.country}</span></div>
            <button className="n3-icon sm" onClick={() => setPanelOpen(false)}><X size={14} /></button>
          </div>
          <div className="n3-p-tabs">{[["overview", "Overview"], ["performance", "Performance"], ["insights", "Insights"]].map(([k, l]) => (
            <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{l}</button>))}</div>

          {tab === "overview" && <>
            <div className="n3-metric"><span>On-time delivery (OTIF)</span><b>{pct(sc.otif_pct)}</b>
              <div className="n3-bar"><i style={{ width: `${sc.otif_pct || 0}%`, background: "var(--chart-c1)" }} /></div></div>
            <div className="n3-metric"><span>Quality score</span><b>{fmt(sc.scores.quality, 0)}<small>/100 · PPM {fmt(sc.incoming_ppm, 0)}</small></b>
              <div className="n3-bar"><i style={{ width: `${sc.scores.quality || 0}%`, background: "var(--chart-c4)" }} /></div></div>
            <div className="n3-metric row"><div><span>Supplier risk score</span><b>{fmt(sc.risk_score, 0)}<small> / 100</small></b></div>
              <em className="n3-pill" style={{ background: STATUS[st].c }}>{STATUS[st].label}</em></div>
            <div className="n3-facts">
              <div><Factory size={14} /><span>Connected plants</span><b>{[...new Set(lanes.map(l => l.plant_id === "IN-TN-01" ? "Chennai" : "Bengaluru"))].join(", ") || "–"}</b></div>
              <div><Route size={14} /><span>Delivery routes</span><b>{lanes.map(l => `${l.mode === "SEA" ? "Sea" : "Road"} ${fmt(l.distance_km, 0)} km`).join(" · ")}</b></div>
              <div><Truck size={14} /><span>Avg transit · on-time</span><b>{fmt(lanes[0]?.transit_days, 1)} d · {fmt(lanes[0]?.on_time_pct, 0)}%</b></div>
              <div><Gauge size={14} /><span>Grade · spend</span><b>{sc.grade} ({fmt(sc.composite_score)}) · {inr(sc.spend_inr)}</b></div>
            </div>
          </>}

          {tab === "performance" && <>
            <div className="n3-spark"><span>Weekly OTIF %</span><Sparkline data={(trend.data || []).filter(t => t.lines).map(t => ({ v: t.otif_pct }))} color="var(--chart-c1)" width={250} height={46} /></div>
            <div className="n3-spark"><span>Weekly attributed defects</span><Sparkline data={(trend.data || []).map(t => ({ v: t.defects }))} color="var(--depth-0)" width={250} height={46} /></div>
            <div className="n3-grid">
              {[["In-full", pct(sc.in_full_pct)], ["Lead-time var.", `${fmt(sc.avg_lead_time_variance_days)} d`], ["Open NCR", fmt(sc.open_ncr)], ["Overdue CAPA", fmt(sc.overdue_capa)],
                ["Price var.", pct(sc.price_variance_pct)], ["Disruption", `${fmt(sc.disruption_hours)} h`]].map(([k, v]) => <div key={k}><span>{k}</span><b>{v}</b></div>)}
            </div>
          </>}

          {tab === "insights" && (
            <div className="n3-alerts">
              {supAlerts.length === 0 && <div className="n3-muted"><CheckCircle2 size={14} /> No active risk alerts.</div>}
              {supAlerts.slice(0, 6).map(a => (
                <div key={a.id} className="n3-alert"><i style={{ background: a.severity === "CRITICAL" || a.severity === "HIGH" ? "var(--depth-0)" : "var(--brand-orange)" }} />
                  <div><b>{a.title}</b><span>{a.recommended_action}</span></div></div>))}
            </div>)}

          <div className="n3-ai">
            <div className="n3-ai-h"><Sparkles size={14} /> AI insight</div>
            <p>{insight}</p>
            <div className="row-flex">
              <button className="n3-btn" onClick={() => ask(`Analyse ${sc.supplier_name} (${sc.supplier_id}) and recommend corrective actions with the expected impact.`)}><Bot size={13} /> Ask Copilot</button>
              <button className="n3-btn ghost" onClick={() => openSupplier(sc.supplier_id)}>Full scorecard</button>
            </div>
          </div>
          {shipObj && (
            <div className="n3-ship">
              <div><Ship size={13} /> <b>{shipObj.po_id}</b> · {data.materials[shipObj.material_id]}</div>
              <span>{fmt(shipObj.qty, 0)} units · ETA {fmtDate(dateOf(data.start, shipObj.t_eta))} · {shipObj.t_eta > shipObj.t_promised ? `${Math.round(shipObj.t_eta - shipObj.t_promised)} d late` : "on time"}</span>
            </div>)}
        </aside>)}

      {/* ---------------- camera pad, compass, legend, timeline ---------------- */}
      <div className="n3-pad n3-glass">
        <button title="Zoom in" onClick={() => sceneApi.current?.zoom(0.75)}><Plus size={15} /></button>
        <button title="Zoom out" onClick={() => sceneApi.current?.zoom(1.33)}><Minus size={15} /></button>
        <button title="Rotate left" onClick={() => sceneApi.current?.rotate(-35)}><RotateCcw size={14} /></button>
        <button title="Rotate right" onClick={() => sceneApi.current?.rotate(35)}><RotateCw size={14} /></button>
        <button title="Top view" className="txt" onClick={() => sceneApi.current?.top()}>Top</button>
        <button title="3D view" className="txt" onClick={() => sceneApi.current?.tilt()}>3D</button>
        <button title="Home view" onClick={() => sceneApi.current?.home()}><Home size={14} /></button>
      </div>
      <div className="n3-compass n3-glass"><Compass size={18} /><b>N</b></div>
      <div className="n3-legend n3-glass">
        {Object.values(STATUS).map(v => <span key={v.label}><i style={{ background: v.c }} />{v.label}</span>)}
        <span className="sep" /><span><em className="road" />Road route</span><span><em className="sea" />Sea route</span>
        <span className="sep" /><span><Ship size={14} /> Ship</span><span><Truck size={14} /> Truck</span>
      </div>
      <div className="n3-time n3-glass">
        <button className="n3-play" onClick={() => setPlaying(p => !p)} title={playing ? "Pause" : "Play"}>{playing ? <Pause size={15} /> : <Play size={15} />}</button>
        <input type="range" min={windowStart} max={data?.t_as_of || 1} step={0.05} value={Math.min(day, data?.t_as_of || 1)}
          onChange={e => { setPlaying(false); simDay.current = Number(e.target.value); setDay(simDay.current); }} />
        {WINDOWS.map(([l, n]) => <button key={l} className={`n3-win ${win === n ? "on" : ""}`} onClick={() => setWin(n)}>{l}</button>)}
      </div>
    </div>
  );
}
