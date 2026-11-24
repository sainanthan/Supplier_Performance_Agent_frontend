import { useEffect, useState } from "react";
import { Activity, CheckCircle2, CircleAlert, Cpu, Database, Filter, Plus, Scale, SlidersHorizontal, Timer, ToggleRight, X } from "lucide-react";
import { api } from "../api";
import { viewFor } from "../roles";
import { useLoad } from "../util";
import { PageHead } from "../components/ui";

/* Settings as minimal cards. Each role sees only its sections (roles.js `settings`); the backend enforces the same. */
const KEYS = ["delivery", "quality", "responsiveness", "commercial"];
const KEY_RULES = [["ppm_target", "PPM target"], ["ppm_ceiling", "PPM ceiling"], ["grade_bands.A", "Grade A ≥"], ["grade_bands.B", "Grade B ≥"],
  ["grade_bands.C", "Grade C ≥"], ["trend_window_days", "Trend window (d)"]];
const ALL_RULES = [
  ["in_full_tolerance_pct", "In-full under-tolerance %"], ["over_delivery_tolerance_pct", "Over-delivery tolerance %"],
  ["early_window_days", "Early window (d, blank = none)"], ["lead_time_tolerance_days", "Lead-time tolerance (working d)"],
  ["health_bands.watch", "Watch at risk score ≥"], ["health_bands.risk", "At risk at risk score ≥"],
  ["risk_score.composite_factor", "Risk × (100 − composite)"], ["risk_score.tier_points.HIGH", "High-tier points"],
  ["risk_score.tier_points.MEDIUM", "Medium-tier points"], ["risk_score.capa_points_each", "Points per overdue CAPA"],
  ["risk_score.capa_points_cap", "CAPA points cap"], ["risk_score.disruption_points_cap", "Disruption points cap"],
  ["otif_drop_alert_pts", "OTIF drop alert (pts)"], ["ppm_rise_alert_pct", "Defect-rate rise alert %"], ["concentration_share_pct", "Concentration share %"],
  ["repeat_defect_min_weight", "Repeat-defect min weight"], ["trend_min_lines", "Min lines per period"], ["trend_min_received_units", "Min received units"],
  ["trend_alpha", "Significance level (α)"], ["recommendation_thresholds.otif_floor_pct", "Rec.: OTIF floor %"],
  ["recommendation_thresholds.lead_time_var_days", "Rec.: lead-time var (d)"], ["recommendation_thresholds.ppm", "Rec.: PPM"],
  ["recommendation_thresholds.price_var_pct", "Rec.: price var %"], ["recommendation_thresholds.disruption_hours", "Rec.: disruption h"],
  ["schedule_minutes", "Scheduler interval (min)"], ["notify_dedupe_days", "Alert de-dupe (d)"], ["lane_at_risk_buffer_days", "Lane at-risk buffer (d)"],
  ["plant_cover_critical_days", "Plant cover critical (d)"], ["plant_cover_watch_days", "Plant cover watch (d)"], ["gps_retention_days", "GPS retention (d)"],
];
const NUMERIC = ["in_full_tolerance_pct", "over_delivery_tolerance_pct", "lead_time_tolerance_days", "ppm_target", "ppm_ceiling", "trend_window_days",
  "otif_drop_alert_pts", "ppm_rise_alert_pct", "concentration_share_pct", "repeat_defect_min_weight", "trend_min_lines", "trend_min_received_units",
  "trend_alpha", "schedule_minutes", "notify_dedupe_days", "lane_at_risk_buffer_days", "plant_cover_critical_days", "plant_cover_watch_days", "gps_retention_days"];
const get = (o, path) => path.split(".").reduce((x, k) => (x == null ? x : x[k]), o);
const set = (o, path, v) => { const c = structuredClone(o); const ks = path.split("."); let x = c; ks.slice(0, -1).forEach(k => { x[k] = x[k] ?? {}; x = x[k]; }); x[ks.at(-1)] = v; return c; };
const when = t => t?.slice(0, 16).replace("T", " ");
const human = k => k.replaceAll("_", " ").replace(/^di /, "DI ").replace(/^./, c => c.toUpperCase());

function SCard({ icon: Icon, title, meta, wide, children, action, k }) {
  return (
    <section className={"set-card" + (wide ? " wide" : "") + (k ? ` k-${k}` : "")}>
      <header><span className="set-ico"><Icon size={15} /></span><b>{title}</b>{meta && <span className="set-meta">{meta}</span>}{action}</header>
      <div className="set-body">{children}</div>
    </section>
  );
}

export default function Settings({ user, reloadFeatures, features }) {
  const admin = user?.role === "ADMIN";
  const view = viewFor(user?.role);
  const can = k => view.settings.includes(k);
  const cfg = useLoad(() => api.config(), []);
  const versions = useLoad(() => (can("defs") ? api.configVersions().catch(() => []) : Promise.resolve([])), [cfg.data]);
  const flags = useLoad(() => (can("flags") ? api.features().catch(() => null) : Promise.resolve(null)), []);
  const ex = useLoad(() => (can("excl") ? api.exclusions().catch(() => []) : Promise.resolve([])), []);
  const health = useLoad(() => (can("sys") ? api.health() : Promise.resolve(null)), []);
  const usage = useLoad(() => (can("sys") ? api.aiUsage().catch(() => null) : Promise.resolve(null)), []);
  const runs = useLoad(() => (can("gov") ? api.runs().catch(() => []) : Promise.resolve([])), []);
  const dq = useLoad(() => (can("gov") ? api.dq().catch(() => []) : Promise.resolve([])), []);
  const ready = useLoad(() => (can("gov") ? api.dataReadiness().catch(() => null) : Promise.resolve(null)), []);
  const recon = useLoad(() => (can("gov") ? api.recon().catch(() => []) : Promise.resolve([])), []);
  const jobs = useLoad(() => (can("jobs") ? api.jobs().catch(() => null) : Promise.resolve(null)), []);
  const [draft, setDraft] = useState(null);
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState("");
  const [allRules, setAllRules] = useState(false);
  const [addEx, setAddEx] = useState(false);
  const [tabSel, setTabSel] = useState(() => { try { return localStorage.getItem("settings.tab") || "kpi"; } catch { return "kpi"; } });
  const [nx, setNx] = useState({ entity_type: "PO_LINE", po_id: "", po_line: 1, entity_id: "", reason: "" });

  useEffect(() => { if (cfg.data) setDraft({ ...cfg.data, weights: Object.fromEntries(KEYS.map(k => [k, Math.round(cfg.data.weights[k] * 100)])) }); }, [cfg.data]);
  const total = draft ? KEYS.reduce((s, k) => s + Number(draft.weights[k]), 0) : 0;
  const flash = m => { setMsg(m); setTimeout(() => setMsg(""), 4000); };
  const num = v => (v === "" || v === null || v === undefined ? null : Number(v));
  const save = async () => {
    try {
      const c = draft;
      await api.saveConfig({
        weights: Object.fromEntries(KEYS.map(k => [k, c.weights[k] / 100])), note, ...Object.fromEntries(NUMERIC.map(k => [k, num(c[k])])),
        early_window_days: num(c.early_window_days), clear_early_window: num(c.early_window_days) === null,
        grade_bands: c.grade_bands, health_bands: c.health_bands, risk_score: c.risk_score, recommendation_thresholds: c.recommendation_thresholds,
      });
      setNote(""); cfg.reload(); flash("Saved as a new version. Scores are recalculating.");
    } catch (e) { flash(e.message); }
  };
  const toggle = (k, on) => api.setFeature(k, on).then(() => { flags.reload(); reloadFeatures?.(); }).catch(e => flash(e.message));
  const addExclusion = async () => {
    try { await api.addExclusion({ ...nx, po_line: Number(nx.po_line) }); setNx({ ...nx, po_id: "", entity_id: "", reason: "" }); setAddEx(false); ex.reload(); flash("Exclusion recorded."); }
    catch (e) { flash(e.message); }
  };
  const revoke = e => { const r = prompt("Reason for revoking this exclusion:"); if (r) api.revokeExclusion(e.id, r).then(ex.reload).catch(x => flash(x.message)); };
  const runJob = j => api.runJob(j).then(r => { flash(`Job ${j}: ${r.status}`); jobs.reload(); }).catch(e => flash(e.message));
  const doRecon = () => api.runRecon().then(r => { flash(`Reconciliation: ${r.checks} checks, ${r.failed} failed`); recon.reload(); }).catch(e => flash(e.message));

  const v0 = versions.data?.[0];
  const activeEx = (ex.data || []).filter(e => !e.revoked_at);
  const dqLatest = (dq.data || []).filter(r => r.load_id === dq.data?.[0]?.load_id);
  const dqCount = s => dqLatest.filter(r => r.severity === s).length;
  const failed = (recon.data || []).filter(r => !r.passed).length;
  const lastJobs = Object.values((jobs.data?.runs || []).reduce((m, j) => (m[j.job] ? m : { ...m, [j.job]: j }), {}));
  const h = health.data, u = usage.data?.totals;
  const flagList = flags.data?.detail || [];
  const TABS = [["kpi", "Scorecard, KPIs & features", can("defs") || can("excl") || can("flags")],
    ["data", "Data & jobs", can("gov") || can("jobs") || can("sys")]].filter(t => t[2]);
  const tab = TABS.some(t => t[0] === tabSel) ? tabSel : TABS[0]?.[0];
  const pickTab = k => { setTabSel(k); try { localStorage.setItem("settings.tab", k); } catch { /* storage unavailable */ } };

  return (
    <>
      <PageHead eyebrow={admin ? "Admin" : view.workspace} title="Settings"
        sub={admin ? "KPI definitions, features and system health." : "How KPIs are calculated" + (can("excl") ? ", and the exclusions you can record." : ".")} />
      {msg && <div className="set-flash">{msg}</div>}
      {TABS.length > 1 && <div className="set-tabs" role="tablist" aria-label="Settings sections">
        {TABS.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => pickTab(k)}>{l}</button>)}</div>}
      <div className={"set-grid t-" + tab}>
        {tab === "kpi" && can("defs") && draft && <SCard icon={Scale} title="Scorecard weights" k="weights" meta={v0 ? `v${v0.id} · ${v0.approved_by} · ${v0.created_at?.slice(0, 10)}` : `v${cfg.data?._version}`}>
          {KEYS.map(k => (
            <div key={k} className="set-w">
              <span>{k}</span>
              <input type="range" min="0" max="100" disabled={!admin} value={draft.weights[k]} aria-label={`${k} weight`}
                onChange={e => setDraft(set(draft, `weights.${k}`, Number(e.target.value)))} />
              <b>{draft.weights[k]}%</b>
            </div>))}
          {admin && <div className="set-save">
            <input placeholder="Change note (who agreed, why)" value={note} onChange={e => setNote(e.target.value)} aria-label="Change note" />
            <button className="primary chip-btn" disabled={total !== 100 || note.trim().length < 5} onClick={save}>Save</button>
            <span className={total === 100 ? "ok" : "bad"}>{total}%</span>
          </div>}
        </SCard>}

        {tab === "kpi" && can("defs") && draft && <SCard icon={SlidersHorizontal} title="KPI rules" k="rules" wide={allRules}
          action={<button className="ghost chip-btn" onClick={() => setAllRules(v => !v)}>{allRules ? "Fewer" : admin ? "Edit all" : "Show all"}</button>}>
          <div className={"set-kv" + (allRules ? " many" : "")}>
            {(allRules ? [...KEY_RULES, ...ALL_RULES] : KEY_RULES).map(([path, label]) => (
              <label key={path}><span>{label}</span>
                <input type="number" step="any" disabled={!admin} value={get(draft, path) ?? ""}
                  onChange={e => setDraft(set(draft, path, e.target.value === "" ? null : Number(e.target.value)))} /></label>))}
          </div>
          {admin && allRules && <div className="set-hint">Changes are saved with the weights (add a change note there).</div>}
        </SCard>}

        {tab === "kpi" && can("excl") && <SCard icon={Filter} title="KPI exclusions" k="excl" meta={`${activeEx.length} active`}
          action={user?.role !== "VIEWER" && <button className="ghost chip-btn row-flex" onClick={() => setAddEx(v => !v)}>{addEx ? <X size={12} /> : <Plus size={12} />} {addEx ? "Cancel" : "Add"}</button>}>
          {addEx && <div className="set-form">
            <select value={nx.entity_type} onChange={e => setNx({ ...nx, entity_type: e.target.value })} aria-label="Exclusion type">
              <option value="PO_LINE">PO line</option><option value="INSPECTION">Inspection</option><option value="NCR">NCR</option></select>
            {nx.entity_type === "PO_LINE"
              ? <><input placeholder="PO id" value={nx.po_id} onChange={e => setNx({ ...nx, po_id: e.target.value })} aria-label="PO id" />
                  <input type="number" value={nx.po_line} onChange={e => setNx({ ...nx, po_line: e.target.value })} aria-label="PO line" style={{ width: 64 }} /></>
              : <input placeholder={nx.entity_type === "NCR" ? "NCR-00001" : "QI-00000001"} value={nx.entity_id} onChange={e => setNx({ ...nx, entity_id: e.target.value })} aria-label="Entity id" />}
            <input placeholder="Reason (evidence)" value={nx.reason} onChange={e => setNx({ ...nx, reason: e.target.value })} aria-label="Reason" className="grow" />
            <button className="primary chip-btn" disabled={(nx.entity_type === "PO_LINE" ? !nx.po_id : !nx.entity_id) || nx.reason.length < 5} onClick={addExclusion}>Record</button>
          </div>}
          {activeEx.slice(0, 5).map(e => (
            <div key={e.id} className="set-row">
              <b>{e.entity_type === "PO_LINE" ? `${e.po_id}/${e.po_line}` : e.entity_id}</b><span className="grow ellipsis" title={e.reason}>{e.reason}</span>
              {user?.role !== "VIEWER" && <button className="ghost chip-btn" onClick={() => revoke(e)}>Revoke</button>}
            </div>))}
          {!activeEx.length && !addEx && <div className="set-hint">No exclusions. Every record counts in the KPIs.</div>}
        </SCard>}

        {tab === "kpi" && can("flags") && <SCard icon={ToggleRight} title="Features" k="flags" meta={`${flagList.filter(f => f.enabled).length} of ${flagList.length} on`}>
          <div className="set-flags">
            {flagList.map(f => (
              <label key={f.key} className="set-flag" title={f.description}>
                <span className="ellipsis">{human(f.key)}</span>
                <button role="switch" aria-checked={f.enabled} aria-label={human(f.key)} disabled={!admin} className={"sw" + (f.enabled ? " on" : "")} onClick={() => toggle(f.key, !f.enabled)}><i /></button>
              </label>))}
          </div>
        </SCard>}

        {tab === "data" && can("gov") && <SCard icon={Activity} title="Data health" k="health" action={admin && <button className="ghost chip-btn" onClick={doRecon}>Reconcile</button>}>
          <div className="set-stats">
            <div><span>Reconciliation</span><b className={failed ? "bad" : "ok"}>{(recon.data || []).length - failed}/{(recon.data || []).length}</b><em>checks match</em></div>
            <div><span>Data quality</span><b className={dqCount("ERROR") ? "bad" : "ok"}>{dqCount("PASS") + dqCount("OK")}/{dqLatest.length}</b><em>{dqCount("WARN")} warn · {dqCount("ERROR")} error</em></div>
            <div><span>Last calculation</span><b>{when(runs.data?.[0]?.created_at)?.slice(5) || "–"}</b><em>config v{runs.data?.[0]?.config_version ?? "–"}</em></div>
          </div>
        </SCard>}

        {tab === "data" && can("gov") && ready.data && <SCard icon={Database} title="Required data" k="req" meta={`${ready.data.ready} of ${ready.data.total} sources loaded`}>
          {ready.data.sources.map(x => (
            <div key={x.table} className="set-row" title={`${x.table} · unlocks: ${x.unlocks}`}>
              {x.ready ? <CheckCircle2 size={14} className="ok-ic" /> : <CircleAlert size={14} className="warn-ic" />}
              <span className="grow set-name"><b className="ellipsis">{x.source}{x.demo && <span className="set-demo">demo</span>}</b>
                {x.table.startsWith("sp.fact_") && x.ready && <em className="set-loaded" title="When this table was last loaded">{x.last_loaded
                  ? `Loaded ${new Date(x.last_loaded).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}`
                  : "Load date not recorded (reload to stamp it)"}</em>}</span>
              <span className={x.ready ? "muted" : "warn-t"}>{x.rows == null ? "–" : x.ready ? `${Number(x.rows).toLocaleString("en-IN")} rows` : "not loaded"}</span>
            </div>))}
          <div className="set-hint">Missing extracts: fill the CSV template in <code>backend/data/templates/</code>, save it to <code>backend/data/data/</code>, then run <code>python -m scripts.load_data --only &lt;table&gt;</code>. Every load stamps the date shown here.</div>
        </SCard>}

        {tab === "data" && can("jobs") && <SCard icon={Timer} title="Scheduled jobs" k="jobs" meta={`every ${jobs.data?.schedule_minutes ?? "–"} min`}>
          {lastJobs.map(j => (
            <div key={j.job} className="set-row">
              <b>{j.job}</b><span className={`pill ${j.status === "OK" ? "sev-LOW" : j.status === "FAILED" ? "sev-HIGH" : "st"}`}>{j.status}</span>
              <span className="grow muted">{when(j.started_at)?.slice(5)}</span>
              {admin && <button className="ghost chip-btn" onClick={() => runJob(j.job)}>Run</button>}
            </div>))}
          {!lastJobs.length && <div className="set-hint">No runs yet; the scheduler starts about 90 s after the backend.</div>}
        </SCard>}

        {tab === "data" && can("sys") && <SCard icon={Cpu} title="System" k="sys">
          <div className="set-stats">
            <div><span>Database</span><b className={h?.database === "ok" ? "ok" : "bad"}>{h?.database || "–"}</b><em>Neon Postgres</em></div>
            <div><span>Domo AI</span><b className={h?.llm_configured ? "ok" : "bad"}>{h ? (h.llm_configured ? "ready" : "no token") : "–"}</b><em>{u ? `${u.calls} calls · ${u.avg_latency_ms ? (u.avg_latency_ms / 1000).toFixed(1) : "–"} s avg` : "last 30 days"}</em></div>
            <div><span>Data as of</span><b>{h?.coverage?.as_of_date || "–"}</b><em>cut-off date</em></div>
          </div>
        </SCard>}



      </div>
    </>
  );
}
