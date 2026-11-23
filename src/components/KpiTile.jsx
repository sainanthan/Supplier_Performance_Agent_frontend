import { useRef, useState } from "react";
import { Maximize2 } from "lucide-react";
import { fmt, useCountUp } from "../util";
import { Delta, Sparkline } from "./ui";
import KpiDetail from "./KpiDetail";

/* Glass KPI tile: 3D pointer tilt, sheen, count-up value, 4-week delta and a 12-week sparkline.
   Fixed height so every tile in a row lines up. Tiles with a sparkline open a detail pop-up on click. */
export function useTilt(max = 10) {
  const ref = useRef();
  const onMove = (e) => {
    const el = ref.current; if (!el) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    el.style.transform = `perspective(700px) rotateX(${(0.5 - y) * max}deg) rotateY(${(x - 0.5) * max}deg) translateZ(4px)`;
    el.style.setProperty("--mx", `${x * 100}%`); el.style.setProperty("--my", `${y * 100}%`);
  };
  const onLeave = () => { if (ref.current) ref.current.style.transform = ""; };
  return { ref, onMouseMove: onMove, onMouseLeave: onLeave };
}

export default function KpiTile({ label, value, unit, decimals = 1, hint, color = "var(--brand-purple)", icon: Icon,
  format, pulse, deltaUnit = "", about }) {
  const tilt = useTilt(10);
  const [open, setOpen] = useState(false);
  const v = useCountUp(typeof value === "number" ? value : null);
  const shown = value === null || value === undefined ? "–" : format ? format(v ?? value) : fmt(v ?? value, decimals);
  const finalShown = value === null || value === undefined ? "–" : format ? format(value) : fmt(value, decimals);
  const clickable = !!(pulse?.series?.length || about);
  const openIt = () => { if (tilt.ref.current) tilt.ref.current.style.transform = ""; setOpen(true); };
  return (
    <>
      <div className={"card kpi tilt" + (clickable ? " kpi-click" : "")} style={{ "--kpi-c": color }} {...tilt}
        {...(clickable ? { role: "button", tabIndex: 0, onClick: openIt, onKeyDown: e => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), openIt()),
          title: `${label}: click for weekly values and details` } : {})}>
        <div className="kpi-top">
          <span className="lbl">{label}</span>
          {Icon && <span className="kpi-ico" style={{ color }}><Icon size={16} /></span>}
        </div>
        <div className="kpi-mid">
          <div className="val">{shown}{unit && <small>{unit}</small>}</div>
          {pulse?.series && <Sparkline data={pulse.series} color={color} width={84} height={30} />}
        </div>
        <div className="kpi-foot">
          {pulse && <Delta value={pulse.delta} good={pulse.good} unit={deltaUnit} />}
          {hint && <span className="hint" title={hint}>{hint}</span>}
        </div>
        {clickable && <span className="kpi-more"><Maximize2 size={11} /> details</span>}
        <div className="shine" />
      </div>
      {open && <KpiDetail label={label} value={value} shown={<>{finalShown}{unit && <small>{unit}</small>}</>} unit={unit || ""} decimals={decimals}
        color={color} icon={Icon} pulse={pulse} deltaUnit={deltaUnit} hint={hint} about={about} onClose={() => setOpen(false)} />}
    </>
  );
}
