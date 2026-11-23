import { useState } from "react";
import { ArrowDown, Database, History, Lock, Search, ShieldCheck, Table2 } from "lucide-react";
import { api } from "../api";
import { fmt, useLoad } from "../util";
import ConnectorLogo from "./ConnectorLogo";
import SidePanel from "./SidePanel";

/* Connection details in the right-side panel. Two kinds:
   - the built-in primary warehouse (Neon DB): every table the agent reads, rows, source, which views / features use it;
   - a configured connection: datasets it feeds (source tables -> canonical entity -> target), rows, health, runs, audit. */
const HEALTH = { HEALTHY: "sev-LOW", STALE: "sev-MEDIUM", FAILING: "sev-HIGH", NEVER_RUN: "st" };
const RUN = { SUCCESS: "sev-LOW", PARTIAL: "sev-MEDIUM", FAILED: "sev-HIGH", RUNNING: "st" };
const ts = v => (v ? String(v).slice(0, 16).replace("T", " ") : "–");
const mb = b => (b == null ? "–" : b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1e3))} kB`);

export function PrimaryDetails({ onClose }) {
  const d = useLoad(() => api.diPrimary(), []);
  const [q, setQ] = useState(""), [kind, setKind] = useState("");
  const x = d.data, t = x?.totals || {};
  const rows = (x?.tables || []).filter(r => (!kind || r.kind === kind) && (!q || `${r.table} ${r.source} ${r.used_by.join(" ")} ${r.features.join(" ")}`.toLowerCase().includes(q.toLowerCase())));
  return (
    <SidePanel onClose={onClose} width={760} icon={<ConnectorLogo k="neon" size={44} title="Neon PostgreSQL" />}
      title="Neon DB · primary warehouse" sub={x ? <>{x.host} · database <b>{x.database}</b> · schema <b>{x.schema}</b> · PostgreSQL {String(x.server_version).split(" ")[0]} · {x.tls ? <><Lock size={11} /> TLS</> : "no TLS"} · <span className="okt">connected</span></> : "Loading…"}>
      {d.err && <div className="err">{d.err}</div>}
      {!x && !d.err && <div className="skeleton" style={{ height: 320 }} />}
      {x && <>
        <div className="cd-kpis">
          <div><span>Tables in use</span><b>{t.tables}</b><em>with records</em></div>
          <div><span>Records</span><b>{fmt(t.rows, 0)}</b><em>in those tables</em></div>
          <div><span>KPI views</span><b>{t.views}</b><em>{x.views.join(", ").slice(0, 60)}</em></div>
          <div><span>Database size</span><b>{mb(x.database_bytes)}</b><em>incl. app tables</em></div>
        </div>
        <div className="sp-note">The tables the agent reads, with their records. Empty and unused tables are not listed{x.hidden_tables ? ` (${x.hidden_tables} hidden)` : ""}.</div>
        <div className="sp-tools">
          <label className="fb-item fb-search"><Search size={13} /><input placeholder="Find a table, source or view…" value={q} onChange={e => setQ(e.target.value)} aria-label="Search tables" /></label>
          <div className="seg">{[["", "All"], ["transactions", "Transactions"], ["master data", "Master data"], ["reference", "Reference"]].map(([k, l]) =>
            <button key={k} className={kind === k ? "on" : ""} onClick={() => setKind(k)}>{l}</button>)}</div>
        </div>
        <div className="tbl-wrap"><table className="tbl pd-tbl">
          <thead><tr><th>Dataset (table)</th><th className="num">Records</th><th>Source</th><th>Used by</th></tr></thead>
          <tbody>{rows.map(r => (
            <tr key={r.table}>
              <td><code>{r.table.replace("sp.", "")}</code><div className="muted">{r.kind} · {mb(r.bytes)}</div></td>
              <td className="num"><b>{fmt(r.rows, 0)}</b></td>
              <td className="pd-src">{r.source}</td>
              <td>{r.used_by.map(v => <span key={v} className="pill st pd-chip">{v}</span>)}{r.features.map(f => <span key={f} className="pd-feat">{f}</span>)}
                {!r.used_by.length && !r.features.length && <span className="muted">–</span>}</td>
            </tr>))}</tbody>
        </table></div>
      </>}
    </SidePanel>
  );
}

export default function ConnectionDetails({ conn, onClose }) {
  const d = useLoad(() => api.diConnDetails(conn.id), [conn.id]);
  const x = d.data, t = x?.totals || {};
  return (
    <SidePanel onClose={onClose} icon={<ConnectorLogo k={conn.connector_key} size={44} title={conn.connector_name} />} title={conn.name}
      sub={<>{conn.id} · {conn.connector_name} · <span className={`pill ${conn.environment === "PROD" ? "sev-CRITICAL" : conn.environment === "TEST" ? "sev-MEDIUM" : "st"}`}>{conn.environment}</span>
        {conn.tls_active && <> · <Lock size={11} /> TLS</>} · {conn.last_test_ok ? <span className="okt">last test OK</span> : conn.last_test_at ? <span className="badt">last test failed</span> : "never tested"}</>}>
      {d.err && <div className="err">{d.err}</div>}
      {!x && !d.err && <div className="skeleton" style={{ height: 260 }} />}
      {x && <>
        <div className="cd-kpis three">
          <div><span>Datasets fed</span><b>{t.datasets}</b><em>mappings</em></div>
          <div><span>Source tables</span><b>{t.source_tables}</b><em>read by the mappings</em></div>
          <div><span>Rows previewed</span><b>{fmt(t.previewed, 0)}</b><em>{t.previews} dry run(s)</em></div>
          <div><span>Rows loaded</span><b>{fmt(t.loaded, 0)}</b><em>{t.runs} published run(s)</em></div>
          <div><span>Rows in targets</span><b>{fmt(t.rows_in_targets, 0)}</b><em>from this connection</em></div>
          <div><span>Quarantined</span><b className={t.quarantined ? "badt" : ""}>{fmt(t.quarantined, 0)}</b><em>failed data checks</em></div>
        </div>
        <h4 className="sp-h"><Database size={14} /> Datasets</h4>
        {!x.mappings.length && <div className="set-hint">No active mapping uses this connection yet. Create one in the Mappings tab.</div>}
        {x.mappings.map(m => (
          <div key={m.id} className="cd-map">
            <div className="cd-flow v">
              <div className="cd-node"><span>Source tables</span><div className="pd-codes">{(m.source_tables.length ? m.source_tables : [m.source_object || "custom query"]).map(s => <code key={s}>{s}</code>)}</div></div>
              <ArrowDown size={15} className="cd-arrow" />
              <div className="cd-node"><span>Canonical entity</span><b>{m.entity}</b><em>{m.fields} field(s) mapped · {m.mode?.toLowerCase()}</em></div>
              <ArrowDown size={15} className="cd-arrow" />
              <div className="cd-node"><span>Target table (Neon)</span><code>{m.target_table}</code><em>{fmt(m.target_rows_total, 0)} rows in total</em></div>
            </div>
            <div className="cd-meta">
              <b>{m.id} · {m.name}</b>
              {m.health && <span className={`pill ${HEALTH[m.health] || "st"}`} title={m.health_reason}>{m.health.replace("_", " ").toLowerCase()}</span>}
              {m.approval_status && m.approval_status !== "NONE" && <span className="pill st">{m.approval_status.toLowerCase()}</span>}
              <span>schedule {m.schedule || "manual"}</span><span>{m.previews} preview(s) · {fmt(m.previewed, 0)} rows read</span>
              <span>{m.runs} published · {fmt(m.inserted, 0)} inserted · {fmt(m.updated, 0)} updated</span>
              {m.last_run_at && <span>last run {ts(m.last_run_at)} ({m.last_run_status?.toLowerCase()})</span>}
            </div>
            {m.target_origin?.length > 0 && <div className="cd-origin"><span>Where the {fmt(m.target_rows_total, 0)} rows in {m.target_table} came from:</span>
              {m.target_origin.map((o, i) => <span key={i} className={o.connection_id === conn.id ? "me" : ""}>{o.source}{o.connection_id && o.connection_id !== conn.id ? ` (${o.connection_id})` : ""} · <b>{fmt(o.rows, 0)}</b></span>)}</div>}
          </div>))}
        <h4 className="sp-h"><History size={14} /> Recent runs {x.retired_runs > 0 && <span className="muted" style={{ fontWeight: 500, fontSize: 11.5 }}>· {x.retired_runs} older run(s) of retired mappings not shown</span>}</h4>
        {!x.recent_runs.length ? <div className="set-hint">No runs yet.</div> : <div className="tbl-wrap"><table className="tbl">
          <thead><tr><th>Mapping</th><th>When</th><th>Type</th><th className="num">Read</th><th className="num">Loaded</th><th>Status</th></tr></thead>
          <tbody>{x.recent_runs.map(r => <tr key={r.id} title={r.id}><td>{r.mapping_id}</td><td>{ts(r.started_at)}</td><td>{r.dry_run ? "preview" : "publish"}</td>
            <td className="num">{fmt(r.extracted, 0)}</td><td className="num">{fmt((r.inserted || 0) + (r.updated || 0), 0)}</td>
            <td><span className={`pill ${RUN[r.status] || "st"}`}>{r.status?.toLowerCase()}</span></td></tr>)}</tbody></table></div>}
        <h4 className="sp-h"><ShieldCheck size={14} /> Audit</h4>
        {!x.audit.length ? <div className="set-hint">No audit entries.</div> : x.audit.map((a, i) => (
          <div key={i} className="set-row"><Table2 size={12} /><b>{a.action}</b><span className="grow muted">{a.actor}</span><span className="muted">{ts(a.at)}</span></div>))}
      </>}
    </SidePanel>
  );
}

/* All connections of one connector (from a gallery card): pick one to see its details. */
export function ConnectorConnections({ meta, conns, onOpen, onClose }) {
  return (
    <SidePanel onClose={onClose} width={560} icon={<ConnectorLogo k={meta.key} size={44} title={meta.name} />} title={meta.name} sub={`${conns.length} connection(s) · ${meta.category}`}>
      {conns.map(c => (
        <button key={c.id} className="pd-conn" onClick={() => onOpen(c)}>
          <b>{c.name}</b><span>{c.id} · {c.environment} · {String(c.status).toLowerCase()}{c.last_test_ok ? " · last test OK" : ""}</span>
        </button>))}
    </SidePanel>
  );
}
