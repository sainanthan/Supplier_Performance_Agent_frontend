import { useEffect, useRef } from "react";

/* Accessible modal behaviour (DI Phase 6): focus moves into the dialog when it opens, Escape closes it, and focus returns to
   the element that opened it. Attach the returned ref to the dialog card (which gets tabIndex -1). */
export function useDialog(onClose) {
  const ref = useRef(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const opener = document.activeElement;
    ref.current?.focus({ preventScroll: true });
    const onKey = e => { if (e.key === "Escape") { e.stopPropagation(); close.current?.(); } };
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); if (opener && opener.focus) opener.focus({ preventScroll: true }); };
  }, []);
  return ref;
}
