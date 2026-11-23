import { useMemo, useState } from "react";
import { ArrowRight, Check, Database, GitBranch, Plug, RefreshCw, Search, ShieldCheck, Trash2 } from "lucide-react";
import { api } from "../api";
import { useLoad } from "../util";

/* DI Phase 5 (flag di_quality_health): source health with failed / late-load alerts, data-quality rules + quarantine work-queue,
   end-to-end lineage (KPI row -> lineage stamp -> run -> mapping -> connection -> source record). */
const HS = { HEALTHY: ["Healthy", "sev-LOW"], STALE: ["Stale", "sev-HIGH"], FAILING: ["Failing", "sev-CRITICAL"], NEVER_RUN: ["Never run", "st"] };
const RUN_ST = { SUCCESS: "sev-LOW", PARTIAL: "sev-MEDIUM", FAILED: "sev-CRITICAL", RUNNING: "st" };
const ts = v => (v ? String(v).slice(0, 16).replace("T", " ") : "–");

export function Health({ user, setMsg }) {
  const admin = user?.role === "ADMIN";
  const h = useLoad(() => api.diHealth(), []);
  const s = useLoad(() => api.diSettings(), []);
  const [ret, setRet] = useState(null), [busy, setBusy] = useState(false);
  const check = async () => { setBusy(true); try { const r = await api.diHealthCheck(); setMsg(`Health check ${r.status}: ${(r.notified || []).length} alert(s), ${r.files_purged ?? 0} file(s) purged.`); h.reload(); } catch (e) { setMsg(e.message); } setBusy(false); };
  const saveRet = async () => { try { await api.diSettingsSave(ret); setMsg("Retention saved."); setRet(null); s.reload(); } catch (e) { setMsg(e.message); } };
  const d = h.data;
  return (
    <>
      <div className="di-kpis">{Object.entries(HS).map(([k, [l, c]]) => <div key={k} className="card di-kpi"><span className={`pill ${c}`}>{l}</span><b>{d?.counts?.[k] ?? "–"}</b></div>)}
        <div className="grow" />{admin && <button className="ghost" disabled={busy} onClick={check}><RefreshCw size={13} /> {busy ? "Checking…" : "Run health check"}</button>}</div>
      <div className="muted" style={{ fontSize: 12, margin: "6px 0 10px" }}>Stale = no successful load within the expected window (from the schedule: every N min → 3 × N; hourly → 3 h; daily → 26 h).
        ADMINs are notified when a load becomes failing or stale and when it recovers (in-app, plus e-mail / Teams when configured). The check runs every 15 minutes.</div>
      <div className="card"><div className="tbl-wrap" tabIndex={0} role="region" aria-label="Table"><table className="tbl">
        <thead><tr><th>Load</th><th>Source</th><th>Status</th><th>Freshness</th><th>Last runs (oldest → newest)</th><th>Failures 7 d</th><th>Open quarantine</th><th>DQ warnings</th></tr></thead>
        <tbody>{(d?.mappings || []).map(m => {
          const [l, c] = HS[m.status] || [m.status, "st"];
          return (<tr key={m.mapping_id}><td><b>{m.name}</b><div className="muted">{m.mapping_id} → {m.target} · {m.mode === "PUBLISH" ? "publish" : "staging"} · {m.schedule}</div></td>
            <td>{m.connection_name}<div className="muted">{m.connection_id} · {m.environment}{m.connection_ok === false ? " · last test failed" : ""}</div></td>
            <td><span className={`pill ${c}`}>{l}</span><div className="muted" style={{ fontSize: 11, maxWidth: 260 }}>{m.reason}</div></td>
            <td>{m.freshness_hours != null ? `${m.freshness_hours} h` : "–"}<div className="muted">{m.expected_hours != null ? `expected ≤ ${m.expected_hours} h` : "manual"}</div></td>
            <td><div className="di-trend">{m.trend.slice(-8).map((t, i) => <span key={i} className={`pill ${RUN_ST[t.status] || "st"}`} title={`${ts(t.at)} · ${t.status} · extracted ${t.extracted}, new ${t.inserted}, changed ${t.updated}, quarantined ${t.quarantined}`}>{t.extracted}</span>)}</div>
              <div className="muted" style={{ fontSize: 10 }}>rows extracted per run (hover for details)</div></td>
            <td className={m.failures_7d ? "delta bad" : ""}>{m.failures_7d}</td><td className={m.open_quarantine ? "delta bad" : ""}>{m.open_quarantine}</td><td>{m.dq_warnings_last_run}</td></tr>);
        })}
          {!(d?.mappings || []).length && <tr><td colSpan={8} className="muted">No active mappings.</td></tr>}</tbody></table></div></div>
      {s.data && <div className="card di-ret"><b>Retention</b>
        {["file_retention_days", "quarantine_retention_days"].map(k => <label key={k}>{k === "file_retention_days" ? "Uploaded file content (days)" : "Closed quarantine rows (days)"}
          <input type="number" min={7} max={3650} disabled={!admin} value={(ret || s.data)[k]} onChange={e => setRet({ ...(ret || s.data), [k]: Number(e.target.value) })} /></label>)}
        {admin && ret && <button className="primary chip-btn" onClick={saveRet}>Save</button>}
        <span className="muted" style={{ fontSize: 11 }}>Purges run with the health check and are audited.</span></div>}
    </>
  );
}

const KIND_HELP = { not_null: ["field"], conditional_not_null: ["field", "when_field", "when_value"], range: ["field", "min", "max"],
  allowed_values: ["field", "values"], pattern: ["field", "regex"], date_order: ["first", "second"], ratio_max: ["field", "of", "max"], reference: ["field", "entity", "ref_field"] };

export function Quality({ user, setMsg }) {
  const admin = user?.role === "ADMIN";
  const rules = useLoad(() => api.diDqRules({}), []);
  const canon = useLoad(() => api.diCanonical(), []);
  const [form, setForm] = useState(null);
  const byEnt = useMemo(() => { const g = {}; (rules.data || []).forEach(r => (g[r.entity] = g[r.entity] || []).push(r)); return g; }, [rules.data]);
  const act = async (p, ok) => { try { await p; setMsg(ok); rules.reload(); } catch (e) { setMsg(e.message); } };
  const create = async () => {
    const params = {};
    KIND_HELP[form.kind].forEach(k => { const v = k === "entity" ? form.ref_entity : form[k]; if (v === undefined || v === "") return; params[k] = ["min", "max"].includes(k) ? Number(v) : k === "values" ? v.split(",").map(x => x.trim()).filter(Boolean) : v; });
    await act(api.diDqRuleCreate({ entity: form.entity, name: form.name, kind: form.kind, params, severity: form.severity, description: form.description }), "Rule added.");
    setForm(null);
  };
  const ents = canon.data?.entities || [];
  const fields = ents.find(e => e.entity === form?.entity)?.fields || [];
  return (
    <>
      <div className="row-flex" style={{ justifyContent: "space-between", marginBottom: 8 }}>
        <div className="muted" style={{ fontSize: 12, maxWidth: 860 }}><b>ERROR</b> rules send the row to quarantine before it is staged (it never reaches a KPI table); <b>WARN</b> rules let it load and count it.
          Rules are configuration from a fixed list of kinds - never SQL. Results also appear in the existing data-quality history.</div>
        {admin && !form && <button className="primary" onClick={() => setForm({ entity: "po_line", kind: "not_null", severity: "ERROR", name: "" })}>Add rule</button>}
      </div>
      {form && <div className="card di-form" style={{ marginBottom: 10 }}>
        <label>Entity<select value={form.entity} onChange={e => setForm({ ...form, entity: e.target.value })}>{ents.map(e => <option key={e.entity} value={e.entity}>{e.label}</option>)}</select></label>
        <label>Kind<select value={form.kind} onChange={e => setForm({ ...form, kind: e.target.value })}>{Object.keys(KIND_HELP).map(k => <option key={k}>{k}</option>)}</select></label>
        <label>Name<input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. qty_positive" /></label>
        <label>Severity<select value={form.severity} onChange={e => setForm({ ...form, severity: e.target.value })}><option>ERROR</option><option>WARN</option></select></label>
        {KIND_HELP[form.kind].map(k => ["field", "when_field", "first", "second", "of"].includes(k)
          ? <label key={k}>{k}<select value={form[k] || ""} onChange={e => setForm({ ...form, [k]: e.target.value })}><option value="">choose…</option>{fields.map(f => <option key={f.name}>{f.name}</option>)}</select></label>
          : k === "entity" ? <label key={k}>reference entity<select value={form.ref_entity || ""} onChange={e => setForm({ ...form, ref_entity: e.target.value })}>
            <option value="">choose…</option>{ents.map(e => <option key={e.entity} value={e.entity}>{e.label}</option>)}</select></label>
          : k === "ref_field" ? <label key={k}>reference field<select value={form.ref_field || ""} onChange={e => setForm({ ...form, ref_field: e.target.value })}>
            <option value="">choose…</option>{(ents.find(e => e.entity === form.ref_entity)?.fields || []).map(f => <option key={f.name}>{f.name}</option>)}</select></label>
          : <label key={k}>{k}{k === "values" ? " (comma separated)" : ""}<input value={form[k] || ""} onChange={e => setForm({ ...form, [k]: e.target.value })} /></label>)}
        <label className="wide">Description<input value={form.description || ""} onChange={e => setForm({ ...form, description: e.target.value })} /></label>
        <div className="wide row-flex" style={{ gap: 8, justifyContent: "flex-end" }}><button className="ghost" onClick={() => setForm(null)}>Cancel</button><button className="primary" onClick={create}>Save rule</button></div>
      </div>}
      {Object.entries(byEnt).map(([ent, rs]) => <div key={ent} className="card" style={{ marginBottom: 10 }}>
        <h4 className="di-h4" style={{ marginTop: 0 }}>{ents.find(e => e.entity === ent)?.label || ent}</h4>
        <div className="tbl-wrap" tabIndex={0} role="region" aria-label="Table"><table className="tbl"><thead><tr><th>Rule</th><th>Check</th><th>Severity</th><th>Enabled</th><th /></tr></thead>
          <tbody>{rs.map(r => <tr key={r.id} className={r.enabled ? "" : "muted"}><td><b>{r.name}</b><div className="muted" style={{ fontSize: 11 }}>{r.description}</div></td>
            <td className="muted" style={{ fontSize: 11 }}>{r.kind} · {Object.entries(r.params).map(([k, v]) => `${k}=${Array.isArray(v) ? v.join("|") : v}`).join(", ")}</td>
            <td>{admin ? <select aria-label={`Severity of ${r.name}`} value={r.severity} onChange={e => act(api.diDqRuleUpdate(r.id, { severity: e.target.value }), `${r.name}: ${e.target.value}`)}><option>ERROR</option><option>WARN</option></select>
              : <span className={`pill ${r.severity === "ERROR" ? "sev-CRITICAL" : "sev-MEDIUM"}`}>{r.severity}</span>}</td>
            <td>{admin ? <input type="checkbox" checked={r.enabled} onChange={e => act(api.diDqRuleUpdate(r.id, { enabled: e.target.checked }), `${r.name} ${e.target.checked ? "enabled" : "disabled"}`)} aria-label={`Enable ${r.name}`} /> : r.enabled ? "yes" : "no"}</td>
            <td>{admin && <button className="ghost chip-btn" title="Delete rule" onClick={() => window.confirm(`Delete rule ${r.name}?`) && act(api.diDqRuleDelete(r.id), `${r.name} deleted.`)}><Trash2 size={11} /></button>}</td></tr>)}</tbody></table></div>
      </div>)}
      {admin && <QuarantineQueue setMsg={setMsg} />}
    </>
  );
}

function QuarantineQueue({ setMsg }) {
  const [st, setSt] = useState("OPEN"), [sel, setSel] = useState(null);
  const q = useLoad(() => api.diQuarantineQueue({ status: st }), [st]);
  const rows = (q.data?.rows || []).filter(r => !sel || (r.mapping_id === sel.mapping_id && r.reason === sel.reason));
  const bulk = async g => {
    if (!window.confirm(`Ignore all ${g.count} open record(s) "${g.reason}" of ${g.mapping_id}? They stay excluded from KPI tables.`)) return;
    try { const r = await api.diQuarantineBulk({ action: "IGNORED", mapping_id: g.mapping_id, reason: g.reason }); setMsg(`${r.updated} record(s) ignored.`); q.reload(); setSel(null); } catch (e) { setMsg(e.message); }
  };
  return (
    <div className="card" style={{ marginTop: 6 }}>
      <div className="row-flex" style={{ justifyContent: "space-between" }}><h4 className="di-h4" style={{ marginTop: 0 }}>Quarantine work-queue ({q.data?.total ?? 0})</h4>
        <select value={st} onChange={e => { setSt(e.target.value); setSel(null); }} aria-label="Quarantine status"><option value="OPEN">Open</option><option value="RESOLVED">Resolved</option><option value="IGNORED">Ignored</option><option value="">All</option></select></div>
      <div className="muted" style={{ fontSize: 11, marginBottom: 6 }}>Fix the data in the source (or the mapping / rule) and run the load again - records that now load cleanly are resolved automatically. Ignore only what should stay out of the KPIs.</div>
      <div className="tbl-wrap" tabIndex={0} role="region" aria-label="Table"><table className="tbl"><thead><tr><th>Reason</th><th>Load</th><th>Records</th><th>Example</th><th /></tr></thead>
        <tbody>{(q.data?.groups || []).map(g => <tr key={g.mapping_id + g.reason} className={sel && sel.reason === g.reason && sel.mapping_id === g.mapping_id ? "di-sel" : ""}>
          <td><b>{g.reason}</b></td><td>{g.mapping_name}<div className="muted">{g.mapping_id}</div></td><td>{g.count}</td><td className="muted" style={{ fontSize: 11 }}>{g.example}</td>
          <td><div className="row-flex" style={{ gap: 4 }}><button className="ghost chip-btn" onClick={() => setSel(sel?.reason === g.reason && sel?.mapping_id === g.mapping_id ? null : g)}>Records</button>
            {st === "OPEN" && <button className="ghost chip-btn" onClick={() => bulk(g)}>Ignore all</button>}</div></td></tr>)}
          {!(q.data?.groups || []).length && <tr><td colSpan={5} className="muted">Nothing in quarantine.</td></tr>}</tbody></table></div>
      {sel && <div className="tbl-wrap ev-table" tabIndex={0} role="region" aria-label="Table" style={{ marginTop: 8 }}><table className="tbl"><thead><tr><th>Source record</th><th>Errors</th><th>Values (sensitive masked)</th><th>Run</th><th>Status</th></tr></thead>
        <tbody>{rows.slice(0, 100).map(r => <tr key={r.id}><td>{r.source_record_id}</td><td>{(r.errors || []).join("; ")}</td><td className="muted" style={{ fontSize: 11 }}>{JSON.stringify(r.source_values)}</td>
          <td className="muted" style={{ fontSize: 11 }}>{r.run_id}</td><td>{r.status}{r.resolved_by ? <div className="muted" style={{ fontSize: 10 }}>{r.resolved_by}</div> : null}</td></tr>)}</tbody></table></div>}
    </div>
  );
}

export function Lineage() {
  const canon = useLoad(() => api.diCanonical(), []);
  const [ent, setEnt] = useState("po_line"), [q, setQ] = useState(""), [hits, setHits] = useState(null), [L, setL] = useState(null), [err, setErr] = useState("");
  const search = async () => { setErr(""); setL(null); try { setHits(await api.diLineageSearch({ entity: ent, q })); } catch (e) { setErr(e.message); } };
  const open = async h => { setErr(""); try { const e = (canon.data?.entities || []).find(x => x.entity === ent); setL(await api.diLineage({ entity: ent, key: JSON.stringify(Object.fromEntries(e.key.map(k => [k, h[k]]))) })); } catch (x) { setErr(x.message); } };
  const kpiKeys = ["delivery_status", "delay_days", "otif", "on_time", "in_full", "supplier_name", "attribution_weight", "confidence", "attribution_method"];
  return (
    <>
      <div className="row-flex" style={{ gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
        <select value={ent} onChange={e => { setEnt(e.target.value); setHits(null); setL(null); }} aria-label="Entity">{(canon.data?.entities || []).map(e => <option key={e.entity} value={e.entity}>{e.label}</option>)}</select>
        <label className="di-search"><Search size={14} /><input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === "Enter" && search()} placeholder="Key, e.g. POC-000001" aria-label="Search key" /></label>
        <button className="primary" onClick={search}>Find</button>
        <span className="muted" style={{ fontSize: 12 }}>Trace a KPI input row back to the run, mapping, connection and source record that produced it.</span>
      </div>
      {err && <div className="err">{err}</div>}
      {hits && !L && <div className="card"><div className="tbl-wrap" tabIndex={0} role="region" aria-label="Table"><table className="tbl"><thead><tr><th>Key</th><th>Source</th><th /></tr></thead>
        <tbody>{hits.map((h, i) => <tr key={i}><td>{Object.entries(h).filter(([k]) => !k.startsWith("_")).map(([, v]) => v).join(" / ")}</td><td className="muted">{h._source_system}{h._connection_id ? ` · ${h._connection_id}` : ""}</td>
          <td><button className="ghost chip-btn" onClick={() => open(h)}><GitBranch size={11} /> Trace</button></td></tr>)}
          {!hits.length && <tr><td colSpan={3} className="muted">No match.</td></tr>}</tbody></table></div></div>}
      {L && <div className="di-chain">
        {L.kpi && <><div className="card di-node"><span className="di-node-h"><ShieldCheck size={13} /> KPI row · {L.kpi.view}</span>
          <dl className="di-kv">{kpiKeys.filter(k => k in L.kpi.row).map(k => <div key={k}><dt>{k}</dt><dd>{String(L.kpi.row[k] ?? "–")}</dd></div>)}</dl>
          <div className="muted" style={{ fontSize: 11 }}>Feeds: {L.feeds.join(" · ")}</div></div><ArrowRight className="di-arrow" size={18} /></>}
        <div className="card di-node"><span className="di-node-h"><Database size={13} /> {L.label} · {L.table}</span>
          <dl className="di-kv">{Object.entries(L.row).slice(0, 10).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{String(v ?? "–")}</dd></div>)}</dl></div>
        <ArrowRight className="di-arrow" size={18} />
        <div className="card di-node"><span className="di-node-h"><GitBranch size={13} /> Lineage stamp</span>
          <dl className="di-kv">{Object.entries(L.lineage).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{String(v ?? "–")}</dd></div>)}</dl></div>
        <ArrowRight className="di-arrow" size={18} />
        {L.origin === "connector" && L.run ? <div className="card di-node"><span className="di-node-h"><RefreshCw size={13} /> Run {L.run.id}</span>
          <dl className="di-kv">{[["status", L.run.status], ["by", `${L.run.trigger} · ${L.run.actor}`], ["finished", ts(L.run.finished_at)], ["watermark", `${L.run.watermark_from || "full"} → ${L.run.watermark_to || "–"}`],
            ["mapping", `${L.mapping?.id} v${L.run.mapping_version}`], ["approved by", L.mapping?.approved_by || "–"]].map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{String(v)}</dd></div>)}</dl>
          {L.mapping && <div className="di-fieldlist" style={{ marginTop: 6 }}>{Object.entries(L.mapping.fields).map(([f, s]) => <span key={f} title={`${s.transform}${s.policy ? ` · policy ${s.policy}` : ""}`}>{f}<em>← {s.source || "fixed"}</em></span>)}</div>}
        </div> : <div className="card di-node"><span className="di-node-h"><Check size={13} /> Origin</span><div style={{ fontSize: 13 }}>{L.origin === "csv"
          ? <>Loaded from the CSV dataset <b>{L.lineage._source_system?.replace("CSV:", "")}</b> (record {L.lineage._source_record_id}) on {ts(L.lineage._loaded_at)}. No connector owns this table yet.</>
          : "Origin unknown (row loaded before lineage stamping)."}</div></div>}
        {L.connection && <><ArrowRight className="di-arrow" size={18} /><div className="card di-node"><span className="di-node-h"><Plug size={13} /> Connection {L.connection.id}</span>
          <dl className="di-kv">{[["name", L.connection.name], ["connector", L.connection.connector_key], ["environment", L.connection.environment], ["approval", `${L.connection.approval_status}${L.connection.approved_by ? ` by ${L.connection.approved_by}` : ""}`],
            ["source record", L.lineage._source_record_id]].map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{String(v)}</dd></div>)}</dl></div></>}
      </div>}
    </>
  );
}
