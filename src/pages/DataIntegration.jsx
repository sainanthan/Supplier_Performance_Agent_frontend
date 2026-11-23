import { useMemo, useState } from "react";
import { Activity, Building2, Check, ChevronLeft, ChevronRight, Cloud, Cpu, Database, Eye, Factory, FileSpreadsheet, FileText, FlaskConical, Folder,
  FolderSync, Globe, KeyRound, Lock, Mail, MapPin, Plug, Radio, Search, Ship, ShieldCheck, Snowflake, Trash2, Truck, Users, Warehouse, Webhook, X } from "lucide-react";
import { api } from "../api";
import { useLoad } from "../util";
import { PageHead } from "../components/ui";
import { Mappings, Runs } from "../components/DiLoads";
import { Health, Lineage, Quality } from "../components/DiQuality";
import { useDialog } from "../components/useDialog";
import ConnectorLogo from "../components/ConnectorLogo";
import ConnectionDetails, { ConnectorConnections, PrimaryDetails } from "../components/ConnectionDetails";
import SidePanel from "../components/SidePanel";
import "../integration.css";

/* Data Integration (DI Phase 1, flag data_integration): connector gallery, guided connection wizard, connections with
   vault-stored secrets and four-eyes approval for production, canonical model and audit log. Only ADMIN connects or edits;
   everyone else sees status. Integration only supplies data - KPI definitions and calculations are untouched. */
const ICONS = { database: Database, "building-2": Building2, factory: Factory, cpu: Cpu, "shield-check": ShieldCheck, warehouse: Warehouse, truck: Truck,
  ship: Ship, "map-pin": MapPin, radio: Radio, activity: Activity, "file-text": FileText, users: Users, "file-spreadsheet": FileSpreadsheet,
  "folder-sync": FolderSync, cloud: Cloud, folder: Folder, globe: Globe, webhook: Webhook, mail: Mail, snowflake: Snowflake, "flask-conical": FlaskConical };
const STATUS = { NOT_CONNECTED: ["Not connected", "st"], CONNECTED: ["Connected", "sev-LOW"], ERROR: ["Error", "sev-CRITICAL"], SYNCING: ["Syncing", "sev-MEDIUM"],
  PENDING_APPROVAL: ["Pending approval", "sev-HIGH"], REJECTED: ["Rejected", "sev-CRITICAL"] };
const AVAIL = { available: ["Available", "sev-LOW"], planned: ["In development", "sev-MEDIUM"], coming_soon: ["Coming soon", "st"] };

export default function DataIntegration({ user, features = {} }) {
  const loads = !!features.di_mapping_loads;
  const dq = !!features.di_quality_health;
  const [runsFor, setRunsFor] = useState(null);
  const admin = user?.role === "ADMIN";
  const [tab, setTab] = useState("gallery");
  const sum = useLoad(() => api.diSummary(), []);
  const cat = useLoad(() => api.diCatalog(), []);
  const conns = useLoad(() => api.diConnections(), []);
  const [wizard, setWizard] = useState(null);           // connector meta being connected
  const [preview, setPreview] = useState(null);         // connection id for schema / preview
  const [side, setSide] = useState(null);               // right-side panel: {kind: primary | connector | connection, ...}
  const liveConns = (conns.data || []).filter(c => c.status !== "DELETED");
  const [msg, setMsg] = useState("");
  const reload = () => { sum.reload(); cat.reload(); conns.reload(); };
  const env = sum.data?.environment || "DEV";

  return (
    <>
      <div className={`di-env env-${env}`} role="status"><Lock size={13} /> Environment: <b>{env}</b>
        {env === "PROD" ? " · production connections need a second ADMIN's approval" : " · connections here do not touch production data"}
        <span className="grow" />{sum.data && <span>Secrets vault: {sum.data.vault.provider} (key {sum.data.vault.key_fingerprint || "external"})</span>}</div>
      <PageHead eyebrow="Data" title="Data Integration" sub={admin ? "Connect, map and schedule your manufacturing data sources - no code." : "Connection status (only ADMIN can connect or change sources)."} />
      {msg && <div className="card" style={{ marginBottom: 10, color: "var(--brand-purple)", fontWeight: 600 }}>{msg}</div>}
      <div className="seg di-tabs">{[["gallery", "Connector gallery"], ["connections", `Connections ${conns.data?.length ?? ""}`],
        ...(loads ? [["mappings", "Mappings"], ["runs", "Runs"]] : []), ...(dq ? [["health", "Health"], ["quality", "Quality"], ["lineage", "Lineage"]] : []),
        ["canonical", "Canonical model"], ["audit", "Audit log"]].map(([k, l]) => (
        <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{l}</button>))}</div>
      {tab === "gallery" && <Gallery items={cat.data || []} admin={admin} onConnect={m => setWizard(m)} onPrimary={() => setSide({ kind: "primary" })}
        onDetails={m => { const cs = liveConns.filter(c => c.connector_key === m.key); if (cs.length === 1) setSide({ kind: "connection", conn: cs[0] }); else if (cs.length) setSide({ kind: "connector", meta: m, conns: cs }); }} />}
      {tab === "connections" && <Connections rows={conns.data || []} user={user} reload={reload} setMsg={setMsg} onPreview={setPreview}
        onDetails={c => setSide({ kind: "connection", conn: c })} onPrimary={() => setSide({ kind: "primary" })} />}
      {tab === "mappings" && loads && <Mappings user={user} conns={conns.data || []} setMsg={setMsg} onRuns={id => { setRunsFor(id); setTab("runs"); }} />}
      {tab === "runs" && loads && <Runs user={user} mappingId={runsFor} setMappingId={setRunsFor} />}
      {tab === "health" && dq && <Health user={user} setMsg={setMsg} />}
      {tab === "quality" && dq && <Quality user={user} setMsg={setMsg} />}
      {tab === "lineage" && dq && <Lineage />}
      {tab === "canonical" && <Canonical />}
      {tab === "audit" && <Audit />}
      {wizard && <Wizard meta={wizard} env={env} onClose={() => setWizard(null)} onDone={c => { setWizard(null); reload(); setTab("connections"); setMsg(`${c.name} saved${c.approval_status === "PENDING" ? " - waiting for a second ADMIN's approval" : ""}.`); }} />}
      {preview && <PreviewModal conn={preview} onClose={() => setPreview(null)} />}
      {side?.kind === "primary" && <PrimaryDetails onClose={() => setSide(null)} />}
      {side?.kind === "connector" && <ConnectorConnections meta={side.meta} conns={side.conns} onClose={() => setSide(null)} onOpen={c => setSide({ kind: "connection", conn: c })} />}
      {side?.kind === "connection" && <ConnectionDetails conn={side.conn} onClose={() => setSide(null)} />}
    </>
  );
}

function Gallery({ items, admin, onConnect, onPrimary, onDetails }) {
  const [q, setQ] = useState(""), [catF, setCatF] = useState(""), [av, setAv] = useState("");
  const cats = useMemo(() => [...new Set(items.map(i => i.category))], [items]);
  const shown = items.filter(i => (!catF || i.category === catF) && (!av || i.availability === av)
    && (!q || `${i.name} ${i.description} ${i.category}`.toLowerCase().includes(q.toLowerCase())));
  return (
    <>
      <div className="di-filters">
        <label className="di-search"><Search size={14} /><input placeholder="Search connectors…" value={q} onChange={e => setQ(e.target.value)} aria-label="Search connectors" /></label>
        <div className="di-chips">{["", ...cats].map(c => <button key={c || "all"} className={catF === c ? "on" : ""} onClick={() => setCatF(c)}>{c || "All categories"}</button>)}</div>
        <select value={av} onChange={e => setAv(e.target.value)} aria-label="Availability"><option value="">Any availability</option><option value="available">Available</option><option value="planned">In development</option><option value="coming_soon">Coming soon</option></select>
      </div>
      <div className="di-grid">
        {!catF && !av && (!q || "neon postgresql primary warehouse database".includes(q.toLowerCase())) && (
          <div className="card di-card di-primary" role="button" tabIndex={0} onClick={onPrimary} onKeyDown={e => e.key === "Enter" && onPrimary()} title="Show the datasets in the primary warehouse">
            <div className="row-flex" style={{ justifyContent: "space-between" }}><ConnectorLogo k="neon" size={42} title="Neon PostgreSQL" />
              <span className="pill sev-LOW">Built in · primary</span></div>
            <b>Neon DB · primary warehouse</b><span className="muted di-cat">Database · PostgreSQL · read by every KPI</span>
            <p>The agent's data lives here today: purchase orders, inspections, NCR/CAPA, genealogy, inventory and master data (schema sp).</p>
            <div className="row-flex" style={{ justifyContent: "space-between", marginTop: "auto" }}>
              <span className="pill sev-LOW">Connected</span><button className="primary chip-btn" onClick={e => { e.stopPropagation(); onPrimary(); }}><Eye size={12} /> View details</button>
            </div>
          </div>)}
        {shown.map(m => {
        const I = ICONS[m.icon] || Plug, [al, ac] = AVAIL[m.availability] || AVAIL.coming_soon, [sl, sc] = STATUS[m.status] || STATUS.NOT_CONNECTED;
        const canConnect = admin && m.availability === "available" && !["telematics", "portal_api"].includes(m.key);
        const connected = m.connections > 0;
        return (
          <div key={m.key} className={`card di-card ${m.availability}${connected ? " is-connected" : ""}`} role={connected ? "button" : undefined} tabIndex={connected ? 0 : undefined}
            onClick={connected ? () => onDetails(m) : undefined} onKeyDown={connected ? e => e.key === "Enter" && onDetails(m) : undefined}
            title={connected ? "Show this connector's connections and datasets" : undefined}>
            <div className="row-flex" style={{ justifyContent: "space-between" }}><ConnectorLogo k={m.key} size={42} title={m.name} fallback={I} />
              <span className={`pill ${ac}`}>{al}{m.phase ? ` · Phase ${m.phase}` : ""}</span></div>
            <b>{m.name}</b><span className="muted di-cat">{m.category}{m.read_only ? " · read-only" : ""}</span>
            <p>{m.description}</p>
            {m.licence_note && <div className="di-lic">{m.licence_note}</div>}
            <div className="row-flex" style={{ justifyContent: "space-between", marginTop: "auto" }}>
              <span className={`pill ${sc}`}>{m.connections ? `${sl} · ${m.connections}` : sl}</span>
              {connected && <button className="ghost chip-btn" onClick={e => { e.stopPropagation(); onDetails(m); }}><Eye size={12} /> Details</button>}
              <button className={canConnect ? "primary chip-btn" : "ghost chip-btn"} disabled={!canConnect} onClick={e => { e.stopPropagation(); onConnect(m); }}
                title={!admin ? "Only ADMIN can connect sources" : m.availability === "coming_soon" ? "Coming soon" : undefined}>
                <Plug size={12} /> {m.availability === "coming_soon" ? "Coming soon" : m.flag_off ? "Switched off" : m.availability === "planned" ? `Phase ${m.phase}` : ["telematics", "portal_api"].includes(m.key) ? "Built in" : "Connect"}</button>
            </div>
          </div>);
      })}</div>
      {!shown.length && <div className="muted">No connector matches.</div>}
    </>
  );
}

function Wizard({ meta, env, onClose, onDone }) {
  const [step, setStep] = useState(2);                     // step 1 (choose source) happened in the gallery
  const [f, setF] = useState(() => ({ name: `${meta.name} (${env})`, environment: env,
    values: Object.fromEntries(meta.fields.map(x => [x.name, x.default ?? (x.type === "boolean" ? false : "")])) }));
  const [conn, setConn] = useState(null), [test, setTest] = useState(null), [err, setErr] = useState(""), [busy, setBusy] = useState(false);
  const save = async () => {
    setErr(""); setBusy(true);
    try {
      const config = {}, secrets = {};
      meta.fields.forEach(x => { const v = f.values[x.name]; if (v === "" || v == null) return; (x.secret ? secrets : config)[x.name] = x.type === "number" ? Number(v) : v; });
      const c = await api.diCreate({ connector_key: meta.key, name: f.name, environment: f.environment, config, secrets });
      setConn(c); setStep(3);
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };
  const runTest = async () => { setErr(""); setBusy(true); try { setTest(await api.diTest(conn.id)); } catch (e) { setErr(e.message); } setBusy(false); };
  const steps = ["Choose source", "Connection details", "Test connection", "Select data"];
  return (
    <SidePanel onClose={onClose} width={640} icon={<ConnectorLogo k={meta.key} size={44} title={meta.name} />} title={`Connect ${meta.name}`} sub={`${meta.category}${meta.read_only ? " · read-only" : ""}`}>
      <div className="di-wizard in-panel">
        <ol className="di-steps">{steps.map((s, i) => <li key={s} className={i + 1 < step ? "done" : i + 1 === step ? "on" : ""}>{i + 1 < step ? <Check size={12} /> : `${i + 1}.`} {s}</li>)}</ol>
        {step === 2 && <div className="di-form">
          <label>Connection name<input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></label>
          <label>Environment<select value={f.environment} onChange={e => setF({ ...f, environment: e.target.value })}><option>DEV</option><option>TEST</option><option>PROD</option></select></label>
          {f.environment === "PROD" && <div className="di-warn wide"><ShieldCheck size={13} /> Production source: it stays <b>pending</b> until a second ADMIN approves it (four-eyes). It cannot be tested or synced before.</div>}
          {meta.fields.filter(x => !x.group).map(x => <FieldInput key={x.name} x={x} f={f} setF={setF} />)}
          {GROUPS.filter(([g]) => meta.fields.some(x => x.group === g)).map(([g, title, note]) => (
            <details key={g} className="di-group wide" open={g === "tls" && f.environment !== "DEV"}>
              <summary>{title}</summary>{note && <div className="muted" style={{ fontSize: 11, margin: "4px 0 8px" }}>{note}</div>}
              <div className="di-form">{meta.fields.filter(x => x.group === g).map(x => <FieldInput key={x.name} x={x} f={f} setF={setF} />)}</div>
            </details>))}
          {f.environment !== "DEV" && meta.fields.some(x => x.name === "ssl") && (!f.values.ssl || !f.values.tls_verify) &&
            <div className="di-warn wide"><Lock size={13} /> TLS with certificate verification is required for {f.environment} - saving will be refused.</div>}
          {meta.read_only && <div className="di-note wide"><Lock size={12} /> Read-only connector: it never writes to the source (read-only session, always rolled back). Use a read-only account - the test warns if it can write.</div>}
        </div>}
        {step === 3 && conn && <div>
          <p className="muted">Saved as <b>{conn.id}</b> ({conn.environment}). Secrets: {Object.keys(conn.secrets_masked || {}).join(", ") || "none"} (masked).</p>
          {conn.approval_status === "PENDING" ? <div className="di-warn"><ShieldCheck size={13} /> Waiting for a second ADMIN to approve this production connection. Testing is blocked until then.</div>
            : <button className="primary" disabled={busy} onClick={runTest}>{busy ? "Testing…" : "Test connection"}</button>}
          {test && <TestResult t={test} />}
        </div>}
        {step === 4 && conn && <><SchemaPicker cid={conn.id} />{DB_KEYS.includes(meta.key) && <QueryBox cid={conn.id} />}</>}
        {err && <div className="err" style={{ marginTop: 8 }}>{err}</div>}
        <div className="row-flex" style={{ justifyContent: "space-between", marginTop: 14 }}>
          <button className="ghost" onClick={step === 2 ? onClose : () => setStep(step - 1)} disabled={step === 3 && !!conn}><ChevronLeft size={14} /> {step === 2 ? "Cancel" : "Back"}</button>
          {step === 2 && <button className="primary" disabled={busy || f.name.trim().length < 3} onClick={save}>Save & continue <ChevronRight size={14} /></button>}
          {step === 3 && <button className="primary" disabled={!test?.ok} onClick={() => setStep(4)}>Select data <ChevronRight size={14} /></button>}
          {step === 3 && conn?.approval_status === "PENDING" && <button className="ghost" onClick={() => onDone(conn)}>Finish (await approval)</button>}
          {step === 4 && <button className="primary" onClick={() => onDone(conn)}>Finish</button>}
        </div>
      </div>
    </SidePanel>
  );
}

const DB_KEYS = ["postgresql", "oracle", "sqlserver"];
const GROUPS = [["auth", "Authentication details", "Fill in only the fields for the authentication type chosen above. Secrets go to the vault."],
  ["tls", "Encryption (TLS)", "On by default with certificate verification. Only DEV may relax it."],
  ["ssh", "SSH tunnel (optional)", "For databases not reachable from the internet. The bastion's host key must match the pinned fingerprint."],
  ["advanced", "Advanced", ""]];

function FieldInput({ x, f, setF }) {
  const set = v => setF({ ...f, values: { ...f.values, [x.name]: v } });
  const v = f.values[x.name];
  return (
    <label className={x.type === "textarea" || x.type === "secret_text" ? "wide" : ""}>{x.label}{x.required && " *"}
      {x.secret && <span className="di-sec"><KeyRound size={11} /> stored encrypted in the vault, never shown again</span>}
      {x.type === "boolean" ? <input type="checkbox" checked={!!v} onChange={e => set(e.target.checked)} />
        : x.type === "select" ? <select value={v} onChange={e => set(e.target.value)}>{(x.options || []).map(o => <option key={o}>{o}</option>)}</select>
        : x.type === "secret_text" ? <textarea className="di-secret-text" rows={3} spellCheck={false} autoComplete="off" value={v ?? ""} onChange={e => set(e.target.value)} />
        : x.type === "textarea" ? <textarea className="di-code" rows={6} spellCheck={false} value={v ?? ""} onChange={e => set(e.target.value)} />
        : <input type={x.secret ? "password" : x.type === "number" ? "number" : "text"} autoComplete={x.secret ? "new-password" : "off"} value={v ?? ""} onChange={e => set(e.target.value)} />}
      {x.help && <span className="muted" style={{ fontSize: 11 }}>{x.help}</span>}</label>
  );
}

const SHOW = [["server", "Server"], ["user", "Account"], ["database", "Database"], ["tls_mode", "TLS"], ["latency_ms", "Latency (ms)"],
  ["readable_objects", "Readable tables"], ["via_ssh_tunnel", "Via SSH tunnel"], ["session", "Session"], ["category", "Error type"], ["error", "Technical message"]];

function TestResult({ t }) {
  const d = t.details || {}, warn = d.warnings || [], priv = d.privileges;
  return (
    <div className={`di-test ${t.ok ? (warn.length ? "warn" : "ok") : "bad"}`}>
      <b>{t.ok ? "Connection OK" : "Connection failed"}</b> · {t.message}
      {!t.ok && t.hint && <div>How to fix: {t.hint}</div>}
      {warn.map(w => <div key={w} className="di-warn" style={{ marginTop: 6 }}><ShieldCheck size={13} /> {w}</div>)}
      <dl className="di-kv">{SHOW.filter(([k]) => d[k] !== undefined && d[k] !== null && d[k] !== "").map(([k, l]) => <div key={k}><dt>{l}</dt><dd>{String(d[k] === true ? "yes" : d[k] === false ? "no" : d[k])}</dd></div>)}
        {"tls" in d && !d.tls_mode && <div><dt>TLS</dt><dd>{d.tls ? (d.certificate_verified ? "encrypted, certificate verified" : "encrypted") : "not encrypted"}</dd></div>}
        {priv && <div><dt>Privileges</dt><dd>{priv.can_write ? `CAN WRITE - ${priv.findings.join("; ")}` : "read-only (SELECT only)"}{priv.mitigations?.length ? ` · ${priv.mitigations.join(", ")}` : ""}</dd></div>}</dl>
    </div>
  );
}

function QueryBox({ cid }) {
  const [sql, setSql] = useState(""), [limit, setLimit] = useState(100), [res, setRes] = useState(null), [err, setErr] = useState(""), [busy, setBusy] = useState(false);
  const run = async () => { setErr(""); setRes(null); setBusy(true); try { setRes(await api.diQuery(cid, { sql, limit: Number(limit) })); } catch (e) { setErr(e.message); } setBusy(false); };
  return (
    <details className="di-group di-query">
      <summary>Custom query (SELECT only)</summary>
      <div className="muted" style={{ fontSize: 11, margin: "4px 0 8px" }}>One SELECT, checked by a SQL parser (no writes, no DDL, no locks, no file / sleep / remote functions), run in a read-only session
        with a timeout and a row cap. Sensitive columns are masked. The query text is written to the audit log; results are not stored.</div>
      <textarea rows={4} spellCheck={false} value={sql} onChange={e => setSql(e.target.value)} placeholder="SELECT lifnr, count(*) FROM demo_erp.ekko GROUP BY lifnr" aria-label="SQL query" />
      <div className="row-flex" style={{ gap: 8, marginTop: 6 }}>
        <label className="muted" style={{ fontSize: 12 }}>Row limit <input type="number" min={1} max={1000} value={limit} onChange={e => setLimit(e.target.value)} style={{ width: 80 }} /></label>
        <button className="primary chip-btn" disabled={busy || !sql.trim()} onClick={run}>{busy ? "Running…" : "Run query"}</button>
      </div>
      {err && <div className="err" style={{ marginTop: 6 }}>{err}</div>}
      {res && <><div className="ev-def">{res.row_count} row(s){res.truncated ? ` · capped at ${res.limit}` : ""} · {res.elapsed_ms} ms{res.masked_columns.length ? ` · masked: ${res.masked_columns.join(", ")}` : ""}</div>
        <div className="tbl-wrap ev-table" tabIndex={0} role="region" aria-label="Table"><table className="tbl"><thead><tr>{res.columns.map(c => <th key={c}>{c}</th>)}</tr></thead>
          <tbody>{res.rows.map((r, i) => <tr key={i}>{res.columns.map(c => <td key={c}>{String(r[c] ?? "–")}</td>)}</tr>)}</tbody></table></div></>}
    </details>
  );
}

function SchemaPicker({ cid }) {
  const s = useLoad(() => api.diSchema(cid), [cid]);
  const [obj, setObj] = useState(null);
  return (
    <div className="di-schema">
      <div className="di-objs">{s.loading && <div className="skeleton" style={{ height: 120 }} />}{s.err && <div className="err">{s.err}</div>}
        {(s.data || []).map(o => <button key={o.name} className={obj === o.name ? "on" : ""} onClick={() => setObj(o.name)}>
          <b>{o.name}</b><span>{o.fields.length} fields{o.row_estimate ? ` · ~${o.row_estimate} rows` : ""}</span></button>)}</div>
      <div className="grow" style={{ minWidth: 0 }}>{obj ? <Preview cid={cid} obj={obj} fields={(s.data || []).find(o => o.name === obj)?.fields || []} />
        : <div className="muted">Choose a table to see its fields and a masked preview. Mapping to the canonical model comes in Phase 3.</div>}</div>
    </div>
  );
}

function Preview({ cid, obj, fields }) {
  const p = useLoad(() => api.diPreview(cid, obj), [cid, obj]);
  const d = p.data;
  return (<>
    <div className="di-fields">{fields.map(x => <span key={x.name} className={`pill ${x.key ? "sev-LOW" : x.sensitive ? "sev-HIGH" : "st"}`}>{x.name} · {x.type}{x.key ? " · key" : ""}{x.sensitive ? " · masked" : ""}</span>)}</div>
    {p.loading && <div className="skeleton" style={{ height: 100 }} />}{p.err && <div className="err">{p.err}</div>}
    {d && <><div className="ev-def">First {d.row_count} rows{d.masked_columns.length ? ` · masked: ${d.masked_columns.join(", ")}` : ""}</div>
      <div className="tbl-wrap ev-table" tabIndex={0} role="region" aria-label="Table"><table className="tbl"><thead><tr>{d.columns.map(c => <th key={c}>{c}</th>)}</tr></thead>
        <tbody>{d.rows.slice(0, 100).map((r, i) => <tr key={i}>{d.columns.map(c => <td key={c}>{String(r[c] ?? "–")}</td>)}</tr>)}</tbody></table></div></>}
  </>);
}

function PreviewModal({ conn, onClose }) {
  const dlg = useDialog(onClose);
  return (
    <div className="twp-scrim" role="dialog" aria-modal="true" aria-label="Schema and preview" onClick={onClose}>
      <div className="card twp-modal" ref={dlg} tabIndex={-1} onClick={e => e.stopPropagation()}>
        <h3 style={{ display: "flex", justifyContent: "space-between" }}><span><Eye size={15} /> Schema & preview · {conn.id} · {conn.name}</span><button className="ghost icon-btn" onClick={onClose} aria-label="Close"><X size={15} /></button></h3>
        <SchemaPicker cid={conn.id} />
        {DB_KEYS.includes(conn.connector_key) && <QueryBox cid={conn.id} />}
      </div>
    </div>
  );
}

function Connections({ rows, user, reload, setMsg, onPreview, onDetails, onPrimary }) {
  const admin = user?.role === "ADMIN";
  const [files, setFiles] = useState(null);
  const run = async (p, ok) => { try { const r = await p; setMsg(typeof ok === "function" ? ok(r) : ok); reload(); } catch (e) { setMsg(e.message); } };
  return (
    <div className="card"><div className="tbl-wrap" tabIndex={0} role="region" aria-label="Table"><table className="tbl">
      <thead><tr><th>Connection</th><th>Connector</th><th>Env</th><th>Status</th><th>Approval</th><th>Secrets</th><th>Last test</th><th /></tr></thead>
      <tbody>
        <tr className="click di-primary-row" onClick={onPrimary} title="Show the datasets in the primary warehouse">
          <td><div className="row-flex" style={{ gap: 10, flexWrap: "nowrap" }}><ConnectorLogo k="neon" size={34} title="Neon PostgreSQL" />
            <div><button className="di-conn-link" onClick={e => { e.stopPropagation(); onPrimary(); }}>Neon DB · primary warehouse</button><div className="muted">built in · the database the agent reads</div></div></div></td>
          <td>PostgreSQL (Neon)<div className="muted">Database</div></td><td><span className="pill st">PRIMARY</span></td>
          <td><span className="pill sev-LOW">Connected</span><div className="muted" style={{ fontSize: 11 }}><Lock size={10} /> TLS</div></td>
          <td>Built in</td><td className="muted">app configuration</td><td className="muted">always on</td>
          <td><button className="ghost chip-btn" onClick={e => { e.stopPropagation(); onPrimary(); }}><Eye size={11} /> Details</button></td></tr>
        {rows.map(c => {
        const [sl, sc] = STATUS[c.status] || [c.status, "st"];
        const canApprove = admin && c.approval_status === "PENDING" && c.requested_by !== user.username;
        return (
          <tr key={c.id} className="click" onClick={e => !e.target.closest("button") && onDetails(c)} title="Show datasets, rows and runs for this connection">
            <td><div className="row-flex" style={{ gap: 10, flexWrap: "nowrap" }}><ConnectorLogo k={c.connector_key} size={34} title={c.connector_name} />
              <div><button className="di-conn-link" onClick={() => onDetails(c)}>{c.name}</button><div className="muted">{c.id} · by {c.created_by}</div></div></div></td>
            <td>{c.connector_name}<div className="muted">{c.category}</div></td>
            <td><span className={`pill ${c.environment === "PROD" ? "sev-CRITICAL" : c.environment === "TEST" ? "sev-MEDIUM" : "st"}`}>{c.environment}</span></td>
            <td><span className={`pill ${sc}`}>{sl}</span>
              {c.can_write && <div><span className="pill sev-CRITICAL" title={c.warnings || ""}>Account can write</span></div>}
              {c.tls_active === false && <div><span className="pill sev-HIGH" title="Connection not encrypted (DEV only)">No TLS</span></div>}
              {c.tls_active && <div className="muted" style={{ fontSize: 11 }}><Lock size={10} /> TLS</div>}</td>
            <td>{c.approval_status === "PENDING" ? <span title="Four-eyes: needs a second ADMIN">Pending · requested by {c.requested_by}</span> : c.approval_status === "APPROVED" ? (c.approved_by ? `Approved by ${c.approved_by}` : "Auto (non-prod)") : c.approval_status}</td>
            <td>{Object.keys(c.secrets_masked || {}).map(k => <div key={k} className="muted"><KeyRound size={10} /> {k} {c.secrets_masked[k]}</div>)}</td>
            <td>{c.last_test_at ? <span className={c.last_test_ok ? "" : "delta bad"}>{c.last_test_ok ? "OK" : "Failed"} · {String(c.last_test_at).slice(0, 16).replace("T", " ")}</span> : <span className="muted">never</span>}</td>
            <td><div className="row-flex" style={{ gap: 4, flexWrap: "wrap" }}>
              {canApprove && <><button className="primary chip-btn" onClick={() => run(api.diApprove(c.id, { decision: "APPROVED" }), `${c.id} approved.`)}>Approve</button>
                <button className="ghost chip-btn" onClick={() => run(api.diApprove(c.id, { decision: "REJECTED", note: prompt("Reason for rejecting:") || undefined }), `${c.id} rejected.`)}>Reject</button></>}
              {admin && c.approval_status === "APPROVED" && <button className="ghost chip-btn" onClick={() => run(api.diTest(c.id), r => `${c.id}: ${r.ok ? "connection OK" : `failed - ${r.message}${r.hint ? ` (fix: ${r.hint})` : ""}`}`)}>Test</button>}
              {admin && c.approval_status === "APPROVED" && <button className="ghost chip-btn" onClick={() => onPreview(c)}><Eye size={11} /> Preview</button>}
              {c.connector_key === "csv_excel" && c.approval_status === "APPROVED" && <button className="ghost chip-btn" onClick={() => setFiles(c)}><FileSpreadsheet size={11} /> Files</button>}
              {admin && <button className="ghost chip-btn" title="Delete connection (secret removed from the vault)" onClick={() => window.confirm(`Delete ${c.name}? Its secret is removed from the vault.`) && run(api.diDelete(c.id), `${c.id} deleted.`)}><Trash2 size={11} /></button>}
            </div></td></tr>);
      })}</tbody>
    </table></div>{files && <FilesModal conn={files} admin={admin} onClose={() => { setFiles(null); reload(); }} />}
</div>
  );
}

function FilesModal({ conn, admin, onClose }) {
  const dlg = useDialog(onClose);
  const f = useLoad(() => api.diFiles(conn.id), [conn.id]);
  const [msg, setMsg] = useState(""), [busy, setBusy] = useState(false);
  const upload = async e => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true); setMsg("");
    try { const r = await api.diUpload(conn.id, file); setMsg(`${r.name}: ${r.rows} rows, ${r.columns.length} columns - stored encrypted.`); f.reload(); } catch (err) { setMsg(err.message); }
    setBusy(false);
  };
  return (
    <div className="twp-scrim" role="dialog" aria-modal="true" aria-label="Uploaded files" onClick={onClose}>
      <div className="card twp-modal" ref={dlg} tabIndex={-1} onClick={e => e.stopPropagation()}>
        <h3 style={{ display: "flex", justifyContent: "space-between" }}><span><FileSpreadsheet size={15} /> Files · {conn.name}</span>
          <button className="ghost icon-btn" onClick={onClose} aria-label="Close"><X size={15} /></button></h3>
        <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>CSV / Excel (.xlsx), max 50 MB. Files are validated, then stored <b>encrypted</b>; nothing reaches KPI tables until a mapping runs (object = file name or a pattern like <code>po_*.csv</code>, watermark <code>_file_time</code>).</div>
        {admin && <label className="primary chip-btn di-upload">{busy ? "Uploading…" : "Upload file"}<input type="file" accept=".csv,.txt,.tsv,.xlsx" onChange={upload} disabled={busy} hidden /></label>}
        {msg && <div className="di-note" style={{ marginTop: 8 }}>{msg}</div>}
        <div className="tbl-wrap" tabIndex={0} role="region" aria-label="Table" style={{ marginTop: 10 }}><table className="tbl"><thead><tr><th>File</th><th>Rows</th><th>Columns</th><th>Size</th><th>Uploaded</th><th /></tr></thead>
          <tbody>{(f.data || []).map(x => <tr key={x.id}><td><b>{x.name}</b><div className="muted" style={{ fontSize: 10 }}>sha256 {x.sha256.slice(0, 12)}…</div></td><td>{x.row_count}</td>
            <td className="muted" style={{ fontSize: 11 }}>{(x.columns || []).join(", ")}</td><td>{(x.size_bytes / 1024).toFixed(1)} KB</td>
            <td>{String(x.uploaded_at).slice(0, 16).replace("T", " ")}<div className="muted">{x.uploaded_by}</div></td>
            <td>{admin && <button className="ghost chip-btn" title="Delete file (content removed)" onClick={async () => { if (!window.confirm(`Delete ${x.name}?`)) return; try { await api.diFileDelete(conn.id, x.id); f.reload(); } catch (err) { setMsg(err.message); } }}><Trash2 size={11} /></button>}</td></tr>)}
            {!(f.data || []).length && <tr><td colSpan={6} className="muted">No files yet.</td></tr>}</tbody></table></div>
      </div>
    </div>
  );
}

function Canonical() {
  const c = useLoad(() => api.diCanonical(), []);
  return (
    <div>
      <div className="muted" style={{ marginBottom: 10 }}>Every connector maps into these entities - they are the tables the KPI layer already reads. Lineage columns on every table: {(c.data?.lineage_columns || []).join(", ")}.</div>
      <div className="di-grid">{(c.data?.entities || []).map(e => (
        <div key={e.entity} className="card di-card canon">
          <b>{e.label}</b><span className="muted di-cat">sp.{e.table} · key {e.key.join(" + ")}</span>
          <div className="di-fieldlist">{e.fields.map(f => <span key={f.name} title={f.description} className={f.required ? "req" : ""}>{f.name}<em>{f.type}</em></span>)}</div>
          <div className="di-lic">Sources: {Object.entries(e.sources).map(([k, v]) => `${k}: ${v}`).join(" · ")}</div>
          <div className="di-feeds">Feeds: {e.feeds.join(" · ")}</div>
        </div>))}</div>
    </div>
  );
}

function Audit() {
  const a = useLoad(() => api.diAudit({}), []);
  return (
    <div className="card"><div className="tbl-wrap" tabIndex={0} role="region" aria-label="Table"><table className="tbl">
      <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Connection</th><th>Detail (never secret values)</th></tr></thead>
      <tbody>{(a.data || []).map(r => <tr key={r.id}><td>{String(r.ts).slice(0, 19).replace("T", " ")}</td><td>{r.actor}</td><td><span className="pill st">{r.action}</span></td>
        <td>{r.connection_id || "–"}</td><td className="muted" style={{ fontSize: 11 }}>{JSON.stringify(r.detail)}</td></tr>)}
        {!(a.data || []).length && <tr><td colSpan={5} className="muted">No activity yet.</td></tr>}</tbody>
    </table></div></div>
  );
}
