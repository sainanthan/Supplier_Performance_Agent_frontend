import { ArrowUpRight, Building2 } from "lucide-react";

/* Drill-through from agent answers. Two sources decide where a click goes:
   1. the tools the agent called (each tool's page comes from /api/architecture), and
   2. the words in the answer: supplier IDs / names open the supplier, KPI words open the page that shows them.
   Links use #sup/<id> and #go/<page> fragments, which the markdown renderer turns into in-app buttons. */
export const PAGE_LABEL = {
  command: "Overview", trends: "OTIF / PPM Trends", risk: "Risk Radar", tracker: "Network Tracker", review: "Review Pack",
  architecture: "Agent Architecture",
  integration: "Data Integration", settings: "Settings",
};

const WORDS = [
  [/\bOTIF\b/, "trends"], [/\bon[- ]time\b/i, "trends"], [/\bPPM\b/, "trends"], [/\btrends?\b/i, "trends"],
  [/\bscorecards?\b/i, "command"], [/\bgrades?\b/i, "command"], [/\bdefects?\b/i, "command"],
  [/\brisk (signals?|alerts?)\b/i, "risk"], [/\b(critical|high)[- ]risk\b/i, "risk"],
  [/\bexposure\b/i, "tracker"], [/\bpast[- ]due\b/i, "tracker"], [/\bproduction orders?\b/i, "tracker"],
  [/\bCAPAs?\b/, "risk"], [/\bNCRs?\b/, "risk"],
];

const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Add drill links to markdown: supplier IDs and names everywhere, the first mention of each KPI word once. */
export function linkify(md, suppliers = [], allowed = []) {
  if (!md) return md;
  const names = (suppliers || []).filter(s => s.supplier_name).sort((a, b) => b.supplier_name.length - a.supplier_name.length);
  const nameRx = names.length ? new RegExp(`\\b(${names.map(s => esc(s.supplier_name)).join("|")})\\b`, "g") : null;
  const byName = Object.fromEntries(names.map(s => [s.supplier_name, s.supplier_id]));
  const used = new Set();
  // leave existing links, images, code and table separator rows untouched
  return md.split(/(!?\[[^\]]*\]\([^)]*\)|`[^`]*`|^\|?\s*:?-{3,}.*$)/m).map((part, i) => {
    if (i % 2) return part;
    let p = part.replace(/\bSUP-\d{3}\b/g, id => `[${id}](#sup/${id})`);
    if (nameRx) p = p.replace(nameRx, n => `[${n}](#sup/${byName[n]})`);
    for (const [rx, page] of WORDS) {
      if (used.has(rx) || !allowed.includes(page)) continue;
      const pieces = p.split(/(\[[^\]]*\]\([^)]*\))/);           // never inside a link we just made
      let done = false;
      p = pieces.map((q, j) => (j % 2 || done) ? q : q.replace(rx, m => { done = true; return `[${m}](#go/${page})`; })).join("");
      if (done) used.add(rx);
    }
    return p;
  }).join("");
}

/** Markdown <a> renderer: in-app links become buttons, real links open in a new tab. */
export function drillAnchor(onNav, onSupplier) {
  return function A({ href = "", children }) {
    if (href.startsWith("#sup/")) return <button className="md-link sup" onClick={() => onSupplier?.(href.slice(5))} title="Open supplier details">{children}</button>;
    if (href.startsWith("#go/")) return <button className="md-link go" onClick={() => onNav?.(href.slice(4))} title={`Open ${PAGE_LABEL[href.slice(4)] || "page"}`}>{children}</button>;
    return <a href={href} target="_blank" rel="noreferrer">{children}</a>;
  };
}

/** Pages worth opening after an answer, most specific first: pages of the tools used, then pages named by KPI words. */
export function drillTargets({ answer = "", steps = [], catalog, allowed = [] }) {
  const out = [];
  const add = (page, why) => { if (page && allowed.includes(page) && !out.some(o => o.page === page)) out.push({ page, why }); };
  for (const s of steps || []) { const t = catalog?.tools?.[s.tool]; if (t) add(t.page, `used ${t.label.toLowerCase()}`); }
  for (const [rx, page] of WORDS) if (rx.test(answer)) add(page, "mentioned in the answer");
  return out.slice(0, 5);
}

export function suppliersIn(answer = "", suppliers = []) {
  const ids = new Set((answer.match(/\bSUP-\d{3}\b/g) || []));
  for (const s of suppliers || []) if (s.supplier_name && answer.includes(s.supplier_name)) ids.add(s.supplier_id);
  const name = Object.fromEntries((suppliers || []).map(s => [s.supplier_id, s.supplier_name]));
  return [...ids].slice(0, 6).map(id => ({ id, name: name[id] || id }));
}

export function DrillBar({ answer, steps, catalog, allowed, suppliers, onNav, onSupplier, children }) {
  const pages = drillTargets({ answer, steps, catalog, allowed });
  const sups = suppliersIn(answer, suppliers);
  if (!pages.length && !sups.length && !children) return null;
  return (
    <div className="drill-bar">
      <span className="eyebrow">Drill through</span>
      <div className="drill-chips">
        {pages.map(p => <button key={p.page} className="drill-chip" onClick={() => onNav?.(p.page)} title={p.why}>{PAGE_LABEL[p.page] || p.page} <ArrowUpRight size={12} /></button>)}
        {sups.map(s => <button key={s.id} className="drill-chip sup" onClick={() => onSupplier?.(s.id)} title={`Open ${s.id}`}><Building2 size={12} /> {s.name}</button>)}
        {children}
      </div>
    </div>
  );
}
