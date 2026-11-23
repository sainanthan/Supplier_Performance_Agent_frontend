/* Role-based views: ONE place that decides what each role sees. Pages are still protected by the backend policy
   (app/auth.py POLICY); this file shapes the experience so each role gets its own workspace.
   - pages: navigation entries (order follows NAV in App.jsx); anything else typed into the URL falls back to `landing`
   - landing: first page after sign-in (Overview for every role)
   - settings: which Settings sections the role can open ([] = no settings entry at all)
   SUPPLIER users never reach this: they get the supplier portal only. */
export const ROLE_VIEWS = {
  ADMIN: {
    label: "Administrator", workspace: "Admin workspace", tone: "admin",
    landing: "home",
    pages: ["home", "command", "trends", "risk", "tracker", "review", "architecture", "integration"],
    settings: ["flags", "gps", "defs", "excl", "gov", "jobs", "sys", "users"], settingsLabel: "Settings & governance",
  },
  PROCUREMENT: {
    label: "Procurement", workspace: "Procurement workspace", tone: "procurement",
    landing: "home",
    pages: ["home", "command", "trends", "risk", "tracker", "review", "architecture"],
    settings: ["defs", "excl", "gps"], settingsLabel: "KPI definitions & exclusions",
  },
  QUALITY: {
    label: "Supplier quality", workspace: "Quality workspace", tone: "quality",
    landing: "home",
    pages: ["home", "command", "trends", "risk", "review", "architecture"],
    settings: ["defs", "excl"], settingsLabel: "KPI definitions & exclusions",
  },
  VIEWER: {
    label: "Leadership (read-only)", workspace: "Leadership view · read-only", tone: "viewer",
    landing: "home",
    pages: ["home", "command", "trends", "risk", "tracker", "review", "architecture"],
    settings: ["defs"], settingsLabel: "KPI definitions",
  },
};

export const viewFor = role => ROLE_VIEWS[role] || ROLE_VIEWS.VIEWER;
