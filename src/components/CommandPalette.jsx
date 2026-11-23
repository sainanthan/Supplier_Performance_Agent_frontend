import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Bot, CornerDownLeft, Factory, FileText, LayoutGrid, Moon, Search } from "lucide-react";

/* Ctrl/Cmd+K palette: jump to pages and suppliers, open a review pack, toggle theme, or ask the agent. */
export default function CommandPalette({ open, setOpen, pages, suppliers, onNav, onSupplier, onAsk, onTheme }) {
  const [q, setQ] = useState("");
  const [i, setI] = useState(0);
  const inputRef = useRef();

  useEffect(() => {
    const onKey = e => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen(o => !o); }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setOpen]);
  useEffect(() => { if (open) { setQ(""); setI(0); setTimeout(() => inputRef.current?.focus(), 30); } }, [open]);

  const items = useMemo(() => {
    const t = q.trim().toLowerCase();
    const m = s => !t || s.toLowerCase().includes(t);
    const out = [];
    pages.filter(p => m(p.label)).forEach(p => out.push({ group: "Pages", icon: p.icon || LayoutGrid, label: p.label, run: () => onNav(p.id) }));
    (suppliers || []).filter(s => m(`${s.supplier_name} ${s.supplier_id} ${s.material_category}`)).slice(0, 8).forEach(s => {
      out.push({ group: "Suppliers", icon: Factory, label: s.supplier_name, hint: `${s.supplier_id} · grade ${s.grade}`, run: () => onSupplier(s.supplier_id) });
      if (t) out.push({ group: "Suppliers", icon: FileText, label: `Review pack: ${s.supplier_name}`, run: () => onNav("review", s.supplier_id) });
    });
    if (m("toggle dark light theme")) out.push({ group: "Actions", icon: Moon, label: "Toggle light / dark theme", run: onTheme });
    if (t) out.push({ group: "Agent", icon: Bot, label: `Ask the agent: “${q.trim()}”`, run: () => onAsk(q.trim()) });
    return out;
  }, [q, pages, suppliers]); // eslint-disable-line

  const run = it => { setOpen(false); it?.run(); };
  const onKeyDown = e => {
    if (e.key === "ArrowDown") { e.preventDefault(); setI(x => Math.min(items.length - 1, x + 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setI(x => Math.max(0, x - 1)); }
    if (e.key === "Enter") { e.preventDefault(); run(items[i]); }
  };
  let lastGroup = null;
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div className="scrim" style={{ zIndex: 60 }} onClick={() => setOpen(false)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
          <motion.div className="palette" initial={{ opacity: 0, y: -16, scale: 0.97, rotateX: 10 }} animate={{ opacity: 1, y: 0, scale: 1, rotateX: 0 }}
            exit={{ opacity: 0, y: -10, scale: 0.98 }} transition={{ type: "spring", stiffness: 380, damping: 30 }} style={{ transformPerspective: 900 }}>
            <div className="palette-input">
              <Search size={18} />
              <input ref={inputRef} value={q} onChange={e => { setQ(e.target.value); setI(0); }} onKeyDown={onKeyDown}
                placeholder="Search pages and suppliers, or type a question for the agent…" />
              <kbd>Esc</kbd>
            </div>
            <div className="palette-list">
              {items.length === 0 && <div className="muted" style={{ padding: 16 }}>No matches.</div>}
              {items.map((it, k) => {
                const head = it.group !== lastGroup ? (lastGroup = it.group) : null;
                return (
                  <div key={k}>
                    {head && <div className="palette-group">{head}</div>}
                    <div className={`palette-item ${k === i ? "on" : ""}`} onMouseEnter={() => setI(k)} onClick={() => run(it)}>
                      <it.icon size={16} /><span className="grow ellipsis">{it.label}</span>
                      {it.hint && <span className="muted">{it.hint}</span>}
                      {k === i && <CornerDownLeft size={14} className="muted" />}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="palette-foot"><span><kbd>↑</kbd><kbd>↓</kbd> navigate</span><span><kbd>Enter</kbd> open</span><span><kbd>Ctrl</kbd><kbd>K</kbd> toggle</span></div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
