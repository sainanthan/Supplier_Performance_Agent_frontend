import { useEffect, useState } from "react";

export const fmt = (v, d = 1) => (v === null || v === undefined || Number.isNaN(v) ? "–" : Number(v).toLocaleString("en-IN", { maximumFractionDigits: d, minimumFractionDigits: 0 }));
export const pct = v => (v === null || v === undefined ? "–" : `${fmt(v, 1)}%`);
export const inr = v => {
  if (v === null || v === undefined) return "–";
  const n = Number(v);
  if (n >= 1e9) return `₹${fmt(n / 1e7, 0)} Cr`;
  if (n >= 1e7) return `₹${fmt(n / 1e7, 2)} Cr`;
  if (n >= 1e5) return `₹${fmt(n / 1e5, 1)} L`;
  return `₹${fmt(n, 0)}`;
};
export const SEV_VAR = { CRITICAL: "var(--depth-0)", HIGH: "var(--brand-orange)", MEDIUM: "var(--brand-blue)", LOW: "var(--cyan)", INFO: "var(--text-muted)" };
export const GRADE_VAR = { A: "var(--chart-c4)", B: "var(--brand-blue)", C: "var(--brand-orange)", D: "var(--depth-0)" };
export const SCORE_VAR = { delivery: "var(--chart-c1)", quality: "var(--chart-c3)", responsiveness: "var(--chart-c4)", commercial: "var(--chart-c2)" };
export const scoreColor = s => (s >= 85 ? "var(--chart-c4)" : s >= 70 ? "var(--brand-blue)" : s >= 55 ? "var(--brand-orange)" : "var(--depth-0)");

// Resolve a CSS token to a concrete color (needed by three.js). Re-evaluated when the theme changes.
export const token = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

// Generic loader hook: returns {data, err, loading, reload}.
export function useLoad(fn, deps = []) {
  const [state, set] = useState({ data: null, err: null, loading: true });
  const [n, setN] = useState(0);
  useEffect(() => {
    let live = true;
    set(s => ({ ...s, loading: true, err: null }));
    fn().then(data => live && set({ data, err: null, loading: false }))
        .catch(err => live && set({ data: null, err: err.message, loading: false }));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, n]);
  return { ...state, reload: () => setN(x => x + 1) };
}

// Animated count-up for KPI values.
export function useCountUp(target, ms = 900) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (target === null || target === undefined) return;
    let raf; const t0 = performance.now();
    const step = t => {
      const k = Math.max(0, Math.min(1, (t - t0) / ms)); const e = 1 - Math.pow(1 - k, 3); // k clamped: first frame can predate t0
      setV(target * e); if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return target === null || target === undefined ? null : v;
}
