import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { FilterBar, FSelect, PageHead, supplierOptions } from "../components/ui";
const DigitalTwin = lazy(() => import("./DigitalTwin"));
const AlertInbox = lazy(() => import("../components/AlertInbox"));
const ActionsTab = lazy(() => import("../components/ActionsTab"));
const PredictionsTab = lazy(() => import("../components/PredictionsTab"));
import AlertLedger from "../components/AlertLedger";
const Followups = lazy(() => import("../components/Followups"));
const SourcingReviews = lazy(() => import("../components/SourcingReviews"));
import { BellRing, ClipboardPlus, MailQuestion } from "lucide-react";
import { api } from "../api";
import { fmt, inr, pct, SEV_VAR, useLoad } from "../util";

const TYPES = { OTIF_DETERIORATION: "Deteriorating OTIF", QUALITY_DETERIORATION: "Rising defects", REPEATED_LATE_DELIVERY: "Repeated late delivery",
  REPEATED_DEFECT: "Repeated defect", OVERDUE_CAPA: "Overdue CAPA", CONCENTRATION: "Concentration", PAST_DUE_SUPPLY: "Past-due supply", SUPPLY_DISRUPTION: "Line stoppage" };


export default function RiskRadar({ openSupplier, ask, theme, features, user }) {
  const [tab, setTab] = useState(() => { try { const t = sessionStorage.getItem("rr.tab"); if (t) return t; return sessionStorage.getItem("rr.seed") ? "actions" : "alerts"; } catch { return "alerts"; } });
  useEffect(() => { try { ["rr.tab", "rr.seed", "rr.mat"].forEach(k => sessionStorage.removeItem(k)); } catch { /* storage unavailable */ } }, []);
  const fu = useLoad(() => (features?.auto_followup ? api.followups().catch(() => null) : Promise.resolve(null)), [features?.auto_followup]);
  const fuBySup = useMemo(() => { const m = {}; for (const r of fu.data?.rows || []) { if (r.stage === "CLOSED") continue; const x = (m[r.supplier_id] ||= { asked: 0, confirmed: 0, escalated: 0 }); x.asked++; if (r.stage === "CONFIRMED") x.confirmed++; if (r.stage === "ESCALATED") x.escalated++; } return m; }, [fu.data]);
  const [sup, setSup] = useState("");
  const al = useLoad(() => api.alerts(), []);
  const mats = useLoad(() => api.materials(), []);
  const [sev, setSev] = useState(""); const [type, setType] = useState("");
  // hand-over from the Overview heatmap: a material for the sourcing comparison, or a prefilled corrective action
  const [mat, setMat] = useState(() => { try { const m = sessionStorage.getItem("rr.mat"); if (m) return m; } catch { /* storage unavailable */ } return "MAT-BAT-006"; });
  const canSource = ["ADMIN", "PROCUREMENT"].includes(user?.role);           // sourcing data is procurement-only (backend policy)
  const src = useLoad(() => (canSource ? api.sourcing(mat) : Promise.resolve([])), [mat]);
  const [flash, setFlash] = useState("");
  const [seed, setSeed] = useState(() => { try { const x = sessionStorage.getItem("rr.seed"); if (x) return JSON.parse(x); } catch { /* storage unavailable */ } return null; });   // alert -> prefilled corrective action
  const sups = useLoad(() => api.scorecard({}).catch(() => []), []);
  const askSupplier = a => api.qiDraft({ supplier_id: a.supplier_id }).then(d => { setSeed({ qi: d.id }); setTab("actions"); })
    .catch(e => { setFlash(e.message); setTimeout(() => setFlash(""), 3000); });
  const toAction = async a => {
    if (features?.workflow_extras) {            // 8D / CAPA request drafted from the alert and the supplier's own figures
      try {
        const d = await api.capaDraft(a.supplier_id, a.id);
        setSeed({ supplier_id: d.supplier_id, title: d.title, description: d.description, category: d.category, priority: d.priority, owner_role: d.owner_role });
        setTab("actions"); return;
      } catch { /* fall back to the simple draft */ }
    }
    setSeed({ supplier_id: a.supplier_id || "", title: a.title.slice(0, 190), description: `${a.detail}

${a.recommended_action}`,
    category: a.type.match(/DEFECT|QUALITY/) ? "QUALITY" : a.type === "OVERDUE_CAPA" ? "RESPONSIVENESS" : a.type === "CONCENTRATION" ? "COMMERCIAL" : "DELIVERY",
    priority: a.severity === "CRITICAL" ? "CRITICAL" : a.severity === "HIGH" ? "HIGH" : "MEDIUM", owner_role: a.type.match(/DEFECT|QUALITY|CAPA/) ? "QUALITY" : "PROCUREMENT" }); setTab("actions"); };

  const rows = (al.data || []).filter(a => (!sev || a.severity === sev) && (!type || a.type === type) && (!sup || a.supplier_id === sup));
  const supOpts = [...new Map((al.data || []).map(a => [a.supplier_id, { supplier_id: a.supplier_id, supplier_name: a.supplier_name }])).values()].sort((a, b) => a.supplier_id.localeCompare(b.supplier_id));
  // filters drive every panel: the heatmap and sourcing table keep only the suppliers the filters select
  const scope = useMemo(() => (sup ? new Set([sup]) : sev || type ? new Set(rows.map(a => a.supplier_id)) : null), [sup, sev, type, al.data]); // eslint-disable-line

  const notify = async a => {
    await api.notify({ recipient_role: a.type.match(/DEFECT|QUALITY|CAPA/) ? "QUALITY" : "PROCUREMENT", supplier_id: a.supplier_id,
      severity: a.severity, subject: `${a.supplier_name}: ${a.title}`, body: `${a.detail} Recommended: ${a.recommended_action}` });
    setFlash(`Notified owner about ${a.supplier_name}`); setTimeout(() => setFlash(""), 2500);
  };

  return (
    <>
      <PageHead eyebrow="Risk" title="Risk Radar" sub="Active risks, predictions, corrective actions and what-if simulation.">
        <div className="seg">{[["alerts", "Alerts"], ...(features?.actionable_alerts ? [["inbox", "Inbox"]] : []), ...(features?.predictive_layer ? [["predict", "Predictions"]] : []), ...(features?.auto_followup ? [["followups", "Follow-ups"]] : []), ...(canSource ? [["sourcing", "Sourcing reviews"]] : []), ["actions", "Actions"], ["sim", "What-if simulation"]].map(([k, l]) => <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{l}</button>)}</div>
      </PageHead>
      {tab === "sourcing" ? <Suspense fallback={<div className="skeleton" style={{ height: 420 }} />}><SourcingReviews openSupplier={openSupplier} ask={ask} onProposed={() => setTab("actions")} /></Suspense> :
       tab === "followups" ? <Suspense fallback={<div className="skeleton" style={{ height: 420 }} />}><Followups user={user} openSupplier={openSupplier} /></Suspense> :
       tab === "predict" ? <Suspense fallback={<div className="skeleton" style={{ height: 420 }} />}><PredictionsTab user={user} openSupplier={openSupplier} /></Suspense> :
       tab === "actions" ? <Suspense fallback={<div className="skeleton" style={{ height: 420 }} />}><ActionsTab user={user} features={features} openSupplier={openSupplier} suppliers={sups.data || []} seed={seed} clearSeed={() => setSeed(null)} /></Suspense> :
       tab === "inbox" ? <Suspense fallback={<div className="skeleton" style={{ height: 420 }} />}><AlertInbox user={user} openSupplier={openSupplier} /></Suspense> :
       tab === "sim" ? <Suspense fallback={<div className="skeleton" style={{ height: 420 }} />}><DigitalTwin theme={theme} ask={ask} embedded /></Suspense> : <>
      <FilterBar active={[sev, type, sup].filter(Boolean).length} onClear={() => { setSev(""); setType(""); setSup(""); }}>
        <FSelect label="Severity" value={sev} onChange={setSev} options={["CRITICAL", "HIGH", "MEDIUM", "LOW"].map(s => [s, s[0] + s.slice(1).toLowerCase()])} />
        <FSelect label="Signal" value={type} onChange={setType} options={Object.entries(TYPES)} />
        <FSelect label="Supplier" value={sup} onChange={setSup} options={supplierOptions(supOpts)} all="All suppliers" />
        <span className="fb-note">{rows.length} alerts</span>
      </FilterBar>
      {flash && <div className="card" style={{ marginBottom: 12, color: "var(--chart-c4)", fontWeight: 600 }}>{flash}</div>}
      <div className="grid rr-grid rr-stack">
        <div className="rr-alerts"><div className="card">
          <AlertLedger rows={rows} all={al.data || []} loading={al.loading} type={type} setType={setType} mats={mats.data}
            canAct={["ADMIN", "PROCUREMENT", "QUALITY"].includes(user?.role)} canSource={canSource}
            quality={a => !!(features?.quality_inquiry && ["QUALITY_DETERIORATION", "REPEATED_DEFECT"].includes(a.type) && ["ADMIN", "PROCUREMENT", "QUALITY"].includes(user?.role) && a.supplier_id)}
            followups={fuBySup} onFollowups={() => setTab("followups")} onSourcing={canSource ? () => setTab("sourcing") : null}
            onNotify={notify} onAction={toAction} onAskSupplier={askSupplier} onSupplier={openSupplier}
            onAsk={a => ask(`Investigate this alert for ${a.supplier_name} (${a.supplier_id}): "${a.title}". ${a.detail} Quantify exposure and recommend next steps.`)}
            onMaterial={m => { setMat(m); setTimeout(() => document.getElementById("rr-sourcing")?.scrollIntoView({ behavior: "smooth", block: "start" }), 60); }} />
        </div></div>

        {canSource && <div className="grid rr-side">
          <div className="card" id="rr-sourcing">
            <h3>Sourcing comparison <span className="muted">decision support only</span></h3>
            <select value={mat} onChange={e => setMat(e.target.value)} style={{ marginBottom: 10 }}>
              {(mats.data || []).map(m => <option key={m.material_id} value={m.material_id}>{m.material_id} · {m.material_name}</option>)}
            </select>
            <div className="tbl-wrap">
              <table className="tbl">
                <thead><tr><th>Supplier</th><th className="num">OTIF</th><th className="num">PPM</th><th className="num">Avg price</th><th className="num">Share</th><th>Latest quote</th></tr></thead>
                <tbody>{(src.data || []).filter(r => !scope || scope.has(r.supplier_id)).map(r => (
                  <tr key={r.supplier_id} className="click" onClick={() => openSupplier(r.supplier_id)}>
                    <td><b>{r.supplier_id}</b> <span className={`pill tier-${r.risk_tier}`}>{r.risk_tier}</span></td>
                    <td className="num">{pct(r.otif_pct)}</td><td className="num">{fmt(r.ppm, 0)}</td>
                    <td className="num">{inr(r.avg_price_inr)}</td><td className="num">{pct(r.share_pct)}</td>
                    <td className="muted nowrap">{r.latest_quote_status ? `${inr(r.quoted_unit_price_inr)} · ${r.latest_quote_status.toLowerCase()}` : "–"}</td>
                  </tr>))}</tbody>
              </table>
            </div>
          </div>
        </div>}
      </div>
      </>}
    </>
  );
}
