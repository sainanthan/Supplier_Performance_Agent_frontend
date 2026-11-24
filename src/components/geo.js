// Distance helpers shared by the GPS page and its map (kept apart so the map, with MapLibre, can load lazily).
const rad = d => (d * Math.PI) / 180;
export const km = (a, b) => {                                           // a, b = [lat, lon]
  const h = Math.sin(rad(b[0] - a[0]) / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(rad(b[1] - a[1]) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
};
export const cumKm = pts => pts.reduce((acc, p, i) => (acc.push(i ? acc[i - 1] + km(pts[i - 1], p) : 0), acc), []);

/** progress of the vehicle along the planned route: km done, km left, % */
export function routeProgress(route, pos) {
  if (!route?.path?.length || !pos) return null;
  const pts = route.path, cum = cumKm(pts);
  let best = 0, bd = Infinity;
  pts.forEach((p, i) => { const d = km(p, pos); if (d < bd) { bd = d; best = i; } });
  const total = cum.at(-1), done = cum[best];
  return { total, done, left: Math.max(0, total - done), pct: total ? (100 * done) / total : 0 };
}

