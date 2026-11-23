// Renders an agent answer as a clean, scannable card: verdict callout, section cards with icons,
// key-number tiles, and every markdown table drawn as a bar chart + table. All formatting happens here, so even a
// badly formatted model reply (raw JSON, escaped "\n", one long paragraph) reaches the user readable.
import { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, BarChart3, CheckCircle2, Clock, Factory, Info, ListChecks, Search, ShieldAlert, TrendingUp, Truck } from "lucide-react";
import { linkify } from "./drill";

/* ---------- 1. clean the raw text ---------- */
function unescapeJson(t) {
  t = t.replace(/"\s*}?\s*$/, "");
  return t.replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\n/g, "\n").replace(/\\t/g, "  ").replace(/\\r/g, "").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
}

export function cleanAnswer(raw) {
  let s = (raw || "").replace(/^```(?:json|markdown)?\s*|```\s*$/g, "").trim();
  if (s.startsWith("{")) {                                   // a JSON envelope leaked through: keep only the answer
    try {
      const o = JSON.parse(s);
      if (o && typeof o.answer === "string") s = o.answer;
    } catch {
      const m = s.match(/"answer"\s*:\s*"([\s\S]*)/);
      s = m ? unescapeJson(m[1]) : "I could not format this answer. Please ask again.";
    }
  }
  if (!s.includes("\n") && s.includes("\\n")) s = unescapeJson(s);      // escaped newlines in plain text
  // rupees in billions/millions -> crore (the business reads Cr / L)
  s = s.replace(/₹\s?(\d+(?:\.\d+)?)\s?(B|bn|billion)\b/g, (_, v) => `₹${(parseFloat(v) * 100).toFixed(1)} Cr`)
    .replace(/₹\s?(\d+(?:\.\d+)?)\s?(M|mn|million)\b/g, (_, v) => `₹${(parseFloat(v) / 10).toFixed(2)} Cr`);
  return s.trim();
}

/* ---------- 2. split into verdict + sections ---------- */
const ICONS = [
  [/what to do|action|next step|recommend/i, ListChecks, "todo"],
  [/why|cause|reason|root/i, Search, "why"],
  [/where|timeline|journey|time was lost|stage/i, Clock, "time"],
  [/impact|effect|production|line/i, Factory, "impact"],
  [/risk|watch|alert|warning|concern/i, ShieldAlert, "risk"],
  [/trend|forecast|predict|outlook/i, TrendingUp, "trend"],
  [/ship|deliver|logistic|transit/i, Truck, "ship"],
  [/number|key|top|summary|figure|kpi|cause|largest|breakdown|score/i, BarChart3, "nums"],
];
const iconFor = h => ICONS.find(([rx]) => rx.test(h)) || [null, Info, "info"];

function splitAnswer(md) {
  const lines = md.split("\n");
  const intro = [], sections = [];
  let cur = null;
  for (const ln of lines) {
    const h = ln.match(/^\s*#{1,4}\s+(.+?)\s*#*\s*$/);
    if (h) { cur = { title: plain(h[1]), body: [] }; sections.push(cur); continue; }
    (cur ? cur.body : intro).push(ln);
  }
  let introText = intro.join("\n").trim(), verdict = null;
  const first = introText.split(/\n\s*\n/)[0] || "";
  if (/^\s*(\*\*|>)/.test(first) || (!sections.length && first.length < 260)) {
    verdict = first.replace(/^>\s?/gm, "").trim();
    introText = introText.slice(first.length).trim();
  }
  return { verdict, intro: introText, sections: sections.map(s => ({ ...s, body: s.body.join("\n").trim() })) };
}

// body -> [{type:"md"|"table", ...}]
function segments(body) {
  const out = [], lines = body.split("\n");
  let buf = [], tbl = [];
  const flushMd = () => { const t = buf.join("\n").trim(); if (t) out.push({ type: "md", text: t }); buf = []; };
  const flushTbl = () => { if (tbl.length >= 3) out.push({ type: "table", rows: tbl }); else buf.push(...tbl); tbl = []; };
  for (const ln of lines) {
    if (/^\s*\|.*\|\s*$/.test(ln)) { if (!tbl.length) flushMd(); tbl.push(ln); }
    else { if (tbl.length) flushTbl(); buf.push(ln); }
  }
  if (tbl.length) flushTbl();
  flushMd();
  return out;
}

/* ---------- 3. tables -> chart + table ---------- */
const plain = s => (s || "").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/[*_`]/g, "").trim();
const cellsOf = ln => ln.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map(c => c.trim());
const DATE_RX = /\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}[ /-][A-Za-z]{3}\b|\b[A-Za-z]{3} \d{1,2}\b/;
const UNIT = { cr: 1e7, crore: 1e7, l: 1e5, lakh: 1e5, lakhs: 1e5, k: 1e3, m: 1e6, mn: 1e6, b: 1e9, bn: 1e9 };

function num(cell) {
  const t = plain(cell);
  if (!t || DATE_RX.test(t)) return null;
  const m = t.replace(/,/g, "").match(/^[^\d-]{0,3}(-?\d+(?:\.\d+)?)\s*(cr|crore|lakhs?|l|k|mn|m|bn|b|%|d|days?|pts?|ppm)?\b/i);
  if (!m) return null;
  return parseFloat(m[1]) * (UNIT[(m[2] || "").toLowerCase()] || 1);
}

const PREFER = /₹|value|amount|outstanding|days|delay|lost|share|%|lines|otif|ppm|score|count|qty|defect|late|risk|spend/i;
const SKIP = /^(#|no\.?|rank|id|po|line|sr|s\.no)$/i;

function SmartTable({ rows, A }) {
  const head = cellsOf(rows[0]);
  const body = rows.slice(2).map(cellsOf).filter(r => r.some(c => c));
  const chart = useMemo(() => {
    if (body.length < 2 || body.length > 12 || head.length < 2) return null;
    const cands = head.map((h, i) => ({ h, i, vals: body.map(r => num(r[i])) }))
      .filter(c => c.i > 0 && !SKIP.test(plain(c.h)) && c.vals.filter(v => v != null).length >= Math.ceil(body.length * 0.7));
    if (!cands.length) return null;
    const pick = cands.find(c => PREFER.test(c.h)) || cands[0];
    const data = body.map(r => ({ label: plain(r[0]).slice(0, 34), v: num(r[pick.i]) ?? 0, txt: plain(r[pick.i]) }));
    if (new Set(data.map(d => d.v)).size < 2) return null;
    return { title: plain(pick.h), data };
  }, [rows]);  // eslint-disable-line react-hooks/exhaustive-deps

  const max = chart ? Math.max(...chart.data.map(d => Math.abs(d.v))) : 0;
  const inline = { a: A, p: ({ children }) => <>{children}</> };
  return <div className="av-table">
    {chart && <div className="av-chart">
      <div className="av-chart-t"><BarChart3 size={13} /> {chart.title}</div>
      <ResponsiveContainer width="100%" height={chart.data.length * 30 + 12}>
        <BarChart data={chart.data} layout="vertical" margin={{ top: 4, right: 70, bottom: 4, left: 4 }} barCategoryGap={6}>
          <XAxis type="number" hide domain={[0, "dataMax"]} />
          <YAxis type="category" dataKey="label" width={130} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "var(--text-secondary)" }} />
          <Tooltip cursor={{ fill: "rgba(120,120,160,.08)" }} formatter={(_, __, p) => [p.payload.txt, chart.title]} />
          <Bar dataKey="v" radius={[0, 6, 6, 0]} isAnimationActive={false}>
            {chart.data.map((d, i) => <Cell key={i} fill={Math.abs(d.v) === max ? "var(--brand-orange)" : "var(--brand-purple)"} fillOpacity={Math.abs(d.v) === max ? 1 : 0.75} />)}
            <LabelList dataKey="txt" position="right" style={{ fontSize: 11, fontWeight: 700, fill: "var(--brand-navy)" }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>}
    <div className="av-tscroll"><table>
      <thead><tr>{head.map((h, i) => <th key={i}>{plain(h)}</th>)}</tr></thead>
      <tbody>{body.map((r, i) => <tr key={i}>{head.map((_, j) =>
        <td key={j} className={j && num(r[j]) != null ? "n" : ""}><ReactMarkdown components={inline}>{r[j] || ""}</ReactMarkdown></td>)}</tr>)}</tbody>
    </table></div>
  </div>;
}

/* ---------- 4. "- Label: value" bullet lists -> stat tiles ---------- */
function statTiles(text) {
  const lines = text.split("\n").filter(l => l.trim());
  if (lines.length < 2 || lines.length > 6) return null;
  const items = lines.map(l => l.match(/^\s*[-*•]\s+\**([^:*\n]{2,40}?)\**\s*:\s*(.+)$/));
  if (items.some(m => !m)) return null;
  const tiles = items.map(m => {
    const val = m[2].match(/\*\*([^*]+)\*\*/);
    const v = val ? val[1] : m[2].split(/[(,;–—]| - /)[0];
    const rest = m[2].replace(val ? val[0] : v, "").replace(/^[\s,;:–—-]+/, "").trim();
    return { k: m[1].trim(), v: v.trim(), sub: rest };
  });
  return tiles.every(t => t.v.length <= 26 && /\d/.test(t.v)) ? tiles : null;
}

function Seg({ seg, A }) {
  if (seg.type === "table") return <SmartTable rows={seg.rows} A={A} />;
  const tiles = statTiles(seg.text);
  if (tiles) return <div className="av-tiles">{tiles.map((t, i) => <div key={i} className="av-tile">
    <span>{t.k}</span><b>{t.v}</b>{t.sub && <em><ReactMarkdown components={{ a: A, p: ({ children }) => <>{children}</> }}>{t.sub}</ReactMarkdown></em>}</div>)}</div>;
  return <div className="av-md"><ReactMarkdown remarkPlugins={[remarkGfm]} components={{ a: A }}>{seg.text}</ReactMarkdown></div>;
}

/* ---------- 5. the view ---------- */
export default function AnswerView({ content, A, suppliers = [], allowed = [] }) {
  const parts = useMemo(() => splitAnswer(linkify(cleanAnswer(content), suppliers, allowed) || ""), [content, suppliers, allowed]);
  const { verdict, intro, sections } = parts;
  const warn = verdict && /⚠️|could not|couldn't|unverified/i.test(verdict);
  const md = t => <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ a: A }}>{t}</ReactMarkdown>;

  return <div className="av">
    {verdict && <div className={"av-verdict" + (warn ? " warn" : "")}>
      {warn ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />}
      <div>{md(verdict.replace(/^\*\*Verdict:\*\*\s*/i, ""))}</div>
    </div>}
    {intro && segments(intro).map((s, i) => <Seg key={"i" + i} seg={s} A={A} />)}
    {sections.map((s, i) => {
      const [, Icon, kind] = iconFor(s.title);
      return <section key={i} className={`av-sec ${kind}`}>
        <h5><span className="av-ic"><Icon size={13} /></span>{s.title}</h5>
        {segments(s.body).map((g, j) => <Seg key={j} seg={g} A={A} />)}
      </section>;
    })}
  </div>;
}
