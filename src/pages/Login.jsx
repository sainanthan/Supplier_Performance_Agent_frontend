import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, BadgeCheck, Eye, EyeOff, Gauge, Loader2, Lock, Radar, ShieldCheck, ShieldHalf, User } from "lucide-react";
import { login } from "../api";
import "../login.css";

// Premium sign-in: brand hero with a live, animated supplier -> port -> plant network on the left; glass form on the right.
const SUPPLIERS = [[70, 90], [52, 190], [88, 300], [60, 410], [118, 500]];
const PORTS = [[250, 160], [262, 360]];
const PLANT = [430, 270];
const ROLES = ["Admin", "Procurement", "Quality", "Viewer", "Supplier"];

function Network() {
  const legs = [
    ...SUPPLIERS.map(([x, y], i) => { const p = PORTS[i < 3 ? 0 : 1]; return `M${x} ${y} C ${x + 90} ${y}, ${p[0] - 80} ${p[1]}, ${p[0]} ${p[1]}`; }),
    ...PORTS.map(([x, y]) => `M${x} ${y} C ${x + 80} ${y}, ${PLANT[0] - 90} ${PLANT[1]}, ${PLANT[0]} ${PLANT[1]}`),
  ];
  return (
    <svg className="lg-net" viewBox="0 0 520 580" aria-hidden="true">
      <defs>
        <radialGradient id="lgPlant"><stop offset="0" stopColor="var(--brand-orange)" stopOpacity="0.9" /><stop offset="1" stopColor="var(--brand-orange)" stopOpacity="0" /></radialGradient>
        <linearGradient id="lgLeg" x1="0" x2="1"><stop offset="0" stopColor="var(--brand-blue)" /><stop offset="1" stopColor="var(--brand-orange)" /></linearGradient>
      </defs>
      {[90, 150, 210].map(r => <circle key={r} cx={PLANT[0]} cy={PLANT[1]} r={r} className="lg-ring" />)}
      {legs.map((d, i) => <g key={i}>
        <path d={d} className="lg-leg" />
        <path d={d} className="lg-flow" style={{ animationDelay: `${-i * 0.7}s` }} />
        <circle r="4" className="lg-pkt"><animateMotion dur={`${3.2 + (i % 3) * 0.8}s`} begin={`${-i * 0.9}s`} repeatCount="indefinite" path={d} /></circle>
      </g>)}
      {SUPPLIERS.map(([x, y], i) => <g key={i} className="lg-node" style={{ animationDelay: `${i * 0.4}s` }}>
        <circle cx={x} cy={y} r="13" className="lg-node-halo" /><circle cx={x} cy={y} r="6" className="lg-node-core" /></g>)}
      {PORTS.map(([x, y], i) => <g key={i}><rect x={x - 9} y={y - 9} width="18" height="18" rx="4" className="lg-port" /></g>)}
      <circle cx={PLANT[0]} cy={PLANT[1]} r="60" fill="url(#lgPlant)" className="lg-plant-glow" />
      <circle cx={PLANT[0]} cy={PLANT[1]} r="16" className="lg-plant" />
      <text x={PLANT[0]} y={PLANT[1] + 44} className="lg-lbl" textAnchor="middle">Plants</text>
      <text x="70" y="550" className="lg-lbl">Suppliers</text>
      <text x="236" y="410" className="lg-lbl">Ports</text>
    </svg>
  );
}

export default function Login({ onLogin }) {
  const remembered = (() => { try { return localStorage.getItem("spa_user") || ""; } catch { return ""; } })();
  const [u, setU] = useState(remembered), [p, setP] = useState("");
  const [show, setShow] = useState(false), [caps, setCaps] = useState(false), [remember, setRemember] = useState(!!remembered);
  const [err, setErr] = useState(""), [busy, setBusy] = useState(false), [shake, setShake] = useState(0), [wake, setWake] = useState(null);
  useEffect(() => { document.title = "Sign in · Supplier Performance Agent"; fetch("/api/health").catch(() => {}); }, []);   // start waking a sleeping server while the user types
  const submit = async e => {
    e.preventDefault(); setErr(""); setBusy(true); setWake(null);
    try {
      const s = await login(u.trim(), p, setWake);
      try { remember ? localStorage.setItem("spa_user", u.trim()) : localStorage.removeItem("spa_user"); } catch { /* storage unavailable */ }
      document.title = "Supplier Performance Agent";
      onLogin(s);
    } catch (x) { setErr(x.message); setShake(n => n + 1); setBusy(false); setWake(null); }
  };
  const capsCheck = e => setCaps(!!e.getModifierState?.("CapsLock"));

  return (
    <div className="lg">
      <section className="lg-hero">
        <div className="lg-aurora"><i /><i /><i /></div>
        <div className="lg-grid" />
        <motion.div className="lg-hero-in" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }}>
          <div className="lg-eyebrow"><span className="lg-dot" /> Agent 10 · Manufacturing AI suite</div>
          <h1>Supplier intelligence,<br /><em>grounded in evidence.</em></h1>
          <p>Delivery, quality, responsiveness and commercial performance across every supplier, with early risk signals and governed corrective action.</p>
          <div className="lg-stage">
            <Network />
            <motion.div className="lg-float f1" animate={{ y: [0, -8, 0] }} transition={{ duration: 5, repeat: Infinity }}><Gauge size={15} /><div><b>OTIF &amp; lead time</b><span>Working-day accurate</span></div></motion.div>
            <motion.div className="lg-float f2" animate={{ y: [0, 7, 0] }} transition={{ duration: 6, repeat: Infinity }}><Radar size={15} /><div><b>Risk radar</b><span>Statistically tested alerts</span></div></motion.div>
            <motion.div className="lg-float f3" animate={{ y: [0, -6, 0] }} transition={{ duration: 5.5, repeat: Infinity }}><BadgeCheck size={15} /><div><b>Verified AI</b><span>Every figure checked</span></div></motion.div>
          </div>
          <div className="lg-trust">
            <span><ShieldHalf size={14} /> Role-based access</span>
            <span><BadgeCheck size={14} /> Traceable to source records</span>
            <span><ShieldCheck size={14} /> Full audit trail</span>
          </div>
        </motion.div>
      </section>

      <section className="lg-side">
        <motion.form key={shake} className="lg-card" onSubmit={submit} noValidate
          initial={{ opacity: 0, x: shake ? 0 : 24 }} animate={shake ? { x: [0, -10, 10, -6, 6, 0], opacity: 1 } : { opacity: 1, x: 0 }} transition={{ duration: shake ? 0.4 : 0.6 }}>
          <img src="/gwc-logo.png" alt="GWC Data.AI" className="lg-logo" />
          <h2>Welcome back</h2>
          <div className="lg-sub">Sign in to the Supplier Performance Agent</div>

          <label className="lg-field">
            <span>Username</span>
            <div className="lg-input"><User size={17} /><input autoFocus={!remembered} value={u} onChange={e => setU(e.target.value)} autoComplete="username" placeholder="Enter your username" /></div>
          </label>
          <label className="lg-field">
            <span>Password</span>
            <div className="lg-input"><Lock size={17} />
              <input autoFocus={!!remembered} type={show ? "text" : "password"} value={p} onChange={e => setP(e.target.value)} onKeyUp={capsCheck} onKeyDown={capsCheck}
                autoComplete="current-password" placeholder="Enter your password" />
              <button type="button" className="lg-eye" onClick={() => setShow(s => !s)} aria-label={show ? "Hide password" : "Show password"}>{show ? <EyeOff size={17} /> : <Eye size={17} />}</button>
            </div>
          </label>
          <div className="lg-row">
            <label className="lg-check"><input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} /><i />Remember username</label>
            {caps && <span className="lg-caps">Caps Lock is on</span>}
          </div>

          {busy && wake != null && <div className="lg-wake" role="status"><Loader2 size={14} className="spin" /> The server is waking up after being idle ({wake}s). This can take up to a minute; you will be signed in automatically.</div>}
          <AnimatePresence>{err && <motion.div className="lg-err" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>{err}</motion.div>}</AnimatePresence>

          <button className="lg-btn" disabled={busy || !u.trim() || !p}>
            {busy ? <><Loader2 size={18} className="spin" /> Signing in…</> : <>Sign in <ArrowRight size={18} /></>}
          </button>

          <div className="lg-roles">{ROLES.map(r => <span key={r}>{r}</span>)}</div>
          <div className="lg-foot"><ShieldCheck size={13} /> Protected session · expires after 12 hours · GWC Data.AI</div>
        </motion.form>
      </section>
    </div>
  );
}
