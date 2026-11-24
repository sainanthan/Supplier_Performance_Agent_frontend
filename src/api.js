// All calls go to /api, which Vite proxies to FastAPI (guide §8.2). No service tokens in frontend code: the only token
// is the signed-in user's session token (issued by /api/auth/login, kept in sessionStorage).
// Client-side cache for GET requests: identical requests within CACHE_MS share one response (and one in-flight
// fetch), so switching pages is instant. Writes (POST/PATCH/PUT/DELETE) clear it so data never goes stale.
const CACHE_MS = 120000;
const _cache = new Map();
const LIVE = ["/api/notifications", "/api/actions", "/api/conversations", "/api/health", "/api/twin/scenarios", "/api/ai-usage",
  "/api/promise-changes", "/api/portal", "/api/quality-inquiries", "/api/runs", "/api/dq", "/api/jobs", "/api/recon", "/api/config", "/api/exclusions", "/api/users", "/api/aliases",
  "/api/features", "/api/alert-events", "/api/integration", "/api/disruptions", "/api/saved-views", "/api/vehicles", "/api/tracker/shipments", "/api/tracker/lanes"];
export function clearClientCache() { _cache.clear(); }

// ---- session
const TOKEN_KEY = "spa_session";
export function getSession() { try { return JSON.parse(sessionStorage.getItem(TOKEN_KEY) || "null"); } catch { return null; } }
export function setSession(s) { try { s ? sessionStorage.setItem(TOKEN_KEY, JSON.stringify(s)) : sessionStorage.removeItem(TOKEN_KEY); } catch { /* storage unavailable */ } _cache.clear(); }
function authHeaders() { const s = getSession(); return s?.token ? { Authorization: `Bearer ${s.token}` } : {}; }
function onUnauthorized() { setSession(null); window.dispatchEvent(new Event("auth:logout")); }
// A hosted backend on a free plan sleeps when idle and takes up to about a minute to wake; the proxy in front of it answers
// 502/503/504 meanwhile. Sign-in keeps retrying for up to 2 minutes and reports progress through onWait(seconds).
export async function login(username, password, onWait) {
  const t0 = Date.now(), WAKE = [502, 503, 504];
  for (;;) {
    let r = null;
    try { r = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password }) }); }
    catch { r = null; }                                                      // network error while the server starts
    if (r && !WAKE.includes(r.status)) {
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.detail || `Sign-in failed (${r.status})`);
      setSession(d);
      return d;
    }
    const waited = Math.round((Date.now() - t0) / 1000);
    if (waited > 120) throw new Error("The server did not wake up in time. Please try again in a minute.");
    onWait?.(waited);
    await new Promise(res => setTimeout(res, 4000));
  }
}

async function req(path, opts = {}) {
  const method = (opts.method || "GET").toUpperCase();
  const cacheable = method === "GET" && !LIVE.some(p => path.startsWith(p));
  if (cacheable) {
    const hit = _cache.get(path);
    if (hit && Date.now() - hit.t < CACHE_MS) return hit.p;
    const p = rawReq(path, opts).catch(e => { _cache.delete(path); throw e; });
    _cache.set(path, { t: Date.now(), p });
    return p;
  }
  if (method !== "GET" && !path.startsWith("/api/twin/simulate") && !path.startsWith("/api/scorecard/simulate")) _cache.clear();
  return rawReq(path, opts);
}

async function rawReq(path, opts = {}) {
  const isForm = typeof FormData !== "undefined" && opts.body instanceof FormData;     // file uploads: browser sets the multipart boundary
  const r = await fetch(path, { ...opts, headers: { ...(isForm ? {} : { "Content-Type": "application/json" }), ...authHeaders() } });
  if (r.status === 401 && !path.startsWith("/api/auth/login")) { onUnauthorized(); throw new Error("Session expired - please sign in again"); }
  if (!r.ok) {
    let msg = `${r.status} ${r.statusText}`;
    try { msg = (await r.json()).detail || msg; } catch { /* ignore */ }
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }
  return r.json();
}
const qs = o => {
  const p = Object.entries(o || {}).filter(([, v]) => v !== undefined && v !== null && v !== "");
  return p.length ? "?" + new URLSearchParams(p).toString() : "";
};
const body = (method, data) => ({ method, body: JSON.stringify(data) });

export const api = {
  health: () => req("/api/health"),
  overview: f => req("/api/overview" + qs(f)),
  scorecard: f => req("/api/scorecard" + qs(f)),
  trends: f => req("/api/trends" + qs(f)),
  alerts: f => req("/api/alerts" + qs(f)),
  defects: f => req("/api/defects" + qs(f)),
  plants: () => req("/api/plants"),
  materials: () => req("/api/materials"),
  sourcing: id => req(`/api/materials/${id}/sourcing`),
  concentration: () => req("/api/concentration"),
  materialSpendTrends: f => req("/api/concentration/trends" + qs(f)),
  supplier: (id, f) => req(`/api/suppliers/${id}` + qs(f)),
  reviewPack: (id, f) => req(`/api/suppliers/${id}/review-pack` + qs(f)),
  narrative: id => req(`/api/suppliers/${id}/review-pack/narrative`, { method: "POST" }),
  actions: f => req("/api/actions" + qs(f)),
  actionStats: () => req("/api/actions/stats"),
  createAction: d => req("/api/actions", body("POST", d)),
  updateAction: (id, d) => req(`/api/actions/${id}`, body("PATCH", d)),
  notifications: () => req("/api/notifications"),
  notify: d => req("/api/notifications", body("POST", d)),
  readAll: () => req("/api/notifications/read-all", { method: "POST" }),
  config: () => req("/api/config/scorecard"),
  saveConfig: d => req("/api/config/scorecard", body("PUT", d)),
  exclusions: () => req("/api/exclusions"),
  addExclusion: d => req("/api/exclusions", body("POST", d)),
  delExclusion: id => req(`/api/exclusions/${id}`, { method: "DELETE" }),
  revokeExclusion: (id, reason) => req(`/api/exclusions/${id}/revoke`, body("POST", { reason })),
  configVersions: () => req("/api/config/versions"),
  me: () => req("/api/auth/me"),
  users: () => req("/api/users"),
  evidence: (id, metric) => req(`/api/evidence/${id}/${metric}`),
  runs: () => req("/api/runs"),
  dq: () => req("/api/dq"),
  jobs: () => req("/api/jobs"),
  runJob: job => req(`/api/jobs/${job}/run`, { method: "POST" }),
  recon: () => req("/api/recon"),
  runRecon: () => req("/api/recon/run", { method: "POST" }),
  aliases: () => req("/api/aliases"),
  addAlias: d => req("/api/aliases", body("POST", d)),
  promiseChanges: f => req("/api/promise-changes" + qs(f)),
  createPromiseChange: d => req("/api/promise-changes", body("POST", d)),
  decidePromiseChange: (id, d) => req(`/api/promise-changes/${id}`, body("PATCH", d)),
  portal: () => req("/api/portal/me"),
  portalNcrRespond: (ncr, d) => req(`/api/portal/ncr/${ncr}/respond`, body("POST", d)),
  portalActionRespond: (id, d) => req(`/api/portal/actions/${id}/respond`, body("POST", d)),
  portalPromiseChange: d => req("/api/portal/promise-change", body("POST", d)),
  portalQi: () => req("/api/portal/quality-inquiries"),
  fleet: () => req("/api/portal/fleet"),
  followups: () => req("/api/followups"),
  sourcingReviews: () => req("/api/sourcing-reviews"),
  sourcingPropose: d => req("/api/sourcing-reviews/propose", body("POST", d)),
  followupsRun: () => req("/api/followups/run", { method: "POST" }),
  portalFollowups: () => req("/api/portal/followups"),
  portalFollowupRespond: (id, d) => req(`/api/portal/followups/${id}/respond`, body("POST", d)),
  fleetDispatch: d => req("/api/portal/fleet/dispatch", body("POST", d)),
  fleetPositions: (vid, d) => req(`/api/portal/fleet/${vid}/positions`, body("POST", d)),
  fleetArrived: vid => req(`/api/portal/fleet/${vid}/arrived`, body("POST", {})),
  portalQiRespond: (id, d) => req(`/api/portal/quality-inquiries/${id}/respond`, body("POST", d)),
  qiList: f => req("/api/quality-inquiries" + qs(f)),
  qiDraft: d => req("/api/quality-inquiries", body("POST", d)),
  qiSend: (id, d) => req(`/api/quality-inquiries/${id}/send`, body("POST", d)),
  qiClose: (id, d) => req(`/api/quality-inquiries/${id}/close`, body("POST", d)),
  qiLink: id => req(`/api/quality-inquiries/${id}/link`),
  delayExplain: (po, line) => req(`/api/delays/${encodeURIComponent(po)}/${line}`),
  delayCauses: f => req("/api/delays/causes" + qs(f)),
  predModel: () => req("/api/predictions/model"),
  predLate: f => req("/api/predictions/late" + qs(f)),
  predSuppliers: () => req("/api/predictions/suppliers"),
  predQuality: () => req("/api/predictions/quality"),
  predRetrain: () => req("/api/predictions/retrain", { method: "POST" }),
  qiBulkDraft: d => req("/api/quality-inquiries/bulk-draft", body("POST", d)),
  qiSendAll: d => req("/api/quality-inquiries/send-all", body("POST", d)),
  contacts: () => req("/api/supplier-contacts"),
  contactSave: (sid, d) => req(`/api/supplier-contacts/${sid}`, body("PUT", d)),
  // ---- enhancement programme (each behind a feature flag)
  features: () => req("/api/features"),
  story: f => req("/api/story" + qs(f)),
  architecture: () => req("/api/architecture"),
  dataReadiness: () => req("/api/data-readiness"),
  setFeature: (key, enabled) => req(`/api/features/${key}`, body("PUT", { enabled })),
  metrics: () => req("/api/metrics"),
  metricQuery: (m, f) => req(`/api/metrics/${m}/query` + qs(f)),
  metricRecords: (m, f) => req(`/api/metrics/${m}/records` + qs(f)),
  dashboard: (kind, f) => req(`/api/dashboards/${kind}` + qs(f)),
  alertEvents: f => req("/api/alert-events" + qs(f)),
  alertAction: (id, d) => req(`/api/alert-events/${id}/action`, body("POST", d)),
  assignees: () => req("/api/alert-events/users"),
  // ---- network twin T3
  disruptions: () => req("/api/disruptions"),
  refreshDisruptions: () => req("/api/disruptions/refresh", { method: "POST" }),
  addDisruption: d => req("/api/disruptions", body("POST", d)),
  removeDisruption: id => req(`/api/disruptions/${id}`, { method: "DELETE" }),
  shipmentSource: (po, line) => req(`/api/tracker/shipments/${encodeURIComponent(po)}/${line}/source`),
  laneRecords: (sid, plant) => req(`/api/tracker/lanes/${sid}/${plant}/records`),
  savedViews: page => req("/api/saved-views" + qs({ page })),
  saveView: d => req("/api/saved-views", body("POST", d)),
  deleteView: id => req(`/api/saved-views/${id}`, { method: "DELETE" }),
  vehicles: () => req("/api/vehicles"),
  createVehicle: d => req("/api/vehicles", body("POST", d)),
  startTrip: (id, shipment_ids) => req(`/api/vehicles/${id}/trip`, body("POST", { shipment_ids })),
  endTrip: id => req(`/api/vehicles/${id}/end-trip`, { method: "POST" }),
  rotateVehicleKey: id => req(`/api/vehicles/${id}/rotate-key`, { method: "POST" }),
  vehicleTrack: id => req(`/api/vehicles/${id}/track`),
  vehiclesSetup: () => req("/api/vehicles/setup"),
  trackerFresh: f => rawReq("/api/tracker" + qs(f)),
  // ---- data integration (flag data_integration)
  diSummary: () => req("/api/integration/summary"),
  diCatalog: () => req("/api/integration/catalog"),
  diCanonical: () => req("/api/integration/canonical"),
  diConnections: () => req("/api/integration/connections"),
  diCreate: d => req("/api/integration/connections", body("POST", d)),
  diUpdate: (id, d) => req(`/api/integration/connections/${id}`, body("PATCH", d)),
  diDelete: id => req(`/api/integration/connections/${id}`, { method: "DELETE" }),
  diApprove: (id, d) => req(`/api/integration/connections/${id}/approve`, body("POST", d)),
  diTest: id => req(`/api/integration/connections/${id}/test`, { method: "POST" }),
  diSchema: id => req(`/api/integration/connections/${id}/schema`),
  diConnDetails: id => req(`/api/integration/connections/${id}/details`),
  diPrimary: () => req("/api/integration/primary"),
  trackerSupplierTwin: sid => req(`/api/tracker/suppliers/${sid}/twin`),
  agentEmail: d => req("/api/agent/email", body("POST", d)),
  diPreview: (id, object) => req(`/api/integration/connections/${id}/preview` + qs({ object })),
  diAudit: f => req("/api/integration/audit" + qs(f)),
  diQuery: (id, d) => req(`/api/integration/connections/${id}/query`, body("POST", d)),
  diMappings: () => req("/api/integration/mappings"),
  diMappingSuggest: d => req("/api/integration/mappings/suggest", body("POST", d)),
  diMappingPreview: d => req("/api/integration/mappings/preview", body("POST", d)),
  diMappingCreate: d => req("/api/integration/mappings", body("POST", d)),
  diMappingUpdate: (id, d) => req(`/api/integration/mappings/${id}`, body("PATCH", d)),
  diMappingDelete: id => req(`/api/integration/mappings/${id}`, { method: "DELETE" }),
  diMappingApprove: (id, d) => req(`/api/integration/mappings/${id}/approve`, body("POST", d)),
  diMappingRun: (id, d) => req(`/api/integration/mappings/${id}/run`, body("POST", d)),
  diRuns: f => req("/api/integration/runs" + qs(f)),
  diQuarantine: f => req("/api/integration/quarantine" + qs(f)),
  diQuarantineResolve: (id, d) => req(`/api/integration/quarantine/${id}`, body("POST", d)),
  diRelease: t => req(`/api/integration/ownership/${t}/release`, { method: "POST" }),
  diHealth: () => req("/api/integration/health"),
  diHealthCheck: () => req("/api/integration/health/check", { method: "POST" }),
  diSettings: () => req("/api/integration/settings"),
  diSettingsSave: d => req("/api/integration/settings", body("PUT", d)),
  diDqRules: f => req("/api/integration/dq-rules" + qs(f)),
  diDqRuleCreate: d => req("/api/integration/dq-rules", body("POST", d)),
  diDqRuleUpdate: (id, d) => req(`/api/integration/dq-rules/${id}`, body("PATCH", d)),
  diDqRuleDelete: id => req(`/api/integration/dq-rules/${id}`, { method: "DELETE" }),
  diQuarantineQueue: f => req("/api/integration/quarantine-queue" + qs(f)),
  diQuarantineBulk: d => req("/api/integration/quarantine-bulk", body("POST", d)),
  diLineageSearch: f => req("/api/integration/lineage/search" + qs(f)),
  diLineage: f => req("/api/integration/lineage" + qs(f)),
  diFiles: id => req(`/api/integration/connections/${id}/files`),
  diUpload: (id, file) => { const fd = new FormData(); fd.append("file", file); return req(`/api/integration/connections/${id}/files`, { method: "POST", body: fd }); },
  diFileDelete: (id, fid) => req(`/api/integration/connections/${id}/files/${fid}`, { method: "DELETE" }),
  plantTwin: (id, f) => req(`/api/plants/${id}/twin` + qs(f)),
  plantTwinRecords: (id, f) => req(`/api/plants/${id}/twin/records` + qs(f)),            // uncached: used for live GPS refresh
  exportPack: async (id, f) => {         // binary download with the session token
    const r = await fetch(`/api/suppliers/${id}/review-pack/export` + qs(f), { headers: authHeaders() });
    if (r.status === 401) { onUnauthorized(); throw new Error("Session expired"); }
    if (!r.ok) { let m = `${r.status}`; try { m = (await r.json()).detail || m; } catch { /* binary */ } throw new Error(m); }
    const blob = await r.blob();
    const name = (r.headers.get("Content-Disposition") || "").match(/filename="([^"]+)"/)?.[1] || `${id}_review.${f.fmt}`;
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; a.click();
    return name;
  },
  poLines: f => req("/api/po-lines" + qs(f)),
  capaDraft: (sid, alertId) => req(`/api/suppliers/${sid}/capa-draft` + qs({ alert_id: alertId })),
  digest: role => req(`/api/digest/${role}`),
  evidence: (po, line) => req(`/api/po-evidence/${encodeURIComponent(po)}/${line}`),
  evidencePdf: async (po, line) => {      // binary download with the session token
    const r = await fetch(`/api/po-evidence/${encodeURIComponent(po)}/${line}/pdf`, { headers: authHeaders() });
    if (r.status === 401) { onUnauthorized(); throw new Error("Session expired"); }
    if (!r.ok) { let m = `${r.status}`; try { m = (await r.json()).detail || m; } catch { /* binary */ } throw new Error(m); }
    const blob = await r.blob();
    const name = `evidence_${po}_${line}.pdf`;
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; a.click();
    return name;
  },
  pulse: f => req("/api/pulse" + qs(f)),
  simulate: d => req("/api/scorecard/simulate", body("POST", d)),
  compare: ids => req("/api/compare" + qs({ ids: ids.join(",") })),
  aiUsage: () => req("/api/ai-usage"),
  clearCache: () => { _cache.clear(); return req("/api/cache/clear", { method: "POST" }); },
  bootstrap: f => req("/api/bootstrap" + qs(f)),
  tracker: f => req("/api/tracker" + qs(f)),
  twinNetwork: () => req("/api/twin/network"),
  twinFidelity: () => req("/api/twin/fidelity"),
  twinState: id => req(`/api/twin/state/${id}`),
  twinPresets: () => req("/api/twin/presets"),
  twinSimulate: d => req("/api/twin/simulate", body("POST", d)),
  twinScenarios: () => req("/api/twin/scenarios"),
  twinSave: d => req("/api/twin/scenarios", body("POST", d)),
  twinDecide: (id, d) => req(`/api/twin/scenarios/${id}`, body("PATCH", d)),
  convs: () => req("/api/conversations"),
  msgs: id => req(`/api/conversations/${id}/messages`),
  delConv: id => req(`/api/conversations/${id}`, { method: "DELETE" }),
};

// Streams agent events (SSE over fetch POST). onEvent receives {type, ...}.
export async function streamChat(conversation_id, message, onEvent, signal) {
  const r = await fetch("/api/chat/stream", {
    method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ conversation_id, message }), signal,
  });
  if (r.status === 401) { onUnauthorized(); throw new Error("Session expired - please sign in again"); }
  if (r.status === 403) throw new Error("Your role cannot use the agent chat.");
  if (!r.ok || !r.body) throw new Error(`Request failed (${r.status})`);
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const chunk = buf.slice(0, i); buf = buf.slice(i + 2);
      const line = chunk.split("\n").find(l => l.startsWith("data:"));
      if (line) { try { onEvent(JSON.parse(line.slice(5).trim())); } catch { /* ignore */ } }
    }
  }
}
