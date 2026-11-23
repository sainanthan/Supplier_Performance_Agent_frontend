// Pop-up opened by clicking a KPI tile: the 12-week sparkline drawn large, with the exact value of every week on hover,
// plus headline stats (latest, average, best, worst, last 4 vs prior 4 weeks) and what the KPI means.
import { createPortal } from "react-dom";
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Info, TrendingDown, TrendingUp, X } from "lucide-react";
import { fmt } from "../util";
import { Delta } from "./ui";
import { useDialog } from "./useDialog";

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const wk = p => { const d = new Date(String(p).slice(0, 10) + "T00:00:00"); return isNaN(d) ? String(p) : `${d.getDate()} ${MON[d.getMonth()]}`; };

function Tip({ active, payload, f, fd, seriesLabel }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return <div className="kd-tip">
    <span>Week of {wk(d.period)}</span>
    <b>{d.v == null ? "no data" : f(d.v)}</b>
    <em>{seriesLabel}</em>
    {d.chg != null && <i className={d.better ? "good" : "bad"}>{d.chg > 0 ? "▲" : "▼"} {fd(Math.abs(d.chg))} vs previous week</i>}
  </div>;
}

export default function KpiDetail({ label, value, shown, unit = "", decimals = 1, color, icon: Icon, pulse: pulseIn, deltaUnit = "", hint, about = {}, onClose }) {
  // the backend sends no 4-week delta for some series (NCRs, downtime): work it out from the weekly values
  const pulse = (() => {
    if (!pulseIn || pulseIn.delta != null) return pulseIn;
    const v = (pulseIn.series || []).map(d => d.v).filter(x => x != null).map(Number);
    if (v.length < 8) return pulseIn;
    const avg4 = a => a.reduce((s, x) => s + x, 0) / a.length;
    return { ...pulseIn, delta: Math.round((avg4(v.slice(-4)) - avg4(v.slice(-8, -4))) * 10) / 10 };
  })();
  deltaUnit = deltaUnit || unit;
  const ref = useDialog(onClose);
  const good = pulse?.good || "up";
  const f = v => `${fmt(v, decimals)}${unit}`;
  const fd = v => `${fmt(v, decimals)}${deltaUnit || unit}`;
  const raw = (pulse?.series || []).map(d => ({ period: d.period, v: d.v == null ? null : Number(d.v) }));
  const data = raw.map((d, i) => {
    const prev = i ? raw[i - 1].v : null;
    const chg = d.v != null && prev != null ? d.v - prev : null;
    return { ...d, label: wk(d.period), chg, better: chg != null && (good === "up" ? chg > 0 : chg < 0) };
  });
  const vals = data.filter(d => d.v != null);
  const avg = vals.length ? vals.reduce((s, d) => s + d.v, 0) / vals.length : null;
  const best = vals.length ? vals.reduce((a, b) => ((good === "up" ? b.v > a.v : b.v < a.v) ? b : a)) : null;
  const worst = vals.length ? vals.reduce((a, b) => ((good === "up" ? b.v < a.v : b.v > a.v) ? b : a)) : null;
  const last = vals.at(-1);
  const trendBetter = pulse?.delta != null && (good === "up" ? pulse.delta > 0 : pulse.delta < 0);
  const gid = "kdg" + label.replace(/\W/g, "");

  return createPortal(
    <div className="kd-scrim" onClick={onClose}>
      <div className="kd" role="dialog" aria-modal="true" aria-label={`${label} details`} ref={ref} tabIndex={-1}
        onClick={e => e.stopPropagation()} style={{ "--kd-c": color }}>
        <header className="kd-head">
          {Icon && <span className="kd-ic"><Icon size={18} /></span>}
          <div className="kd-title"><span>{label}</span>
            <div className="kd-val"><span>{shown}</span>{pulse && <Delta value={pulse.delta} good={good} unit={deltaUnit} />}
              {pulse?.delta != null && <em>last 4 weeks vs the 4 before</em>}</div>
          </div>
          <button className="ghost icon-btn" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </header>

        {vals.length >= 2 ? <>
          <div className="kd-stats">
            <div><span>Latest week</span><b>{f(last.v)}</b><em>week of {wk(last.period)}</em></div>
            <div><span>{data.length}-week average</span><b>{f(avg)}</b><em>dashed line on the chart</em></div>
            <div className="good"><span>Best week</span><b>{f(best.v)}</b><em>week of {wk(best.period)}</em></div>
            <div className="bad"><span>Worst week</span><b>{f(worst.v)}</b><em>week of {wk(worst.period)}</em></div>
          </div>

          <div className="kd-chart">
            <div className="kd-chart-h"><b>{about.series || label} · weekly</b><span>hover the line to see each week's value</span></div>
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={data} margin={{ top: 14, right: 18, bottom: 4, left: 0 }}>
                <defs><linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.3} /><stop offset="100%" stopColor={color} stopOpacity={0} />
                </linearGradient></defs>
                <CartesianGrid vertical={false} stroke="rgba(120,120,150,.15)" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--text-secondary)" }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis width={52} tick={{ fontSize: 11, fill: "var(--text-secondary)" }} tickLine={false} axisLine={false}
                  tickFormatter={v => fmt(v, decimals)} domain={["auto", "auto"]} />
                {avg != null && <ReferenceLine y={avg} stroke="var(--text-secondary)" strokeDasharray="4 4"
                  label={{ value: `avg ${f(avg)}`, position: "insideBottomLeft", fontSize: 10.5, fill: "var(--text-secondary)" }} />}
                <Tooltip content={<Tip f={f} fd={fd} seriesLabel={about.series || label} />} cursor={{ stroke: color, strokeDasharray: "3 3" }} />
                <Area type="monotone" dataKey="v" stroke={color} strokeWidth={2.5} fill={`url(#${gid})`} connectNulls
                  dot={{ r: 3.5, fill: "var(--white)", stroke: color, strokeWidth: 2 }}
                  activeDot={{ r: 6, fill: color, stroke: "var(--white)", strokeWidth: 2 }} isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </> : <p className="kd-none">No weekly history is available for this KPI. The headline value covers the whole selected period{hint ? ` (${hint})` : ""}.</p>}

        <div className="kd-about">
          {about.what && <p><Info size={14} /><span><b>What it means.</b> {about.what}</span></p>}
          {pulse && <p>{trendBetter ? <TrendingUp size={14} className="good" /> : <TrendingDown size={14} className="bad" />}
            <span><b>{good === "up" ? "Higher is better." : "Lower is better."}</b>{" "}
              {pulse.delta == null ? "Not enough weeks to compare the last 4 weeks with the 4 before."
                : Math.abs(pulse.delta) < 0.05 ? "Flat: the last 4 weeks match the 4 before."
                : `The last 4 weeks are ${trendBetter ? "better" : "worse"} than the 4 before by ${fmt(Math.abs(pulse.delta), 1)}${deltaUnit}.`}</span></p>}
          {hint && !/^vs prior/i.test(hint) && <p className="kd-hint">{hint}</p>}
        </div>

        {vals.length >= 2 && <details className="kd-table">
          <summary>Weekly values ({data.length} weeks)</summary>
          <div className="kd-weeks">{data.map((d, i) => <div key={i}><span>{wk(d.period)}</span><b>{d.v == null ? "–" : f(d.v)}</b></div>)}</div>
        </details>}
      </div>
    </div>, document.body);
}
