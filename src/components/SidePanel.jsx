import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useDialog } from "./useDialog";

/* Right-side panel (drawer): slides in over the page, Esc / backdrop / × closes it, focus moves in and returns.
   Rendered on document.body so the page's transforms cannot clip or offset it. */
export default function SidePanel({ title, sub, icon, onClose, width = 680, children, footer }) {
  const ref = useDialog(onClose);
  return createPortal(
    <div className="sp-scrim" onClick={onClose}>
      <aside className="sp-panel" style={{ width: `min(${width}px, 96vw)` }} role="dialog" aria-modal="true" aria-label={typeof title === "string" ? title : "Details"}
        ref={ref} tabIndex={-1} onClick={e => e.stopPropagation()}>
        <header className="sp-head">
          {icon}
          <div className="sp-title"><b>{title}</b>{sub && <span>{sub}</span>}</div>
          <button className="ghost icon-btn" onClick={onClose} aria-label="Close panel"><X size={16} /></button>
        </header>
        <div className="sp-body">{children}</div>
        {footer && <footer className="sp-foot">{footer}</footer>}
      </aside>
    </div>, document.body);
}
