/* Detailed 3D models for the twin map, built in code (no model files, works offline).
   Each model has three meshes:
     body   - realistic fixed colours (hull, containers, cab, walls, glass ...)
     accent - white, tinted per instance by status: a halo ring on the ground plus a small beacon, so the status reads
              at a glance without painting the whole model in a flat colour (which looked like a toy)
     shadow - a soft dark footprint, drawn translucent under the model
   Units: model space, +X = forward, +Z = up, ground / waterline at z = 0. The map scales them to a constant on-screen size. */

function mesh() { return { p: [], n: [], c: [] }; }
function tri(m, a, b, c, col) {
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  let nx = u[1] * v[2] - u[2] * v[1], ny = u[2] * v[0] - u[0] * v[2], nz = u[0] * v[1] - u[1] * v[0];
  const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
  for (const q of [a, b, c]) { m.p.push(...q); m.n.push(nx, ny, nz); m.c.push(...col); }
}
const quad = (m, a, b, c, d, col) => { tri(m, a, b, c, col); tri(m, a, c, d, col); };
const nz = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
// flat quad on the ground, always facing up (otherwise it would be lit from below and render dark)
const upQuad = (m, a, b, c, d, col) => (nz(a, b, c) >= 0 ? quad(m, a, b, c, d, col) : quad(m, a, d, c, b, col));
// quad facing away from point o (hull plating)
function outQuad(m, o, a, b, c, d, col) {
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const mid = [(a[0] + c[0]) / 2 - o[0], (a[1] + c[1]) / 2 - o[1], (a[2] + c[2]) / 2 - o[2]];
  if (n[0] * mid[0] + n[1] * mid[1] + n[2] * mid[2] >= 0) quad(m, a, b, c, d, col); else quad(m, a, d, c, b, col);
}

// extrude a convex polygon (counter-clockwise, seen from above) between z0 and z1
function prism(m, poly, z0, z1, col, top = col, bottom = false) {
  const n = poly.length;
  for (let i = 1; i < n - 1; i++) {
    tri(m, [...poly[0], z1], [...poly[i], z1], [...poly[i + 1], z1], top);
    if (bottom) tri(m, [...poly[0], z0], [...poly[i + 1], z0], [...poly[i], z0], col);
  }
  for (let i = 0; i < n; i++) {
    const a = poly[i], b = poly[(i + 1) % n];
    quad(m, [...a, z0], [...b, z0], [...b, z1], [...a, z1], col);
  }
}
const box = (m, x0, y0, x1, y1, z0, z1, col, top) => prism(m, [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], z0, z1, col, top);

// extrude a convex profile drawn in the X-Z plane (side view) across Y: truck cabs, bridge fronts
function extrudeY(m, prof, y0, y1, col, cap = col) {
  const n = prof.length;
  for (let i = 1; i < n - 1; i++) {
    tri(m, [prof[0][0], y0, prof[0][1]], [prof[i][0], y0, prof[i][1]], [prof[i + 1][0], y0, prof[i + 1][1]], cap);
    tri(m, [prof[0][0], y1, prof[0][1]], [prof[i + 1][0], y1, prof[i + 1][1]], [prof[i][0], y1, prof[i][1]], cap);
  }
  for (let i = 0; i < n; i++) {
    const a = prof[i], b = prof[(i + 1) % n];
    quad(m, [a[0], y1, a[1]], [b[0], y1, b[1]], [b[0], y0, b[1]], [a[0], y0, a[1]], col);
  }
}
// vertical cylinder / cone (r1 = top radius)
function cylinder(m, cx, cy, r, z0, z1, col, seg = 12, r1 = r, top = col) {
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * 2 * Math.PI, a1 = ((i + 1) / seg) * 2 * Math.PI;
    const p = (a, rr, z) => [cx + rr * Math.cos(a), cy + rr * Math.sin(a), z];
    quad(m, p(a0, r, z0), p(a1, r, z0), p(a1, r1, z1), p(a0, r1, z1), col);
    if (r1 > 0) tri(m, [cx, cy, z1], p(a0, r1, z1), p(a1, r1, z1), top);
  }
}
// wheel: cylinder lying across Y (axle along Y)
function wheel(m, cx, y0, y1, cz, r, tyre, hub, seg = 14) {
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * 2 * Math.PI, a1 = ((i + 1) / seg) * 2 * Math.PI;
    const p = (a, y, rr = r) => [cx + rr * Math.cos(a), y, cz + rr * Math.sin(a)];
    quad(m, p(a0, y0), p(a0, y1), p(a1, y1), p(a1, y0), tyre);
    tri(m, [cx, y1, cz], p(a1, y1, r * 0.55), p(a0, y1, r * 0.55), hub);
    tri(m, [cx, y0, cz], p(a0, y0, r * 0.55), p(a1, y0, r * 0.55), hub);
    quad(m, p(a0, y1, r * 0.55), p(a1, y1, r * 0.55), p(a1, y1), p(a0, y1), tyre);
    quad(m, p(a1, y0, r * 0.55), p(a0, y0, r * 0.55), p(a0, y0), p(a1, y0), tyre);
  }
}
// horizontal cylinder along X (fuel tanks)
function tubeX(m, x0, x1, cy, cz, r, col, seg = 10) {
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * 2 * Math.PI, a1 = ((i + 1) / seg) * 2 * Math.PI;
    const p = (a, x) => [x, cy + r * Math.cos(a), cz + r * Math.sin(a)];
    quad(m, p(a0, x0), p(a1, x0), p(a1, x1), p(a0, x1), col);
  }
}
// flat ring / disc on the ground (ellipse), used for the status halo and for shadows
function ring(m, cx, cy, rx, ry, w, z, col, seg = 36) {
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * 2 * Math.PI, a1 = ((i + 1) / seg) * 2 * Math.PI;
    const o = (a, k) => [cx + (rx + k) * Math.cos(a), cy + (ry + k * ry / rx) * Math.sin(a), z];
    upQuad(m, o(a0, -w), o(a1, -w), o(a1, 0), o(a0, 0), col);
  }
}
function disc(m, cx, cy, rx, ry, z, col, seg = 28) {
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * 2 * Math.PI, a1 = ((i + 1) / seg) * 2 * Math.PI;
    tri(m, [cx, cy, z], [cx + rx * Math.cos(a0), cy + ry * Math.sin(a0), z], [cx + rx * Math.cos(a1), cy + ry * Math.sin(a1), z], col);
  }
}
const flat = (m, poly, z, col) => { for (let i = 1; i < poly.length - 1; i++) tri(m, [...poly[0], z], [...poly[i], z], [...poly[i + 1], z], col); };

function toLayerMesh(m) {
  return { attributes: { positions: { size: 3, value: new Float32Array(m.p) }, normals: { size: 3, value: new Float32Array(m.n) },
    colors: { size: 3, value: new Float32Array(m.c) } } };
}
const pack = (body, accent, shadow, extra = {}) => ({ body: toLayerMesh(body), accent: toLayerMesh(accent), shadow: toLayerMesh(shadow), ...extra });

// realistic palette (linear-ish 0..1)
const C = {
  white: [0.95, 0.95, 0.96], hullNavy: [0.1, 0.16, 0.3], antifoul: [0.62, 0.14, 0.13], deck: [0.42, 0.45, 0.43], glass: [0.16, 0.27, 0.4],
  glassLit: [0.42, 0.62, 0.8], tyre: [0.07, 0.07, 0.08], hub: [0.62, 0.64, 0.68], steel: [0.6, 0.63, 0.67], chrome: [0.82, 0.84, 0.87],
  wall: [0.88, 0.88, 0.86], roof: [0.5, 0.52, 0.55], roofDark: [0.36, 0.38, 0.42], asphalt: [0.26, 0.27, 0.29], stripe: [0.9, 0.9, 0.86],
  dark: [0.2, 0.21, 0.24], black: [0.05, 0.05, 0.06], orange: [0.95, 0.45, 0.1], tree: [0.2, 0.45, 0.24], trunk: [0.35, 0.25, 0.16],
  concrete: [0.66, 0.66, 0.64], wake: [0.93, 0.97, 1], grass: [0.45, 0.62, 0.36],
};
// shipping-line container colours (deterministic mix)
const BOXES = [[0.11, 0.36, 0.6], [0.72, 0.16, 0.14], [0.86, 0.45, 0.12], [0.55, 0.57, 0.6], [0.16, 0.45, 0.32], [0.82, 0.68, 0.18], [0.2, 0.24, 0.45], [0.7, 0.72, 0.74]];
const rnd = s => { const x = Math.sin(s * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

// ---------------------------------------------------------------- container ship (length 40, beam ~6.6)
export function shipMesh() {
  const body = mesh(), accent = mesh(), shadow = mesh();
  // hull: lofted cross-sections from stern (x=-20) to a raked, flared bow
  const DECKZ = 2.6, BAND = 0.75;
  const st = [-20, -19.4, -16, -8, 0, 7, 11, 14, 16.5, 18.3, 19.6, 20.6];
  const half = x => (x <= 9 ? 3.3 : 3.3 * Math.sqrt(Math.max(0.0025, 1 - ((x - 9) / 11.7) ** 2)));
  const ringAt = x => {
    const bd = half(x), bw = x < 15 ? bd * (x < -18 ? 0.88 : 1) : bd * 0.72, xw = x > 19 ? x - (x - 19) * 0.9 : x;   // flare + raked stem
    return { x, xw, pts: [[-bw, 0], [-bw * 1.01, BAND], [-bd, DECKZ], [bd, DECKZ], [bw * 1.01, BAND], [bw, 0]] };
  };
  const rings = st.map(ringAt);
  const segCol = [C.antifoul, C.hullNavy, C.deck, C.hullNavy, C.antifoul];
  for (let i = 0; i < rings.length - 1; i++) {
    const A = rings[i], B = rings[i + 1];
    for (let k = 0; k < 5; k++) {
      const P = (R, j) => [j === 0 || j === 5 ? R.xw : R.x, R.pts[j][0], R.pts[j][1]];
      outQuad(body, [(A.x + B.x) / 2, 0, k === 2 ? 0 : 1.3], P(A, k), P(B, k), P(B, k + 1), P(A, k + 1), segCol[k]);
    }
  }
  const s0 = rings[0];                                                  // flat transom
  for (let j = 1; j < 5; j++) tri(body, [s0.x, s0.pts[0][0], s0.pts[0][1]], [s0.x, s0.pts[j + 1][0], s0.pts[j + 1][1]], [s0.x, s0.pts[j][0], s0.pts[j][1]], j < 2 || j > 3 ? C.antifoul : C.hullNavy);
  box(body, -20, -3.35, 18, -3.2, DECKZ - 0.05, DECKZ + 0.35, C.hullNavy); // bulwark / sheer line
  box(body, -20, 3.2, 18, 3.35, DECKZ - 0.05, DECKZ + 0.35, C.hullNavy);

  // container bays (20 ft boxes), stacks taper towards the bow
  let s = 1;
  for (let bay = 0; bay < 11; bay++) {
    const x0 = -11.2 + bay * 2.55, x1 = x0 + 2.35;
    const tiers = bay > 8 ? 2 : bay > 6 ? 3 : 4, rows = bay > 8 ? 3 : 5;
    for (let r = 0; r < rows; r++) {
      const y0 = -((rows * 1.18) / 2) + r * 1.18, y1 = y0 + 1.12;
      const h = tiers - (rnd(bay * 7 + r) > 0.78 ? 1 : 0);
      for (let t = 0; t < h; t++) {
        const col = BOXES[Math.floor(rnd(s++) * BOXES.length)];
        box(body, x0, y0, x1, y1, DECKZ + t * 0.98, DECKZ + t * 0.98 + 0.92, col, col.map(v => Math.min(1, v * 1.12)));
      }
    }
  }
  // accommodation block aft, with window bands and bridge wings
  box(body, -18.4, -2.7, -13.4, 2.7, DECKZ, 9.4, C.white, C.white);
  for (const z of [4.2, 5.7, 7.2]) box(body, -18.45, -2.75, -13.35, 2.75, z, z + 0.42, C.glass);
  box(body, -14.4, -3.6, -12.9, 3.6, 8.6, 9.6, C.white, C.white);      // bridge wings
  box(body, -13.0, -3.6, -12.85, 3.6, 8.75, 9.4, C.glass);              // bridge front glazing
  box(body, -17.6, -0.25, -17.2, 0.25, 9.4, 11.8, C.steel);             // radar mast
  box(body, -18.2, -0.9, -16.6, 0.9, 11.6, 11.8, C.steel);
  // funnel with company band and black top
  prism(body, [[-20, -1], [-18.8, -1.15], [-18.8, 1.15], [-20, 1]], DECKZ, 10.2, C.white);
  prism(body, [[-20, -1], [-18.8, -1.15], [-18.8, 1.15], [-20, 1]], 8.6, 9.5, [0.12, 0.36, 0.62]);
  prism(body, [[-20, -1], [-18.8, -1.15], [-18.8, 1.15], [-20, 1]], 10.2, 10.8, C.black);
  for (const y of [-2.95, 2.95]) box(body, -16.8, y - 0.35, -14.8, y + 0.35, 4.6, 5.3, C.orange); // lifeboats
  box(body, 17.2, -0.15, 17.5, 0.15, DECKZ, 6.2, C.steel);              // fore mast
  // wake on the water (white, tapering behind the stern)
  for (const sgn of [-1, 1]) upQuad(body, [-20, sgn * 2.6, 0.03], [-20, sgn * 3.4, 0.03], [-34, sgn * 6.5, 0.03], [-34, sgn * 5.6, 0.03], C.wake);
  upQuad(body, [19, -1.4, 0.03], [20.8, 0, 0.03], [19, 1.4, 0.03], [16, 0, 0.03], C.wake);   // bow wave
  // status: halo on the water + mast-top beacon
  ring(accent, -1, 0, 25, 7.5, 1.1, 0.04, [1, 1, 1]);
  cylinder(accent, -17.4, 0, 0.55, 11.8, 13, [1, 1, 1], 8);
  // shadow footprint
  disc(shadow, 0.5, 0.9, 21, 4.6, 0.02, [0, 0, 0]);
  return pack(body, accent, shadow, { length: 40 });
}

// ---------------------------------------------------------------- articulated truck with container (length 18)
export function truckMesh() {
  const body = mesh(), accent = mesh(), shadow = mesh();
  // trailer chassis + 40 ft container with corrugated sides
  box(body, -9, -1.1, 4.8, 1.1, 1.05, 1.35, C.dark);
  const tint = [0.11, 0.36, 0.6];
  box(body, -9, -1.25, 4.4, 1.25, 1.35, 4.2, tint, tint.map(v => v * 1.15));
  for (let x = -8.7; x < 4.2; x += 0.55) for (const y of [-1.29, 1.25]) box(body, x, y, x + 0.18, y + 0.04, 1.45, 4.1, tint.map(v => v * 0.82));
  box(body, -9.02, -1.2, -8.98, 1.2, 1.4, 4.15, tint.map(v => v * 0.75));               // rear doors
  for (const y of [-0.45, 0.45]) box(body, -9.06, y - 0.04, -9.0, y + 0.04, 1.5, 4.0, C.chrome); // door bars
  box(body, -9.05, -1.2, -8.95, -0.7, 1.1, 1.3, [0.8, 0.1, 0.1]);       // tail lights
  box(body, -9.05, 0.7, -8.95, 1.2, 1.1, 1.3, [0.8, 0.1, 0.1]);
  for (const y of [-1.2, 0.95]) box(body, -4, y, 2.5, y + 0.25, 0.6, 1.0, C.steel);      // side underrun guards
  for (const x of [-7.6, -6.5, -5.4]) for (const [y0, y1] of [[-1.3, -0.95], [0.95, 1.3]]) wheel(body, x, y0, y1, 0.55, 0.55, C.tyre, C.hub);
  // tractor
  box(body, 3.6, -1.0, 9.6, 1.0, 0.9, 1.3, C.dark);                     // frame
  const cab = [[6.0, 1.15], [9.55, 1.15], [9.7, 2.5], [9.45, 2.9], [8.75, 4.55], [6.6, 4.85], [6.0, 4.85]];
  const paint = [0.85, 0.12, 0.12];
  extrudeY(body, cab, -1.25, 1.25, paint, paint);
  box(body, 6.2, -1.15, 6.9, 1.15, 4.85, 5.35, paint);                  // roof spoiler
  // glazing: windscreen on the slope, side windows
  quad(body, [9.47, -1.1, 3.05], [9.47, 1.1, 3.05], [8.86, 1.1, 4.4], [8.86, -1.1, 4.4], C.glass);
  for (const y of [-1.27, 1.25]) box(body, 7.6, y, 8.9, y + 0.02, 3.2, 4.35, C.glass);
  box(body, 9.6, -1.0, 9.75, 1.0, 1.5, 2.45, C.dark);                   // grille
  for (const y of [-0.85, 0.65]) box(body, 9.62, y, 9.78, y + 0.2, 1.7, 1.95, [1, 0.97, 0.82]); // headlights
  box(body, 9.55, -1.3, 9.85, 1.3, 0.9, 1.25, C.dark);                  // bumper
  tubeX(body, 6.4, 7.8, -1.15, 1.25, 0.32, C.chrome);                   // fuel tank
  cylinder(body, 6.05, 1.05, 0.12, 2.0, 5.6, C.chrome, 8);              // exhaust stack
  for (const x of [4.1, 5.2]) for (const [y0, y1] of [[-1.3, -0.95], [0.95, 1.3]]) wheel(body, x, y0, y1, 0.55, 0.55, C.tyre, C.hub);
  for (const [y0, y1] of [[-1.3, -1.0], [1.0, 1.3]]) wheel(body, 8.3, y0, y1, 0.55, 0.55, C.tyre, C.hub);
  // status: roof beacon + ground halo
  box(accent, 6.3, -0.7, 6.8, 0.7, 5.35, 5.65, [1, 1, 1]);
  ring(accent, 0.3, 0, 11.5, 3.4, 0.7, 0.04, [1, 1, 1]);
  disc(shadow, 0.8, 0.7, 10.5, 2.0, 0.02, [0, 0, 0]);
  return pack(body, accent, shadow, { length: 18 });
}

// ---------------------------------------------------------------- landmarks (footprint ~30 units)
function trees(m, spots) {
  for (const [x, y, h] of spots) { cylinder(m, x, y, 0.25, 0, h * 0.35, C.trunk, 6); cylinder(m, x, y, 1.1, h * 0.3, h, C.tree, 8, 0); }
}
function carPark(m, x0, y0, x1, y1) {
  flat(m, [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], 0.03, C.asphalt);
  for (let x = x0 + 1; x < x1 - 0.5; x += 1.6) box(m, x, y0 + 0.3, x + 0.12, y0 + 2.0, 0.03, 0.06, C.stripe);
  for (let i = 0; x0 + 1.4 + i * 1.6 < x1 - 1 && i < 12; i++) {           // parked cars
    if (rnd(i * 3.1 + x0) < 0.35) continue;
    const cx = x0 + 1.25 + i * 1.6, col = BOXES[Math.floor(rnd(i + y0) * BOXES.length)];
    box(m, cx - 0.4, y0 + 0.5, cx + 0.4, y0 + 1.8, 0.03, 0.55, col, col);
  }
}

// supplier site: distribution centre with docks, rooftop plant and car park
export function warehouseMesh() {
  const body = mesh(), accent = mesh(), shadow = mesh();
  flat(body, [[-15, -12], [15, -12], [15, 12], [-15, 12]], 0.02, C.concrete);     // yard
  box(body, -11, -6, 11, 7, 0, 6, C.wall, C.roof);                                  // main shed
  for (const x of [-10.5, 10.5]) box(body, x - 0.5, -6, x + 0.5, 7, 6, 6.6, C.wall, C.wall);   // parapets
  for (let x = -8; x < 9; x += 4) box(body, x, -4, x + 1.2, 5, 6.0, 6.25, C.glassLit);  // skylights
  for (const [x, y] of [[-6, 3], [-2, 3], [5, -2]]) box(body, x, y, x + 1.6, y + 1.2, 6, 7, C.steel, C.hub); // HVAC units
  for (let x = -9; x < 10; x += 2.4) {                                              // dock doors + levellers
    box(body, x, -6.08, x + 1.6, -5.98, 0.6, 3.2, C.dark);
    box(body, x - 0.1, -7.2, x + 1.7, -6, 0, 0.6, C.steel);
  }
  box(body, -11, 7, -3, 10, 0, 4.2, C.glass, C.roofDark);                           // glazed office front
  for (const z of [1.4, 2.8]) box(body, -11.05, 6.95, -2.95, 10.05, z, z + 0.15, C.wall);
  carPark(body, -1, 7.8, 13, 11.5);
  trees(body, [[-13.5, -10, 3.4], [-13.6, 10.6, 3], [13.5, -10.5, 3.2], [13.8, 4, 2.8]]);
  // status: fascia band around the roof edge + ground halo
  for (const [x0, y0, x1, y1] of [[-11.05, -6.05, 11.05, -5.95], [-11.05, 6.95, 11.05, 7.05], [-11.05, -6, -10.95, 7], [10.95, -6, 11.05, 7]])
    box(accent, x0, y0, x1, y1, 5.3, 6.0, [1, 1, 1]);
  ring(accent, 0, 0, 17.5, 14, 0.9, 0.05, [1, 1, 1]);
  disc(shadow, 1.4, 1.4, 12.5, 7.8, 0.025, [0, 0, 0]);
  return pack(body, accent, shadow);
}

// customer plant: manufacturing halls with saw-tooth roofs, office tower, utilities, tanks
export function factoryMesh() {
  const body = mesh(), accent = mesh(), shadow = mesh();
  flat(body, [[-17, -13], [17, -13], [17, 13], [-17, 13]], 0.02, C.concrete);
  box(body, -14, -8, 8, 6, 0, 6.5, C.wall, C.roof);                                 // main hall
  for (let i = 0; i < 5; i++) {                                                     // saw-tooth roof with north lights
    const x0 = -14 + i * 4.4;
    quad(body, [x0, -8, 6.5], [x0 + 4.4, -8, 9], [x0 + 4.4, 6, 9], [x0, 6, 6.5], C.roof);
    quad(body, [x0 + 4.4, -8, 9], [x0 + 4.4, -8, 6.5], [x0 + 4.4, 6, 6.5], [x0 + 4.4, 6, 9], C.glassLit);
    tri(body, [x0, -8, 6.5], [x0 + 4.4, -8, 6.5], [x0 + 4.4, -8, 9], C.wall);
    tri(body, [x0 + 4.4, 6, 6.5], [x0, 6, 6.5], [x0 + 4.4, 6, 9], C.wall);
  }
  box(body, 8, -8, 14, -1, 0, 5, C.wall, C.roofDark);                              // second hall
  box(body, 9, 1, 14, 6, 0, 13, C.glass, C.roofDark);                               // office tower
  for (let z = 2; z < 13; z += 2.2) box(body, 8.95, 0.95, 14.05, 6.05, z, z + 0.25, C.wall);
  cylinder(body, -12, 9, 1.0, 0, 17, C.steel, 12);                                  // chimneys
  cylinder(body, -12, 9, 1.05, 14.5, 15.5, [0.75, 0.15, 0.15], 12);
  cylinder(body, -9, 9.5, 0.8, 0, 14, C.steel, 12);
  for (const x of [-4, -0.5]) cylinder(body, x, 9.5, 1.5, 0, 3.6, C.white, 14);    // storage tanks
  cylinder(body, 4, 10, 0.25, 0, 7, C.steel, 6); cylinder(body, 4, 10, 1.4, 7, 9.2, C.steel, 12);   // water tower
  carPark(body, -15, -12.6, 6, -9);
  trees(body, [[15.5, 9, 3.6], [15.5, 11.8, 3], [-16, -6, 3.2], [-16, 2, 3.4], [15.8, -11.5, 3]]);
  // status / plant colour: fascia band + ground halo
  for (const [x0, y0, x1, y1] of [[-14.05, -8.05, 8, -7.95], [-14.05, 5.95, 8, 6.05]]) box(accent, x0, y0, x1, y1, 5.6, 6.5, [1, 1, 1]);
  ring(accent, 0, 0, 19.5, 15, 1.0, 0.05, [1, 1, 1]);
  disc(shadow, 1.6, 1.6, 15, 9.5, 0.025, [0, 0, 0]);
  return pack(body, accent, shadow);
}

// sea port: quay, container yard and ship-to-shore cranes
export function portMesh() {
  const body = mesh(), accent = mesh(), shadow = mesh();
  box(body, -13, -9, 13, 9, 0, 1.0, C.concrete, C.concrete);                        // quay
  let s = 3;
  for (let x = -11; x < 2; x += 2.7) for (let y = -6; y < 7; y += 1.5) {             // container yard
    const h = 1 + Math.floor(rnd(s++) * 3);
    for (let t = 0; t < h; t++) { const col = BOXES[Math.floor(rnd(s++) * BOXES.length)]; box(body, x, y, x + 2.4, y + 1.3, 1 + t * 0.9, 1.85 + t * 0.9, col); }
  }
  for (const y of [-5.5, 2.5]) {                                                    // two STS cranes (red / white)
    for (const [dx, dy] of [[0, 0], [5, 0], [0, 3], [5, 3]]) box(body, 5 + dx, y + dy, 5.6 + dx, y + dy + 0.6, 1, 14, [0.82, 0.18, 0.15]);
    box(body, 4.6, y, 11, y + 3.6, 13.4, 14.6, C.white);
    box(body, 9.5, y + 1.2, 19, y + 2.4, 13.8, 14.4, C.white);                       // boom over the water
    box(body, 4, y + 0.6, 6, y + 3, 14.6, 16.2, [0.82, 0.18, 0.15]);                // machinery house
  }
  ring(accent, 0, 0, 16, 12, 0.8, 0.05, [1, 1, 1]);
  disc(shadow, 1.5, 1.5, 13, 9, 0.025, [0, 0, 0]);
  return pack(body, accent, shadow);
}
