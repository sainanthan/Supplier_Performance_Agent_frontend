import { Component, lazy, Suspense, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, Bell, Bot, Cable, FileText, Gauge, House, LineChart, LogOut, Map as MapIcon, MapPinned, Moon, Network, Radar, RefreshCw, Search, Settings2, Sun, X } from "lucide-react";
import "./theme.css";
import "./app.css";
import "./story.css";
import "./premium.css";
import "./architecture.css";
import "./twin3d.css";
import "./design.css";              // design pass: loaded last on purpose
import { api, getSession, setSession } from "./api";
import Login from "./pages/Login";
import Sidebar from "./components/Sidebar";
import { viewFor } from "./roles";
import { useLoad } from "./util";
// Heavy overlays (charts, markdown, palette) load asynchronously so the first screen paints sooner.
const ChatPanel = lazy(() => import("./components/ChatPanel"));
const SupplierDrawer = lazy(() => import("./components/SupplierDrawer"));
const CommandPalette = lazy(() => import("./components/CommandPalette"));
// Pages are code-split: each page's code (and three.js) downloads only when first opened, then stays cached.
const PAGES = {
  home: () => import("./pages/Home"), command: () => import("./pages/CommandCenter"), trends: () => import("./pages/Trends"), risk: () => import("./pages/RiskRadar"),
  twin: () => import("./pages/DigitalTwin"), tracker: () => import("./pages/NetworkTracker"), review: () => import("./pages/ReviewPack"),
  settings: () => import("./pages/Settings"), portal: () => import("./pages/SupplierPortal"), integration: () => import("./pages/DataIntegration"),
  architecture: () => import("./pages/AgentArchitecture"), gps: () => import("./pages/GpsTracking"),
};
const LAZY = Object.fromEntries(Object.entries(PAGES).map(([k, f]) => [k, lazy(f)]));

// Navigation. Story, Scorecards (now inside Overview), Supplier Compare, Corrective Actions and "My dashboard" were removed;
// their old links open Overview.
const NAV = [
  { id: "home", label: "Home", icon: House, group: "Main" },
  { id: "command", label: "Overview", icon: Gauge, group: "Main" },
  { id: "trends", label: "OTIF / PPM Trends", icon: LineChart, group: "Main" },
  { id: "risk", label: "Risk Radar", icon: Radar, group: "Main" },
  { id: "gps", label: "GPS Tracking", icon: MapPinned, group: "Main", flag: "gps_tracking" },
  { id: "tracker", label: "Network Tracker", icon: MapIcon, group: "Main" },
  { id: "review", label: "Review Pack", icon: FileText, group: "Main" },
  { id: "architecture", label: "Agent Architecture", icon: Network, group: "Platform", flag: "agent_architecture" },
  { id: "integration", label: "Data Integration", icon: Cable, group: "Platform", flag: "data_integration" },
];
const ALIAS = { n360: "tracker", twin: "risk", story: "command", scorecards: "command", compare: "command", actions: "command" };

// "#home/etl" -> "home": a page may keep its own sub-view after a slash
const hashBase = () => window.location.hash.slice(1).split("/")[0];

// Keeps one failing page from blanking the whole app.
class PageBoundary extends Component {
  constructor(p) { super(p); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  render() {
    if (this.state.err) return <div className="err">This page hit an error: {String(this.state.err.message || this.state.err)}. Other pages still work. <button className="ghost chip-btn" onClick={() => this.setState({ err: null })}>Retry</button></div>;
    return this.props.children;
  }
}

// Session gate: nothing (and no API call) renders before sign-in. Supplier users get the portal only.
export default function App() {
  const [session, setSess] = useState(getSession);
  useEffect(() => {
    const out = () => setSess(null);
    window.addEventListener("auth:logout", out);
    return () => window.removeEventListener("auth:logout", out);
  }, []);
  if (!session) return <Login onLogin={setSess} />;
  return <Shell session={session} logout={() => { setSession(null); setSess(null); }} />;
}

function Shell({ session, logout }) {
  const user = session.user;
  const isSupplier = user.role === "SUPPLIER";
  const feats = useLoad(() => api.features().then(r => r.flags).catch(() => ({})), []);
  const features = feats.data || {};
  const view = viewFor(user.role);                       // role-based workspace (roles.js)
  const nav_ = NAV.filter(n => view.pages.includes(n.id) && (!n.roles || n.roles.includes(user.role)) && (!n.flag || features[n.flag]))
    .sort((a, b) => view.pages.indexOf(a.id) - view.pages.indexOf(b.id));
  const canSettings = view.settings.length > 0;
  // flags load asynchronously: until then, allow the role's own pages so a deep link is not lost
  const allowed = feats.data ? [...nav_.map(n => n.id), ...(canSettings ? ["settings"] : [])] : [...view.pages, ...(canSettings ? ["settings"] : [])];
  const landing = allowed.includes(view.landing) ? view.landing : (allowed[0] || "scorecards");
  const [theme, setTheme] = useState(() => { try { return localStorage.getItem("theme") || "light"; } catch { return "light"; } });
  // Apply the theme to <html> immediately so 3D scenes read the new colour tokens during the same render.
  const flipTheme = () => setTheme(t => { const n = t === "light" ? "dark" : "light"; document.documentElement.dataset.theme = n; return n; });
  const [page, setPageState] = useState(() => {
    const h = hashBase();
    if (user.role === "SUPPLIER") return "portal";
    const want = ALIAS[h] || h;
    return [...view.pages, ...(canSettings ? ["settings"] : [])].includes(want) ? want : view.landing;
  });
  const setPage = (p, push = false) => { const t = allowed.includes(p) ? p : landing; setPageState(t); window.history[push ? "pushState" : "replaceState"](null, "", `#${t}`); };
  // drill-through history: every jump from one view to another (not a sidebar click) can be undone with Back or the browser's back
  const [backStack, setBackStack] = useState([]);
  useEffect(() => {
    const onPop = () => { const h = window.location.hash.slice(1); setBackStack(s => (s.length && s.at(-1) === h ? s.slice(0, -1) : s)); };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  // a page the role may not open (old bookmark, flag switched off) falls back to the role's landing page
  useEffect(() => { if (feats.data && !isSupplier && !allowed.includes(page)) setPage(landing); }, [feats.data, page]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!isSupplier && hashBase() !== page) window.history.replaceState(null, "", `#${page}`); }, [page]);   // URL shows the page actually open
  const [plant, setPlant] = useState("");
  const [supplier, setSupplier] = useState(null);       // open drawer
  const [reviewId, setReviewId] = useState("SUP-001");
  const [chatOpen, setChatOpen] = useState(false);
  const [seed, setSeed] = useState(null);
  const [showNotes, setShowNotes] = useState(false);
  const [palette, setPalette] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [trace, setTrace] = useState(null);             // a chat answer opened in Agent Architecture
  const [slim, setSlim] = useState(() => { try { return localStorage.getItem("navSlim") === "1"; } catch { return false; } });
  const toggleSlim = () => setSlim(v => { try { localStorage.setItem("navSlim", v ? "0" : "1"); } catch { /* storage unavailable */ } return !v; });
  const [refreshedAt, setRefreshedAt] = useState(() => new Date());
  const health = useLoad(() => api.health(), []);
  const plants = useLoad(() => (isSupplier ? Promise.resolve([]) : api.plants().catch(() => [])), []);
  const notes = useLoad(() => (isSupplier ? Promise.resolve([]) : api.notifications().catch(() => [])), [showNotes, page]);
  const sups = useLoad(() => (isSupplier ? Promise.resolve([]) : api.scorecard({}).catch(() => [])), [refreshKey]);
  const atRisk = (sups.data || []).filter(c => c.health === "AT_RISK").length;

  useEffect(() => {
    const onHash = () => {
      const h = ALIAS[hashBase()] || hashBase();
      if (isSupplier) return;
      if ([...view.pages, ...(canSettings ? ["settings"] : [])].includes(h)) setPageState(h);
      else setPageState(cur => { window.history.replaceState(null, "", `#${cur}`); return cur; });   // not for this role: keep the current page
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    const idle = window.requestIdleCallback || (cb => setTimeout(cb, 1500));
    if (!isSupplier) idle(() => Object.values(PAGES).forEach(f => f().catch(() => {})));
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem("theme", theme); } catch { /* storage unavailable */ }
  }, [theme]);

  const ask = q => { setSupplier(null); setSeed(q); setChatOpen(true); };
  const nav = (p, id) => {
    setSupplier(null); if (p === "review" && id) setReviewId(id);
    const from = window.location.hash.slice(1) || page;
    if (from.split("/")[0] !== p) { setBackStack(s => [...s, from].slice(-20)); setPage(p, true); } else setPage(p);
  };
  const sideNav = p => { setSupplier(null); setBackStack([]); setPage(p); };      // the sidebar starts a fresh trail
  const backLabel = h => { const [b, sub] = (h || "").split("/"); const n = NAV.find(x => x.id === b);
    return (n ? n.label : b === "settings" ? view.settingsLabel : b) + (b === "home" && sub ? ` · ${sub.replace(/^./, c => c.toUpperCase())}` : ""); };
  const unread = (notes.data || []).filter(n => !n.is_read).length;
  const h = health.data;
  const ctx = { toggleTheme: () => flipTheme(), plant, theme, openSupplier: setSupplier, ask, nav, reviewId, setReviewId, llmReady: !!h?.llm_configured, user, features, reloadFeatures: feats.reload, trace, setTrace, allowed };
  const showTrace = t => { setTrace(t); setChatOpen(false); nav("architecture"); };
  const Page = LAZY[page] || LAZY.command;
  const refresh = () => api.clearCache().catch(() => {}).finally(() => { setRefreshKey(k => k + 1); setRefreshedAt(new Date()); health.reload(); notes.reload(); });

  return (
    <div className={"shell" + (slim || isSupplier ? " slim" : "")}>
      <div className="backdrop"><i /><i /><i /></div>
      {isSupplier
        ? <nav className="rail" aria-label="Main navigation"><div className="logo" title="GWC Data.AI"><img src="/gwc-mark.png" alt="GWC Data.AI" /></div></nav>
        : <Sidebar user={user} view={view} items={nav_} page={page} onNav={sideNav} canSettings={canSettings} slim={slim} toggleSlim={toggleSlim}
            badges={{ risk: atRisk }}
            onLogout={logout} />}

      <div className="main">
        <header className="topbar">
          <div>
            <h1>Supplier Performance Agent</h1>
            <div className="sub">
              {!isSupplier && <span className={`ws-tag ws-${view.tone}`}>{view.workspace}</span>}
              Measure supplier reliability and incoming risk · as of <b>{h?.coverage?.as_of_date || "…"}</b>
              {h && h.database !== "ok" && <span style={{ color: "var(--depth-0)" }}> · DB: {h.database}</span>}
            </div>
          </div>
          <div className="grow" />
          {!isSupplier && <><button className="search-btn" onClick={() => setPalette(true)} aria-label="Search">
            <Search size={15} /><span>Search or ask…</span><kbd>Ctrl K</kbd>
          </button>
          <button className="ghost icon-btn" onClick={refresh} aria-label="Refresh data"
            title={`Last refreshed ${refreshedAt.toLocaleTimeString()}`}><RefreshCw size={17} /></button>
          <select value={plant} onChange={e => setPlant(e.target.value)} title="Plant filter">
            <option value="">All plants</option>
            {(plants.data || []).map(p => <option key={p.plant_id} value={p.plant_id}>{p.plant_name}</option>)}
          </select>
          <div style={{ position: "relative" }}>
            <button className="ghost icon-btn" onClick={() => setShowNotes(s => !s)} aria-label="Notifications">
              <Bell size={18} />{unread > 0 && <span className="badge-dot">{unread}</span>}
            </button>
            <AnimatePresence>
              {showNotes && (
                <motion.div className="card" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  style={{ position: "absolute", right: 0, top: 48, width: 360, maxHeight: 420, overflow: "auto", zIndex: 50, background: "var(--dr-surface)" }}>
                  <h3 style={{ justifyContent: "space-between", display: "flex" }}>Notifications
                    <button className="ghost chip-btn" onClick={() => api.readAll().then(notes.reload)}>Mark all read</button></h3>
                  {(notes.data || []).length === 0 && <div className="muted">No notifications yet.</div>}
                  {(notes.data || []).map(n => (
                    <div key={n.id} style={{ padding: "10px 0", borderTop: "1px solid var(--dr-border)", opacity: n.is_read ? 0.6 : 1 }}>
                      <div className="row-flex"><span className={`pill sev-${n.severity}`}>{n.recipient_role}</span><span className="muted">{n.created_at?.slice(0, 16).replace("T", " ")}</span></div>
                      <div style={{ fontWeight: 600, fontSize: 13, marginTop: 4 }}>{n.subject}</div>
                      <div className="muted">{n.body}</div>
                    </div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <button className="ghost icon-btn" onClick={() => flipTheme()} aria-label="Toggle theme">
            {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
          </button>
          </>}
          {isSupplier && <button className="ghost icon-btn" onClick={() => flipTheme()} aria-label="Toggle theme">{theme === "light" ? <Moon size={18} /> : <Sun size={18} />}</button>}
          {isSupplier && <div className="user-chip" title={user.display_name}>
            <span>{user.display_name || user.username}</span><span className={`pill role-${isSupplier ? "supplier" : view.tone}`} title={user.role}>{isSupplier ? "Supplier" : view.label}</span>
            <button className="ghost icon-btn" style={{ width: 28, height: 28 }} onClick={logout} aria-label="Sign out" title="Sign out"><LogOut size={14} /></button>
          </div>}
        </header>

        <main className={"page" + (page === "tracker" || page === "n360" ? " page-full" : "")}>
          {backStack.length > 0 && <button className="back-bar" onClick={() => window.history.back()} title="Return to where you drilled through from">
            <ArrowLeft size={14} /> Back to {backLabel(backStack.at(-1))}</button>}
          <AnimatePresence mode="wait">
            <motion.div key={page + refreshKey} className="page-inner" initial={{ opacity: 0, y: 14, rotateX: 4 }} animate={{ opacity: 1, y: 0, rotateX: 0 }}
              exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.28 }} style={{ transformPerspective: 1400 }}>
              <PageBoundary key={page}><Suspense fallback={<div className="skeleton" style={{ height: 420 }} />}><Page {...ctx} /></Suspense></PageBoundary>
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {!isSupplier && <>
      <button className={"cw-launch" + (chatOpen ? " open" : "")} onClick={() => setChatOpen(o => !o)} aria-label={chatOpen ? "Close the agent chat" : "Ask the agent"} aria-expanded={chatOpen}>
        {chatOpen ? <X size={20} /> : <Bot size={22} />}{!chatOpen && <i className="cw-online" aria-hidden />}{!chatOpen && <span className="cw-tip">Ask the agent</span>}</button>
      <Suspense fallback={null}>
      <ChatPanel open={chatOpen} onClose={() => setChatOpen(false)} seed={seed} clearSeed={() => setSeed(null)} llmReady={!!h?.llm_configured}
        onNav={nav} onSupplier={setSupplier} allowed={allowed} suppliers={sups.data} onTrace={features.agent_architecture && allowed.includes("architecture") ? showTrace : null} />
      <CommandPalette open={palette} setOpen={setPalette} pages={[...nav_, ...(canSettings ? [{ id: "settings", label: view.settingsLabel, icon: Settings2 }] : [])]}
        suppliers={sups.data} onNav={nav} onSupplier={setSupplier} onAsk={ask} onTheme={() => flipTheme()} />
      <SupplierDrawer id={supplier} onClose={() => setSupplier(null)} onAsk={ask} onNav={nav} />
      </Suspense></>}
    </div>
  );
}
