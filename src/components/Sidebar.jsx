import { ChevronsLeft, ChevronsRight, LogOut, Settings2 } from "lucide-react";

/* Premium side navigation: logo, profile, MAIN and PLATFORM pages and settings. Collapsed ("slim") it shows icons only. */
const initials = s => (s || "?").split(/[\s._-]+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join("");

export default function Sidebar({ user, view, items, page, onNav, canSettings, slim, toggleSlim, badges = {}, onLogout }) {
  const groups = [];
  for (const n of items) {
    const g = groups.find(x => x.name === n.group);
    g ? g.items.push(n) : groups.push({ name: n.group, items: [n] });
  }

  const Item = ({ n }) => (
    <button className={"sb-item" + (page === n.id ? " on" : "")} onClick={() => onNav(n.id)}
      aria-current={page === n.id ? "page" : undefined} title={slim ? n.label : undefined} aria-label={n.label}>
      <n.icon size={17} /><span className="lbl">{n.label}</span>
      {badges[n.id] > 0 && <span className={"sb-badge" + (n.id === "risk" ? " hot" : "")} title={n.id === "risk" ? "Suppliers at risk" : undefined}>{badges[n.id]}</span>}
    </button>
  );

  return (
    <nav className={"sb" + (slim ? " slim" : "")} aria-label="Main navigation">
      <div className="sb-logo"><img src={slim ? "/gwc-mark.png" : "/gwc-logo.png"} alt="GWC Data.AI · Solution Matters" /></div>

      <div className="sb-profile">
        <span className="sb-av" aria-hidden="true">{initials(user.display_name || user.username)}</span>
        <div className="sb-who"><span>{view.label}</span><b>{user.display_name || user.username}</b></div>
        <button className="sb-icon" onClick={onLogout} aria-label="Sign out" title="Sign out"><LogOut size={15} /></button>
      </div>

      <div className="sb-scroll">
        {groups.map(g => <div key={g.name} className="sb-flat">
          <div className="sb-sec">{g.name}</div>
          {g.items.map(n => <Item key={n.id} n={n} />)}
        </div>)}
        {canSettings && <>
          <div className="sb-sec">Account</div>
          <button className={"sb-item" + (page === "settings" ? " on" : "")} onClick={() => onNav("settings")} aria-label={view.settingsLabel} title={slim ? view.settingsLabel : undefined}>
            <Settings2 size={17} /><span className="lbl">Settings</span>
          </button>
        </>}
      </div>

      <button className="sb-collapse" onClick={toggleSlim} aria-label={slim ? "Expand navigation" : "Collapse navigation"} title={slim ? "Expand" : "Collapse"}>
        {slim ? <ChevronsRight size={15} /> : <><ChevronsLeft size={15} /><span>Collapse</span></>}
      </button>
    </nav>
  );
}
