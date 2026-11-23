import { useEffect, useId, useState } from "react";
import { Filter, Search, Star, X } from "lucide-react";

/* Shared building blocks so every card has the same header, spacing and alignment. */

export function Card({ title, sub, icon: Icon, action, children, className = "", style, bodyClass = "", flush }) {
  return (
    <section className={`card ${className}`} style={style}>
      {(title || action) && (
        <header className="card-head">
          <div className="card-title">
            {Icon && <span className="card-ico"><Icon size={15} /></span>}
            <div>
              <h3>{title}</h3>
              {sub && <p>{sub}</p>}
            </div>
          </div>
          {action && <div className="card-action">{action}</div>}
        </header>
      )}
      <div className={`card-body ${flush ? "flush" : ""} ${bodyClass}`}>{children}</div>
    </section>
  );
}

export function PageHead({ eyebrow, title, sub, children }) {
  return (
    <div className="page-head">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h2>{title}</h2>
        {sub && <p>{sub}</p>}
      </div>
      {children && <div className="row-flex">{children}</div>}
    </div>
  );
}

/* Tiny inline SVG sparkline (theme-aware through currentColor). */
export function Sparkline({ data, color = "var(--brand-purple)", height = 34, width = 120 }) {
  const id = "sg" + useId().replace(/[^a-zA-Z0-9]/g, "");
  const pts = (data || []).map(d => d.v).filter(v => v !== null && v !== undefined);
  if (pts.length < 2) return <svg width={width} height={height} />;
  const lo = Math.min(...pts), hi = Math.max(...pts), span = hi - lo || 1;
  const step = width / (pts.length - 1);
  const xy = pts.map((v, i) => [i * step, height - 3 - ((v - lo) / span) * (height - 6)]);
  const line = xy.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${width},${height} L0,${height} Z`;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ color, overflow: "visible" }} aria-hidden>
      <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="currentColor" stopOpacity="0.28" /><stop offset="100%" stopColor="currentColor" stopOpacity="0" />
      </linearGradient></defs>
      <path d={area} fill={`url(#${id})`} />
      <path d={line} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={xy.at(-1)[0]} cy={xy.at(-1)[1]} r="3" fill="currentColor" />
    </svg>
  );
}

export function Delta({ value, good = "up", unit = "" }) {
  if (value === null || value === undefined) return null;
  const better = good === "up" ? value > 0 : value < 0;
  const flat = Math.abs(value) < 0.05;
  return (
    <span className={`delta ${flat ? "flat" : better ? "good" : "bad"}`}>
      {flat ? "●" : value > 0 ? "▲" : "▼"} {Math.abs(value).toLocaleString("en-IN", { maximumFractionDigits: 1 })}{unit}
    </span>
  );
}

export function Empty({ icon: Icon, title, children }) {
  return (
    <div className="empty">
      {Icon && <Icon size={28} />}
      <b>{title}</b>
      {children && <span>{children}</span>}
    </div>
  );
}

/* Watchlist (starred suppliers): per-browser convenience, synced across components. */
const WL_KEY = "watchlist";
const readWl = () => { try { return JSON.parse(localStorage.getItem(WL_KEY)) || []; } catch { return []; } };
export function useWatchlist() {
  const [list, setList] = useState(readWl);
  useEffect(() => {
    const sync = () => setList(readWl());
    window.addEventListener("watchlist", sync);
    return () => window.removeEventListener("watchlist", sync);
  }, []);
  const toggle = id => {
    const next = list.includes(id) ? list.filter(x => x !== id) : [...list, id];
    try { localStorage.setItem(WL_KEY, JSON.stringify(next)); } catch { /* storage unavailable */ }
    setList(next);
    window.dispatchEvent(new Event("watchlist"));
  };
  return { list, has: id => list.includes(id), toggle };
}

export function StarButton({ id, size = 16 }) {
  const wl = useWatchlist();
  const on = wl.has(id);
  return (
    <button className={`star ${on ? "on" : ""}`} title={on ? "Remove from watchlist" : "Add to watchlist"}
      onClick={e => { e.stopPropagation(); wl.toggle(id); }} aria-pressed={on}>
      <Star size={size} fill={on ? "currentColor" : "none"} />
    </button>
  );
}


/* One consistent filter row for every page. options = [[value, label], ...] */
export function FilterBar({ children, active = 0, onClear }) {
  return (
    <div className="filter-bar">
      <span className="fb-title"><Filter size={13} /> Filters</span>
      {children}
      {active > 0 && <button className="fb-clear" onClick={onClear}><X size={12} /> Clear ({active})</button>}
    </div>
  );
}
export function FSelect({ label, value, onChange, options, all = "All" }) {
  return (
    <label className={`fb-item ${value ? "set" : ""}`}><span>{label}</span>
      <select value={value} onChange={e => onChange(e.target.value)}>
        {all && <option value="">{all}</option>}
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
}
export function FSearch({ value, onChange, placeholder = "Search…" }) {
  return (
    <label className={`fb-item fb-search ${value ? "set" : ""}`}><Search size={13} />
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} />
    </label>
  );
}
export function FDate({ label, value, onChange }) {
  return <label className={`fb-item ${value ? "set" : ""}`}><span>{label}</span><input type="date" value={value} onChange={e => onChange(e.target.value)} /></label>;
}
export const supplierOptions = list => (list || []).map(s => [s.supplier_id, `${s.supplier_id} · ${s.supplier_name}`]);
export const uniq = (list, key) => [...new Set((list || []).map(x => x[key]).filter(Boolean))].sort().map(v => [v, v]);
