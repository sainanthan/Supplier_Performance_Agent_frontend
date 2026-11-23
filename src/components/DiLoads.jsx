import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, Eye, KeyRound, Play, Plus, RotateCcw, ShieldCheck, Sparkles, Trash2, X } from "lucide-react";
import { api } from "../api";
import { useLoad } from "../util";
import { useDialog } from "./useDialog";

/* DI Phase 3 (flag di_mapping_loads): mappings source -> canonical model, sensitive-column policy, preview, four-eyes publish,
   runs with reconciliation (would insert / update / unchanged), quarantine. Suggestions are rule-based on column NAMES only -
   no source data and no external service - and every suggestion must be confirmed before saving. */
const TRANSFORMS = [["none", "as is"], ["trim", "trim"], ["upper", "UPPER"], ["lower", "lower"], ["strip_zeros", "remove leading zeros"],
  ["to_date", "to date"], ["to_number", "to number"], ["to_integer", "to whole number"], ["divide", "divide by"], ["multiply", "multiply by"],
  ["constant", "fixed value"], ["map", "lookup table"], ["hash", "pseudonymise"]];
const NEEDS_ARG = { divide: "number", multiply: "number", constant: "value", map: '{"X": "CLOSED"}' };
const RUN_ST = { SUCCESS: "sev-LOW", PARTIAL: "sev-MEDIUM", FAILED: "sev-CRITICAL", RUNNING: "st" };
const SCHEDULES = [["manual", "Manual only"], ["every:15", "Every 15 minutes"], ["hourly", "Hourly"], ["daily:02:00", "Daily 02:00 IST"]];

export function Mappings({ user, conns, setMsg, onRuns }) {
  const admin = user?.role === "ADMIN";
  const maps = useLoad(() => api.diMappings(), []);
  const sum = useLoad(() => api.diSummary(), []);
  const [edit, setEdit] = useState(null);                 // {} new | mapping
  const [busy, setBusy] = useState("");
  const act = async (key, p, ok) => {
    setBusy(key);
    try { const r = await p; setMsg(typeof ok === "function" ? ok(r) : ok); maps.reload(); sum.reload(); } catch (e) { setMsg(e.message); }
    setBusy("");
  };
  const owned = Object.entries(sum.data?.table_ownership || {});
  return (
    <>
      <div className="row-flex" style={{ justifyContent: "space-between", marginBottom: 10 }}>
        <div className="muted" style={{ fontSize: 12, maxWidth: 820 }}>A mapping loads one source into one canonical entity (= the KPI table it feeds). <b>Staging</b> mappings
          only validate and reconcile; <b>Publish</b> mappings write into the KPI table after a second ADMIN approves. Loads are idempotent and incremental.</div>
        {admin && <button className="primary" onClick={() => setEdit({})}><Plus size={14} /> New mapping</button>}
      </div>
      {owned.length > 0 && <div className="card di-owned"><ShieldCheck size={14} /> KPI tables fed by a connection (CSV reload skipped):
        {owned.map(([t, o]) => <span key={t} className="pill sev-MEDIUM">sp.{t} ← {o}
          {admin && <button className="ghost chip-btn" title="Hand the table back to the CSV loader (rollback)" disabled={!!busy}
            onClick={() => window.confirm(`Release sp.${t} from ${o}? The data stays; future CSV reloads will overwrite it again.`) && act("rel" + t, api.diRelease(t), `sp.${t} released.`)}><RotateCcw size={11} /></button>}</span>)}</div>}
      <div className="card"><div className="tbl-wrap" tabIndex={0} role="region" aria-label="Table"><table className="tbl">
        <thead><tr><th>Mapping</th><th>Source → target</th><th>Mode</th><th>Approval</th><th>Schedule</th><th>Last run</th><th>Watermark</th><th /></tr></thead>
        <tbody>{(maps.data || []).map(m => {
          const canApprove = admin && m.approval_status === "PENDING" && m.requested_by !== user.username;
          const canPublish = m.mode === "PUBLISH" && m.approval_status === "APPROVED";
          return (
            <tr key={m.id}><td><b>{m.name}</b><div className="muted">{m.id} · v{m.version} · {Object.keys(m.field_map || {}).length} fields</div></td>
              <td>{m.connection_id} · {m.source_kind === "query" ? "query" : m.source_object}<div className="muted">→ {m.target} ({m.entity})</div></td>
              <td><span className={`pill ${m.mode === "PUBLISH" ? "sev-HIGH" : "st"}`}>{m.mode === "PUBLISH" ? "Publish" : "Staging"}</span></td>
              <td>{m.mode !== "PUBLISH" ? <span className="muted">not needed</span> : m.approval_status === "PENDING" ? <span title="Four-eyes">Pending · by {m.requested_by}</span>
                : m.approval_status === "APPROVED" ? `Approved by ${m.approved_by}` : m.approval_status}</td>
              <td>{m.schedule}{m.next_run_at && <div className="muted">next {String(m.next_run_at).slice(0, 16).replace("T", " ")}</div>}</td>
              <td>{m.last_run_status ? <button className="link-btn" onClick={() => onRuns(m.id)}><span className={`pill ${RUN_ST[m.last_run_status] || "st"}`}>{m.last_run_status}</span></button> : <span className="muted">never</span>}
                {m.last_run_at && <div className="muted">{String(m.last_run_at).slice(0, 16).replace("T", " ")}</div>}</td>
              <td className="muted" style={{ fontSize: 11 }}>{m.watermark_column ? <>{m.watermark_column}<div>{m.last_watermark ? String(m.last_watermark).slice(0, 19) : "full load next"}</div></> : "full each run"}</td>
              <td><div className="row-flex" style={{ gap: 4, flexWrap: "wrap" }}>
                {canApprove && <><button className="primary chip-btn" onClick={() => act("ap" + m.id, api.diMappingApprove(m.id, { decision: "APPROVED" }), `${m.id} approved for publishing.`)}><Check size={11} /> Approve</button>
                  <button className="ghost chip-btn" onClick={() => act("rj" + m.id, api.diMappingApprove(m.id, { decision: "REJECTED", note: prompt("Reason:") || undefined }), `${m.id} rejected.`)}>Reject</button></>}
                {admin && <button className="ghost chip-btn" disabled={!!busy} title="Extract, validate, stage and reconcile - nothing is written to KPI tables"
                  onClick={() => act("dr" + m.id, api.diMappingRun(m.id, { dry_run: true }), r => `${m.id} dry run ${r.status}: ${r.message}`)}>{busy === "dr" + m.id ? "Running…" : <><Eye size={11} /> Dry run</>}</button>}
                {admin && canPublish && <button className="primary chip-btn" disabled={!!busy} onClick={() => window.confirm(`Publish ${m.name} into ${m.target}? Changed rows are updated, new rows inserted.`) &&
                  act("run" + m.id, api.diMappingRun(m.id, {}), r => `${m.id} ${r.status}: ${r.message}`)}>{busy === "run" + m.id ? "Publishing…" : <><Play size={11} /> Publish</>}</button>}
                {admin && <button className="ghost chip-btn" onClick={() => setEdit(m)}>Edit</button>}
                {admin && <button className="ghost chip-btn" title="Delete mapping" onClick={() => window.confirm(`Delete ${m.name}? Loaded data stays.`) && act("del" + m.id, api.diMappingDelete(m.id), `${m.id} deleted.`)}><Trash2 size={11} /></button>}
              </div></td></tr>);
        })}
          {!(maps.data || []).length && <tr><td colSpan={8} className="muted">No mappings yet. {admin ? "Create one from an approved connection." : "An ADMIN can create mappings."}</td></tr>}</tbody>
      </table></div></div>
      {edit && <MappingEditor initial={edit} conns={conns.filter(c => c.approval_status === "APPROVED")} onClose={() => setEdit(null)}
        onSaved={m => { setEdit(null); maps.reload(); setMsg(`${m.id} saved${m.approval_status === "PENDING" ? " - publishing waits for a second ADMIN's approval" : ""}.`); }} />}
    </>
  );
}

function MappingEditor({ initial, conns, onClose, onSaved }) {
  const dlg = useDialog(onClose);
  const isNew = !initial.id;
  const canon = useLoad(() => api.diCanonical(), []);
  const [f, setF] = useState(() => ({ name: initial.name || "", connection_id: initial.connection_id || conns[0]?.id || "", entity: initial.entity || "po_line",
    source_kind: initial.source_kind || "object", source_object: initial.source_object || "", source_query: initial.source_query || "",
    field_map: initial.field_map || {}, record_id_columns: initial.record_id_columns || [], watermark_column: initial.watermark_column || "",
    column_policy: initial.column_policy || {}, mode: initial.mode || "STAGING", schedule: initial.schedule || "manual", max_quarantine_pct: initial.max_quarantine_pct ?? 5 }));
  const [cols, setCols] = useState(null), [hints, setHints] = useState({}), [pv, setPv] = useState(null), [err, setErr] = useState(""), [busy, setBusy] = useState("");
  const conn = conns.find(c => c.id === f.connection_id);
  const isDb = ["postgresql", "oracle", "sqlserver"].includes(conn?.connector_key);
  const schema = useLoad(() => (f.connection_id ? api.diSchema(f.connection_id) : Promise.resolve([])), [f.connection_id]);
  const ent = (canon.data?.entities || []).find(e => e.entity === f.entity);
  const set = p => { setF(x => ({ ...x, ...p })); setPv(null); };
  const src = () => ({ connection_id: f.connection_id, entity: f.entity, source_kind: f.source_kind, source_object: f.source_object || null, source_query: f.source_query || null });

  const readSource = async (applySuggestions) => {
    setErr(""); setBusy("read");
    try {
      const s = await api.diMappingSuggest(src());
      setCols(s.columns);
      if (applySuggestions) {
        setHints(s.field_map);
        set({ field_map: Object.fromEntries(Object.entries(s.field_map).map(([k, v]) => [k, { source: v.source, transform: v.transform, arg: v.arg }])),
          record_id_columns: s.record_id_columns, watermark_column: s.watermark_candidates[0] || "",
          name: f.name || `${ent?.label || f.entity} from ${f.source_kind === "query" ? "query" : f.source_object}` });
      }
    } catch (e) { setErr(e.message); }
    setBusy("");
  };
  useEffect(() => { if (!isNew) readSource(false); }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  const sens = useMemo(() => new Set((cols || []).filter(c => c.sensitive).map(c => c.name)), [cols]);
  const mappedSens = [...new Set(Object.values(f.field_map).map(s => s?.source).filter(s => s && sens.has(s)))];
  const setField = (name, patch) => set({ field_map: { ...f.field_map, [name]: { ...(f.field_map[name] || { transform: "none" }), ...patch } } });
  const body = () => ({ ...f, max_quarantine_pct: Number(f.max_quarantine_pct), watermark_column: f.watermark_column || null,
    field_map: Object.fromEntries(Object.entries(f.field_map).filter(([, s]) => s && (s.source || s.transform === "constant"))
      .map(([k, s]) => [k, { ...s, arg: s.transform === "map" && typeof s.arg === "string" ? safeJson(s.arg) : s.arg }])) });
  const preview = async () => { setErr(""); setBusy("pv"); try { setPv(await api.diMappingPreview(body())); } catch (e) { setErr(e.message); } setBusy(""); };
  const save = async () => {
    setErr(""); setBusy("save");
    try { onSaved(isNew ? await api.diMappingCreate(body()) : await api.diMappingUpdate(initial.id, body())); } catch (e) { setErr(e.message); }
    setBusy("");
  };
  return (
    <div className="twp-scrim" role="dialog" aria-modal="true" aria-label="Mapping editor" onClick={onClose}>
      <div className="card di-wizard di-mapper" ref={dlg} tabIndex={-1} onClick={e => e.stopPropagation()}>
        <h3 style={{ display: "flex", justifyContent: "space-between" }}><span>{isNew ? "New mapping" : `Edit ${initial.id}`}</span>
          <button className="ghost icon-btn" onClick={onClose} aria-label="Close"><X size={15} /></button></h3>
        <div className="di-form">
          <label>Connection<select value={f.connection_id} onChange={e => { set({ connection_id: e.target.value }); setCols(null); }} disabled={!isNew}>
            {conns.map(c => <option key={c.id} value={c.id}>{c.id} · {c.name}</option>)}</select></label>
          <label>Canonical entity (KPI table)<select value={f.entity} onChange={e => set({ entity: e.target.value, field_map: {} })} disabled={!isNew}>
            {(canon.data?.entities || []).map(e => <option key={e.entity} value={e.entity}>{e.label} → sp.{e.table}</option>)}</select></label>
          <label>Source type<select value={f.source_kind} onChange={e => { set({ source_kind: e.target.value }); setCols(null); }}>
            <option value="object">Table / view</option>{isDb && <option value="query">Query (joins, SELECT only)</option>}</select></label>
          {f.source_kind === "object" ? <label>Table / view<select value={f.source_object} onChange={e => { set({ source_object: e.target.value }); setCols(null); }}>
            <option value="">Choose…</option>{(schema.data || []).map(o => <option key={o.name} value={o.name}>{o.name}{o.row_estimate ? ` (~${o.row_estimate})` : ""}</option>)}</select></label>
            : <label className="wide">SELECT query<textarea rows={5} spellCheck={false} value={f.source_query} onChange={e => { set({ source_query: e.target.value }); setCols(null); }}
              placeholder="SELECT p.ebeln, p.ebelp, k.lifnr, ... FROM demo_erp.ekpo p JOIN demo_erp.ekko k ON k.ebeln = p.ebeln" /></label>}
          <div className="wide row-flex" style={{ gap: 8 }}>
            <button className="primary chip-btn" disabled={!!busy || !(f.source_object || f.source_query)} onClick={() => readSource(true)}>
              <Sparkles size={12} /> {busy === "read" ? "Reading…" : "Read source & suggest mapping"}</button>
            <span className="muted" style={{ fontSize: 11 }}>Rule-based on column names only (SAP / Oracle dictionary + similarity). No data leaves; confirm every row.</span>
          </div>
        </div>
        {cols && ent && <>
          <h4 className="di-h4">Field mapping <span className="muted">→ sp.{ent.table} · key {ent.key.join(" + ")}</span></h4>
          <div className="tbl-wrap" tabIndex={0} role="region" aria-label="Table"><table className="tbl di-maptbl">
            <thead><tr><th>Canonical field</th><th>Source column</th><th>Transform</th><th>Suggestion</th></tr></thead>
            <tbody>{ent.fields.map(fd => {
              const s = f.field_map[fd.name] || {}, h = hints[fd.name];
              const missing = fd.required && !s.source && s.transform !== "constant";
              return (
                <tr key={fd.name} className={missing ? "di-missing" : ""}><td><b>{fd.name}</b>{fd.required && " *"}{ent.key.includes(fd.name) && <span className="pill sev-LOW" style={{ marginLeft: 4 }}>key</span>}
                  <div className="muted" style={{ fontSize: 11 }}>{fd.type} · {fd.description}</div></td>
                  <td><select value={s.source || ""} onChange={e => setField(fd.name, { source: e.target.value || null })} aria-label={`Source for ${fd.name}`}>
                    <option value="">— not mapped —</option>{cols.map(c => <option key={c.name} value={c.name}>{c.name}{c.sensitive ? " (sensitive)" : ""}</option>)}</select></td>
                  <td><div className="row-flex" style={{ gap: 4 }}><select value={s.transform || "none"} onChange={e => setField(fd.name, { transform: e.target.value })} aria-label={`Transform for ${fd.name}`}>
                    {TRANSFORMS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
                    {NEEDS_ARG[s.transform] && <input style={{ width: 110 }} placeholder={NEEDS_ARG[s.transform]} value={typeof s.arg === "object" && s.arg ? JSON.stringify(s.arg) : s.arg ?? ""}
                      onChange={e => setField(fd.name, { arg: e.target.value })} aria-label={`Value for ${fd.name}`} />}</div></td>
                  <td className="muted" style={{ fontSize: 11 }}>{h ? <>{Math.round(h.confidence * 100)}% · {h.reason}</> : "–"}</td></tr>);
            })}</tbody></table></div>
          {mappedSens.length > 0 && <div className="di-warn wide" style={{ display: "block", marginTop: 10 }}><KeyRound size={13} /> <b>Sensitive columns are mapped.</b> Decide what may be stored - applied before anything is written:
            {mappedSens.map(c => <div key={c} className="row-flex di-policy"><code>{c}</code>{[["keep", "Keep (store as-is)"], ["hash", "Pseudonymise"], ["exclude", "Exclude (never stored)"]].map(([k, l]) =>
              <label key={k}><input type="radio" name={`pol-${c}`} checked={f.column_policy[c] === k} onChange={() => set({ column_policy: { ...f.column_policy, [c]: k } })} /> {l}</label>)}</div>)}</div>}
          <div className="di-form" style={{ marginTop: 10 }}>
            <label className="wide">Record-id columns (stored as source record id for lineage)
              <div className="di-chips">{cols.map(c => <button key={c.name} className={f.record_id_columns.includes(c.name) ? "on" : ""}
                onClick={() => set({ record_id_columns: f.record_id_columns.includes(c.name) ? f.record_id_columns.filter(x => x !== c.name) : [...f.record_id_columns, c.name] })}>{c.name}</button>)}</div></label>
            <label>Watermark (incremental)<select value={f.watermark_column} onChange={e => set({ watermark_column: e.target.value })}>
              <option value="">— full load every run —</option>{cols.map(c => <option key={c.name}>{c.name}</option>)}</select></label>
            <label>Schedule<select value={SCHEDULES.some(([k]) => k === f.schedule) ? f.schedule : "custom"} onChange={e => set({ schedule: e.target.value === "custom" ? "every:30" : e.target.value })}>
              {SCHEDULES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}<option value="custom">Custom…</option></select>
              {!SCHEDULES.some(([k]) => k === f.schedule) && <input value={f.schedule} onChange={e => set({ schedule: e.target.value })} placeholder="every:30 or daily:06:30" />}</label>
            <label>Mode<select value={f.mode} onChange={e => set({ mode: e.target.value })}>
              <option value="STAGING">Staging only (validate + reconcile; KPI tables untouched)</option><option value="PUBLISH">Publish into KPI table (needs second ADMIN)</option></select></label>
            <label>Quarantine limit (%)<input type="number" min={0} max={100} value={f.max_quarantine_pct} onChange={e => set({ max_quarantine_pct: e.target.value })} />
              <span className="muted" style={{ fontSize: 11 }}>Above this share of bad rows nothing is published.</span></label>
            <label>Name<input value={f.name} onChange={e => set({ name: e.target.value })} /></label>
          </div>
          {f.mode === "PUBLISH" && <div className="di-warn" style={{ marginTop: 8 }}><ShieldCheck size={13} /> Publishing changes KPI input data: a <b>second ADMIN</b> must approve this mapping, and any later change to what is loaded needs approval again.</div>}
        </>}
        {pv && <div className="di-pv">
          {pv.errors.map(e => <div key={e} className="err">{e}</div>)}
          {pv.warnings.map(w => <div key={w} className="di-note"><AlertTriangle size={12} /> {w}</div>)}
          {!pv.errors.length && <><div className="ev-def">Preview of the first {pv.sampled} source rows → {pv.rows.length} valid, {pv.quarantine.length} to quarantine. Nothing stored. Sensitive kept values shown masked.</div>
            {pv.rows.length > 0 && <div className="tbl-wrap ev-table" tabIndex={0} role="region" aria-label="Table"><table className="tbl"><thead><tr>{Object.keys(pv.rows[0]).map(c => <th key={c}>{c}</th>)}</tr></thead>
              <tbody>{pv.rows.slice(0, 10).map((r, i) => <tr key={i}>{Object.keys(pv.rows[0]).map(c => <td key={c}>{String(r[c] ?? "–")}</td>)}</tr>)}</tbody></table></div>}
            {pv.quarantine.slice(0, 5).map((q, i) => <div key={i} className="di-note"><AlertTriangle size={12} /> {q.source_record_id}: {q.errors.join("; ")}</div>)}</>}
        </div>}
        {err && <div className="err" style={{ marginTop: 8 }}>{err}</div>}
        <div className="row-flex" style={{ justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
          <button className="ghost" onClick={onClose}>Cancel</button>
          <button className="ghost" disabled={!cols || !!busy} onClick={preview}><Eye size={13} /> {busy === "pv" ? "Previewing…" : "Preview"}</button>
          <button className="primary" disabled={!cols || !!busy} onClick={save}>{busy === "save" ? "Saving…" : "Save mapping"}</button>
        </div>
      </div>
    </div>
  );
}

function safeJson(s) { try { return JSON.parse(s); } catch { return s; } }

export function Runs({ user, mappingId, setMappingId }) {
  const runs = useLoad(() => api.diRuns(mappingId ? { mapping_id: mappingId } : {}), [mappingId]);
  const [open, setOpen] = useState(null);
  return (
    <>
      {mappingId && <div className="muted" style={{ marginBottom: 8 }}>Showing runs of {mappingId} · <button className="link-btn" onClick={() => setMappingId(null)}>show all</button></div>}
      <div className="card"><div className="tbl-wrap" tabIndex={0} role="region" aria-label="Table"><table className="tbl">
        <thead><tr><th>Run</th><th>Mapping</th><th>Kind</th><th>Status</th><th>Extracted</th><th>New</th><th>Changed</th><th>Unchanged</th><th>Quarantined</th><th>Watermark</th><th /></tr></thead>
        <tbody>{(runs.data || []).map(r => <tr key={r.id}><td>{String(r.started_at).slice(0, 19).replace("T", " ")}<div className="muted">{r.id} · {r.trigger} · {r.actor}</div></td>
          <td>{r.mapping_name}<div className="muted">{r.mapping_id} → sp.{r.target_table}</div></td>
          <td>{r.dry_run ? <span className="pill st">dry run / staging</span> : <span className="pill sev-HIGH">publish</span>}</td>
          <td><span className={`pill ${RUN_ST[r.status] || "st"}`}>{r.status}</span></td>
          <td>{r.extracted}</td><td>{r.inserted}</td><td>{r.updated}</td><td>{r.unchanged}</td><td className={r.quarantined ? "delta bad" : ""}>{r.quarantined}</td>
          <td className="muted" style={{ fontSize: 11 }}>{r.watermark_from ? String(r.watermark_from).slice(0, 19) : "full"} → {r.watermark_to ? String(r.watermark_to).slice(0, 19) : "–"}</td>
          <td><button className="ghost chip-btn" onClick={() => setOpen(r)}>Details</button></td></tr>)}
          {!(runs.data || []).length && <tr><td colSpan={11} className="muted">No runs yet.</td></tr>}</tbody>
      </table></div></div>
      {open && <RunDetail run={open} admin={user?.role === "ADMIN"} onClose={() => setOpen(null)} />}
    </>
  );
}

function RunDetail({ run, admin, onClose }) {
  const dlg = useDialog(onClose);
  const q = useLoad(() => (admin && run.quarantined ? api.diQuarantine({ run_id: run.id, status: "" }) : Promise.resolve([])), [run.id]);
  const [msg, setMsg] = useState("");
  const fc = Object.entries(run.field_changes || {});
  return (
    <div className="twp-scrim" role="dialog" aria-modal="true" aria-label={`Run ${run.id}`} onClick={onClose}>
      <div className="card twp-modal" ref={dlg} tabIndex={-1} onClick={e => e.stopPropagation()}>
        <h3 style={{ display: "flex", justifyContent: "space-between" }}><span>Run {run.id}</span><button className="ghost icon-btn" onClick={onClose} aria-label="Close"><X size={15} /></button></h3>
        <div className={`di-test ${run.status === "FAILED" ? "bad" : run.status === "PARTIAL" ? "warn" : "ok"}`}><b>{run.status}</b> · {run.message}</div>
        <dl className="di-kv">{[["Mapping", `${run.mapping_id} v${run.mapping_version}`], ["Target", `sp.${run.target_table}`], ["Trigger", `${run.trigger} by ${run.actor}`],
          ["Extracted", run.extracted], ["Staged (valid)", run.staged], ["Quarantined", run.quarantined], ["New", run.inserted], ["Changed", run.updated],
          ["Unchanged", run.unchanged], ["Lineage re-stamped", run.restamped], ["Watermark", `${run.watermark_from || "full"} → ${run.watermark_to || "–"}`]]
          .map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{String(v)}</dd></div>)}</dl>
        <h4 className="di-h4">Reconciliation against the KPI table</h4>
        {fc.length ? <><div className="di-fields">{fc.map(([f, n]) => <span key={f} className="pill sev-MEDIUM">{f}: {n} row(s) differ</span>)}</div>
          <div className="tbl-wrap" tabIndex={0} role="region" aria-label="Table"><table className="tbl"><thead><tr><th>Key</th><th>Field</th><th>KPI table now</th><th>Source</th></tr></thead>
            <tbody>{(run.samples || []).map((s, i) => <tr key={i}><td>{s.key}</td><td>{s.field}</td><td>{s.current ?? "–"}</td><td>{s.source ?? "–"}</td></tr>)}</tbody></table></div></>
          : <div className="muted">No field differs between the source and the KPI table for the matched rows{run.inserted ? `; ${run.inserted} row(s) are new` : ""}.</div>}
        {admin && run.quarantined > 0 && <>
          <h4 className="di-h4">Quarantine ({run.quarantined})</h4>{msg && <div className="muted">{msg}</div>}
          <div className="tbl-wrap" tabIndex={0} role="region" aria-label="Table"><table className="tbl"><thead><tr><th>Source record</th><th>Why</th><th>Values (sensitive masked)</th><th>Status</th><th /></tr></thead>
            <tbody>{(q.data || []).map(r => <tr key={r.id}><td>{r.source_record_id}</td><td>{(r.errors || []).join("; ")}</td>
              <td className="muted" style={{ fontSize: 11 }}>{JSON.stringify(r.source_values)}</td><td>{r.status}</td>
              <td>{r.status === "OPEN" && <button className="ghost chip-btn" onClick={async () => { try { await api.diQuarantineResolve(r.id, { decision: "IGNORED" }); q.reload(); } catch (e) { setMsg(e.message); } }}>Ignore</button>}</td></tr>)}</tbody>
          </table></div><div className="muted" style={{ fontSize: 11 }}>Fix the data in the source (or the mapping), then run again - corrected rows load automatically.</div></>}
      </div>
    </div>
  );
}
