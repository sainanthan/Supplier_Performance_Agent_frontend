import { AlertTriangle, CalendarClock, CheckCircle2, CircleDot, CloudLightning, Factory, Hourglass, ListChecks, MessageSquareQuote, Repeat, Route, Search, Sparkles, Timer } from "lucide-react";
import { api } from "../api";
import { fmt, inr, useLoad } from "../util";
import SidePanel from "./SidePanel";

/* "Why is this late?" for one PO line: verdict, the journey (plan vs actual per stage), root cause with evidence,
   contributing factors, impact on our lines and what to do. Same facts the agent uses (delay_reasoning.explain). */
const dm = s => (s ? new Date(s).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) : "–");
const days = n => `${fmt(n, 0)} day${Math.abs(n) === 1 ? "" : "s"}`;
const ST = {
  DELIVERED_LATE: ["Delivered late", "bad"], OVERDUE: ["Overdue", "bad"], OPEN: ["Not due yet", "warn"], ON_TIME: ["On time", "ok"],
};
const FICON = { SECONDARY: AlertTriangle, PLAN: CalendarClock, DISRUPTION: CloudLightning, SUPPLIER_STATED: MessageSquareQuote, PATTERN: Repeat, PREDICTION: Sparkles };

function verdict(x) {
  if (x.status === "DELIVERED_LATE") return <>Delivered <b>{days(x.days_late)} late</b> · promised {dm(x.promised)}, received {dm(x.received)}</>;
  if (x.status === "OVERDUE") return <><b>{days(x.days_late)} overdue</b>, not yet received · promised {dm(x.promised)}{x.prediction ? <> · expected about {fmt(x.prediction.expected_delay_days, 0)} days late in total</> : null}</>;
  if (x.status === "ON_TIME") return <>Delivered <b>on time</b> · promised {dm(x.promised)}, received {dm(x.received)}</>;
  return <>Not due yet · promised {dm(x.promised)}{x.prediction ? <> · <b>{Math.round(x.prediction.p_late * 100)}% chance of arriving late</b>, about {fmt(x.prediction.expected_delay_days, 0)} days</> : null}</>;
}

export function WhyLateView({ x }) {
  const rc = x.root_cause, [lbl, tone] = ST[x.status] || ["", ""];
  return (
    <div className="whyl">
      <div className={`whyl-verdict ${tone}`}>
        <span className={`whyl-st ${tone}`}>{lbl}</span>
        <p>{verdict(x)}</p>
        {rc && <p className="whyl-main">Main cause: <b>{rc.label}</b> {rc.where}{rc.share_pct != null ? ` · ${rc.share_pct}% of the time lost` : ""}</p>}
      </div>

      <h4><Route size={14} /> The journey · planned vs actual</h4>
      <ol className="whyl-steps">
        {x.timeline.map(t => {
          const slip = t.added_days > 0, wait = !t.actual && t.waiting_days > 0, pend = !t.actual && !wait;
          const cls = slip ? "slip" : wait ? (t.reason_code ? "slip" : "wait") : pend ? "pend" : "ok";
          const Icon = cls === "ok" ? CheckCircle2 : cls === "slip" ? AlertTriangle : cls === "wait" ? Hourglass : CircleDot;
          return (
            <li key={t.stage} className={cls}>
              <span className="whyl-dot"><Icon size={13} /></span>
              <div className="whyl-sm">
                <div className="whyl-row"><b>{t.label}</b><span className="whyl-loc">{t.location}</span>
                  {slip && <em className="whyl-chip">+{days(t.added_days)}</em>}
                  {wait && t.reason_code && <em className="whyl-chip">{days(t.waiting_days)} so far</em>}</div>
                <div className="whyl-dates">Planned {dm(t.planned)} · {t.actual ? <>actual {dm(t.actual)}</> : wait ? "waiting" : "pending"}</div>
                {t.reason && <div className="whyl-reason">{t.reason}</div>}
              </div>
            </li>);
        })}
      </ol>

      {rc && <>
        <h4><Search size={14} /> Root cause</h4>
        <div className="whyl-root">
          <div className="whyl-root-h"><b>{rc.label}</b><span className="whyl-who">{rc.responsible}</span>{rc.ongoing && <span className="whyl-on">still ongoing</span>}</div>
          <p>{rc.evidence}</p>
          <span className="whyl-meta">{rc.stage} · {rc.location} · {rc.ongoing ? `${days(rc.days)} so far` : `+${days(rc.days)}`}{rc.reported_by ? ` · reported by ${String(rc.reported_by).toLowerCase()}` : ""}</span>
        </div>
      </>}

      {x.factors.length > 0 && <>
        <h4><ListChecks size={14} /> Contributing factors</h4>
        <ul className="whyl-factors">{x.factors.map((f, i) => { const I = FICON[f.type] || AlertTriangle; return (
          <li key={i}><I size={14} /><div><b>{f.title}</b><span>{f.detail}</span></div></li>); })}</ul>
      </>}

      {x.status !== "ON_TIME" && <>
        <h4><Factory size={14} /> Impact</h4>
        <div className="whyl-impact">
          <div><span>Order value</span><b>{inr(x.impact.value_inr)}</b></div>
          <div><span>Our line stoppage</span><b>{x.impact.downtime_hours ? `${fmt(x.impact.downtime_hours, 1)} h` : "none"}</b><em>{x.impact.lines.join(", ") || "no line stopped"}</em></div>
          <div><span>Plant</span><b>{x.plant}</b></div>
        </div>
      </>}

      {x.actions.length > 0 && <>
        <h4><Timer size={14} /> What to do</h4>
        <ol className="whyl-actions">{x.actions.map((a, i) => <li key={i}>{a}</li>)}</ol>
      </>}
      {x.note && <p className="whyl-note">{x.note}</p>}
    </div>
  );
}

export default function WhyLatePanel({ po, line, onClose }) {
  const d = useLoad(() => api.delayExplain(po, line), [po, line]);
  const x = d.data;
  return (
    <SidePanel onClose={onClose} width={720} icon={<span className="whyl-ic"><Search size={20} /></span>}
      title={`Why is ${po}/${line} late?`} sub={x ? `${x.material_name} · ${x.supplier_name} → ${x.plant}` : "Loading…"}>
      {d.err && <div className="err">{d.err}</div>}
      {!x && !d.err && <div className="skeleton" style={{ height: 420 }} />}
      {x && <WhyLateView x={x} />}
    </SidePanel>
  );
}

/* Pareto of root causes of late PO lines (supplier or portfolio). */
export function DelayCausesCard({ supplierId = "" }) {
  const d = useLoad(() => api.delayCauses(supplierId ? { supplier_id: supplierId } : {}), [supplierId]);
  const c = d.data;
  const CAT = { "Supplier-side": "#6f3dba", Logistics: "#1e88e5", Customs: "#f58a3a", "External (weather / road)": "#00a39b" };
  return (
    <section className="card whyc">
      <h3>Why deliveries are late <span className="muted">root cause of each late PO line · last {c?.days || 120} days</span></h3>
      {!c ? <div className="skeleton" style={{ height: 200 }} /> : !c.causes.length ? <p className="muted">No late deliveries with a recorded cause.</p> : <>
        <p className="whyc-sum"><b>{fmt(c.late_lines, 0)}</b> late lines lost <b>{fmt(c.delay_days, 0)}</b> days. Biggest cause: <b>{c.causes[0].label}</b> ({c.causes[0].share_pct}%).</p>
        <div className="whyc-split" aria-label="Who owns the delay">{c.by_category.map(s => (
          <i key={s.category} style={{ width: `${s.share_pct}%`, background: CAT[s.category] || "#8a93a6" }} title={`${s.category}: ${s.share_pct}%`} />))}</div>
        <div className="whyc-leg">{c.by_category.map(s => <span key={s.category}><i style={{ background: CAT[s.category] || "#8a93a6" }} />{s.category} {s.share_pct}%</span>)}</div>
        <ul className="whyc-list">{c.causes.slice(0, 8).map(k => (
          <li key={k.code}>
            <div className="whyc-l"><b>{k.label}</b><span>{k.responsible} · {k.lines} lines · {fmt(k.delay_days, 0)} days{!supplierId && k.top_supplier ? ` · most at ${k.top_supplier}` : ""}</span></div>
            <div className="whyc-bar"><i style={{ width: `${Math.max(3, (k.delay_days / c.causes[0].delay_days) * 100)}%`, background: CAT[k.category] || "#8a93a6" }} /></div>
            <b className="whyc-p">{k.share_pct}%</b>
          </li>))}</ul>
        {c.note && <p className="whyl-note">{c.note}</p>}
      </>}
    </section>
  );
}
