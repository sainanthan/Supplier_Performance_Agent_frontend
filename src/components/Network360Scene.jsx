import { forwardRef, Suspense, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import { Canvas, extend, useFrame, useLoader, useThree } from "@react-three/fiber";
import { Environment, Line, OrbitControls, Stars } from "@react-three/drei";
import { Bloom, EffectComposer, SMAA, ToneMapping, Vignette } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import {
  BoxGeometry, BufferAttribute, BufferGeometry, CanvasTexture, CatmullRomCurve3, Color, CylinderGeometry, DoubleSide,
  ExtrudeGeometry, MOUSE, Object3D, PlaneGeometry, RepeatWrapping, Shape, Spherical, SRGBColorSpace, TextureLoader, Vector3,
} from "three";
import { Water } from "three/examples/jsm/objects/Water.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { token } from "../util";
import { containerShipCargo, containerShipHull, corrugatedTexture, PlantCampus, PortTerminal, truckContainer, truckTractor } from "./models3d";

extend({ Water });

/* Supplier Network 360: premium digital-twin diorama of the inbound supply network.
   Real-time rendered, fully free assets: reflective ocean (three.js Water + MIT water-normals texture),
   CC0 Poly Haven HDR lighting, procedural terrain, roads, city, factories, port cranes, container ships and trucks.
   Not geographic: Indian suppliers + plants on the mainland, overseas suppliers on offshore docks. */

export const SITES = {
  "IN-TN-01": [3.6, -1.6], "IN-KA-01": [-3.8, -2.6], PORT: [0.6, 6.2],
  "SUP-004": [8.6, 1.4], "SUP-005": [-11, -4.6], "SUP-007": [-7.6, 2.4], "SUP-008": [-9.4, 5.0],
  "SUP-001": [-13, 12.5], "SUP-002": [-6.5, 14.5], "SUP-003": [0.5, 15.5], "SUP-006": [7.5, 14.5], "SUP-009": [13.5, 12.5], "SUP-010": [17.5, 6.5],
};
const OVERSEAS = new Set(["SUP-001", "SUP-002", "SUP-003", "SUP-006", "SUP-009", "SUP-010"]);
const PAD = 0.3;                                         // flat ground level at every site
function rng(seed) { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// ------------------------------------------------------------------ terrain height field (shared by everything placed on land)
const SITE_LIST = Object.values(SITES);
function landMask(x, z) {
  const a = Math.atan2(z + 1, x), wob = 0.05 * Math.sin(a * 5) + 0.03 * Math.sin(a * 11 + 1);
  let m = 1 + wob - Math.hypot(x / 15.5, (z + 1) / 9);
  for (const id of OVERSEAS) { const [sx, sz] = SITES[id]; m = Math.max(m, 0.55 * (1 - Math.hypot(x - sx, z - sz) / 2.1)); }
  return m;
}
const noise = (x, z) => Math.sin(x * 0.45 + 1.3) * Math.cos(z * 0.5 - 0.7) * 0.5 + Math.sin(x * 1.1 + z * 0.8) * 0.28 + Math.sin(x * 0.23 - z * 0.31 + 2) * 0.3;
export function heightAt(x, z) {
  const m = landMask(x, z), L = smooth(0, 0.1, m);
  let d = 99; for (const [sx, sz] of SITE_LIST) d = Math.min(d, Math.hypot(x - sx, z - sz));
  const hills = smooth(0.18, 0.5, m) * smooth(2.4, 5, d) * Math.max(0, noise(x, z)) * 1.25;
  return -0.35 + L * (PAD + 0.35) + hills;
}
const v3 = ([x, z], lift = 0.05) => new Vector3(x, Math.max(heightAt(x, z), PAD) + lift, z);

// ------------------------------------------------------------------ routes
function roadCurve(a, b, bend = 0.18) {
  const A = v3(a), B = v3(b);
  const mid = A.clone().lerp(B, 0.5), d = B.clone().sub(A);
  mid.add(new Vector3(-d.z, 0, d.x).normalize().multiplyScalar(d.length() * bend));
  const pts = new CatmullRomCurve3([A, mid, B]).getPoints(40).map(p => new Vector3(p.x, Math.max(heightAt(p.x, p.z), PAD) + 0.05, p.z));
  return new CatmullRomCurve3(pts);
}
function seaCurve(a, port) {
  const A = new Vector3(a[0], 0.04, a[1] - 1.5), P = new Vector3(port[0] + 1.6, 0.04, port[1] + 2.6);
  return new CatmullRomCurve3([A, new Vector3(A.x * 0.6 + P.x * 0.4, 0.04, A.z * 0.5 + P.z * 0.5 + 1.2), P]);
}
export function buildRoutes(lanes) {
  const r = {};
  for (const l of lanes) {
    const s = SITES[l.supplier_id], p = SITES[l.plant_id];
    if (!s || !p) continue;
    r[l.id] = OVERSEAS.has(l.supplier_id)
      ? { sea: seaCurve(s, SITES.PORT), road: roadCurve(SITES.PORT, p, 0.12), mode: "SEA" }
      : { road: roadCurve(s, p, l.supplier_id.charCodeAt(6) % 2 ? 0.16 : -0.16), mode: "ROAD" };
  }
  return r;
}

// ------------------------------------------------------------------ geometry helpers (merged, vertex-coloured models)
function part(geo, color, [x = 0, y = 0, z = 0] = []) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.translate(x, y, z);
  const c = new Color(color), n = g.attributes.position.count, arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  g.setAttribute("color", new BufferAttribute(arr, 3));
  for (const k of Object.keys(g.attributes)) if (!["position", "normal", "color"].includes(k)) g.deleteAttribute(k);
  return g;
}
const merge = parts => mergeGeometries(parts, false);

export function shipGeometry(C) {
  const s = new Shape();
  s.moveTo(-0.17, -0.55); s.lineTo(0.17, -0.55); s.lineTo(0.17, 0.32); s.quadraticCurveTo(0.12, 0.5, 0, 0.6); s.quadraticCurveTo(-0.12, 0.5, -0.17, 0.32); s.closePath();
  const hull = new ExtrudeGeometry(s, { depth: 0.13, bevelEnabled: false }); hull.rotateX(-Math.PI / 2); hull.translate(0, -0.03, 0);
  const deck = new ExtrudeGeometry(s, { depth: 0.012, bevelEnabled: false }); deck.rotateX(-Math.PI / 2); deck.translate(0, 0.1, 0);
  const parts = [part(hull, C.hull), part(new BoxGeometry(0.345, 0.03, 0.9), C.hullStripe, [0, 0.005, -0.08]), part(deck, C.deck)];
  const boxCols = [C.box1, C.box2, C.box3, C.box4, C.box5];
  let k = 0;
  for (let bay = 0; bay < 5; bay++) for (let row = 0; row < 2; row++) for (let tier = 0; tier < 2 + ((bay + row) % 2); tier++)
    parts.push(part(new BoxGeometry(0.135, 0.065, 0.13), boxCols[(k++ * 7 + bay) % 5], [row ? 0.072 : -0.072, 0.15 + tier * 0.068, -0.28 + bay * 0.15]));
  parts.push(part(new BoxGeometry(0.3, 0.16, 0.13), C.bridge, [0, 0.19, -0.46]));
  parts.push(part(new BoxGeometry(0.31, 0.03, 0.135), C.window, [0, 0.235, -0.46]));
  parts.push(part(new BoxGeometry(0.22, 0.05, 0.1), C.bridge, [0, 0.29, -0.46]));
  parts.push(part(new CylinderGeometry(0.035, 0.04, 0.14, 10), C.funnel, [0.06, 0.33, -0.52]));
  return merge(parts);
}
export function truckGeometry(C) {
  const parts = [
    part(new BoxGeometry(0.15, 0.15, 0.36), C.trailer, [0, 0.12, -0.08]),
    part(new BoxGeometry(0.152, 0.025, 0.362), C.trailerStripe, [0, 0.07, -0.08]),
    part(new BoxGeometry(0.15, 0.13, 0.12), C.cab, [0, 0.105, 0.19]),
    part(new BoxGeometry(0.152, 0.05, 0.03), C.window, [0, 0.14, 0.25]),
    part(new BoxGeometry(0.11, 0.02, 0.5), C.chassis, [0, 0.04, 0.02]),
  ];
  for (const [x, z] of [[-0.075, 0.18], [0.075, 0.18], [-0.075, -0.02], [0.075, -0.02], [-0.075, -0.16], [0.075, -0.16]]) {
    const w = new CylinderGeometry(0.035, 0.035, 0.03, 10); w.rotateZ(Math.PI / 2);
    parts.push(part(w, C.tyre, [x, 0.035, z]));
  }
  return merge(parts);
}

function windowTexture(facade, lit, dark, seed, night) {
  const W = 64, H = 128, c = document.createElement("canvas"); c.width = W; c.height = H;
  const g = c.getContext("2d"), r = rng(seed);
  g.fillStyle = facade; g.fillRect(0, 0, W, H);
  for (let y = 6; y < H - 6; y += 12) for (let x = 5; x < W - 5; x += 10) {
    g.fillStyle = night ? (r() > 0.45 ? lit : dark) : (r() > 0.85 ? lit : dark);
    g.fillRect(x, y, 6, 7);
  }
  const t = new CanvasTexture(c); t.colorSpace = SRGBColorSpace; t.wrapS = t.wrapT = RepeatWrapping; return t;
}
export function foamTexture() {
  const c = document.createElement("canvas"); c.width = 64; c.height = 256; const g = c.getContext("2d");
  const grd = g.createLinearGradient(0, 0, 0, 256); grd.addColorStop(0, "rgba(255,255,255,0.9)"); grd.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grd; g.beginPath(); g.moveTo(26, 0); g.lineTo(38, 0); g.lineTo(64, 256); g.lineTo(0, 256); g.closePath(); g.fill();
  return new CanvasTexture(c);
}

// ------------------------------------------------------------------ label cards (canvas sprites, constant screen size)
function cardTexture({ title, sub, dot, bg, ink, muted, pin }) {
  const W = 520, H = pin ? 150 : 132, c = document.createElement("canvas"); c.width = W; c.height = H;
  const g = c.getContext("2d");
  g.fillStyle = bg; g.beginPath(); g.roundRect(4, 4, W - 8, H - 8, 22); g.fill();
  g.lineWidth = 3; g.strokeStyle = dot; g.globalAlpha = 0.6; g.stroke(); g.globalAlpha = 1;
  if (pin) { g.fillStyle = dot; g.beginPath(); g.arc(52, H / 2 - 8, 22, Math.PI, 0); g.lineTo(52, H / 2 + 34); g.closePath(); g.fill(); g.fillStyle = bg; g.beginPath(); g.arc(52, H / 2 - 8, 9, 0, Math.PI * 2); g.fill(); }
  else { g.fillStyle = dot; g.beginPath(); g.arc(46, H / 2, 17, 0, Math.PI * 2); g.fill(); }
  const tx = pin ? 96 : 82;
  g.fillStyle = ink; g.font = "700 46px Inter, system-ui, sans-serif"; g.fillText(title, tx, H / 2 - (sub ? 4 : -14), W - tx - 16);
  if (sub) { g.fillStyle = muted; g.font = "600 36px Inter, system-ui, sans-serif"; g.fillText(sub, tx, H / 2 + 40, W - tx - 16); }
  const t = new CanvasTexture(c); t.colorSpace = SRGBColorSpace; t.anisotropy = 4;
  return { t, aspect: W / H };
}
export function Card({ position, scale = 0.03, center = [0.5, 0], spriteRef, ...p }) {
  const { t, aspect } = useMemo(() => cardTexture(p), [p.title, p.sub, p.dot, p.bg, p.ink, p.muted, p.pin]); // eslint-disable-line
  return (
    <sprite ref={spriteRef} position={position} scale={[scale * aspect, scale, 1]} center={center} renderOrder={20}>
      <spriteMaterial map={t} transparent depthTest={false} sizeAttenuation={false} toneMapped={false} />
    </sprite>
  );
}

// ------------------------------------------------------------------ ocean, terrain, city, trees
export function Ocean({ C }) {
  const ref = useRef();
  const normals = useLoader(TextureLoader, "/env/waternormals.jpg");
  normals.wrapS = normals.wrapT = RepeatWrapping;
  const args = useMemo(() => [new PlaneGeometry(220, 220), {
    textureWidth: 512, textureHeight: 512, waterNormals: normals, sunDirection: new Vector3(0.5, 0.6, 0.4).normalize(),
    sunColor: new Color(C.sun), waterColor: new Color(C.water), distortionScale: C.night ? 1.4 : 2.2, fog: true, alpha: 1,
  }], [normals, C.water, C.sun, C.night]); // eslint-disable-line
  // Night: glossy dark sea with scrolling wave normals lit by the night HDR (the mirror shader washes out in low light).
  const nightNormals = useMemo(() => { const t = normals.clone(); t.wrapS = t.wrapT = RepeatWrapping; t.repeat.set(26, 26); t.needsUpdate = true; return t; }, [normals]);
  useFrame((_, dt) => {
    if (ref.current?.material?.uniforms) ref.current.material.uniforms.time.value += dt * 0.35;
    if (C.night) { nightNormals.offset.x += dt * 0.006; nightNormals.offset.y += dt * 0.004; }
  });
  useEffect(() => { if (ref.current?.material?.uniforms) ref.current.material.uniforms.size.value = 3.2; }, [args]);
  if (C.night) return (
    <mesh rotation-x={-Math.PI / 2} receiveShadow>
      <planeGeometry args={[220, 220]} />
      <meshStandardMaterial color={C.water} metalness={0.55} roughness={0.18} normalMap={nightNormals} normalScale={[0.55, 0.55]} envMapIntensity={1.6} />
    </mesh>);
  return <water ref={ref} args={args} rotation-x={-Math.PI / 2} position={[0, 0, 0]} />;
}

function Terrain({ C }) {
  const geo = useMemo(() => {
    const g = new PlaneGeometry(46, 32, 230, 160); g.rotateX(-Math.PI / 2); g.translate(2, 0, 4.5);
    const p = g.attributes.position, col = new Float32Array(p.count * 3);
    const sand = new Color(C.sand), grass = new Color(C.grass), hill = new Color(C.hill), bed = new Color(C.seabed), tmp = new Color();
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i), h = heightAt(x, z);
      p.setY(i, h);
      if (h < 0.02) tmp.copy(bed).lerp(sand, smooth(-0.3, 0.02, h));
      else if (h < PAD - 0.02) tmp.copy(sand);
      else tmp.copy(grass).lerp(hill, smooth(PAD + 0.05, PAD + 0.9, h));
      tmp.offsetHSL(0, 0, (Math.sin(x * 3.1) * Math.cos(z * 2.7)) * 0.015);
      col.set([tmp.r, tmp.g, tmp.b], i * 3);
    }
    g.setAttribute("color", new BufferAttribute(col, 3)); g.computeVertexNormals();
    return g;
  }, [C]);
  return <mesh geometry={geo} receiveShadow castShadow><meshStandardMaterial vertexColors roughness={0.95} metalness={0} /></mesh>;
}

function Trees({ C }) {
  const trunks = useRef(), crowns = useRef();
  const pts = useMemo(() => {
    const r = rng(42), out = [];
    let guard = 0;
    while (out.length < 900 && guard++ < 20000) {
      const x = (r() - 0.5) * 34 + 1, z = (r() - 0.5) * 20 - 1, h = heightAt(x, z);
      let d = 99; for (const [sx, sz] of SITE_LIST) d = Math.min(d, Math.hypot(x - sx, z - sz));
      if (h > PAD - 0.01 && d > 1.9 && landMask(x, z) > 0.08) out.push([x, h, z, 0.55 + r() * 0.6, r()]);
    }
    return out;
  }, []);
  useEffect(() => {
    const o = new Object3D(), shades = [new Color(C.tree1), new Color(C.tree2), new Color(C.tree3)];
    pts.forEach(([x, y, z, s, k], i) => {
      o.position.set(x, y + 0.06 * s, z); o.scale.setScalar(s); o.rotation.set(0, k * 6, 0); o.updateMatrix(); trunks.current.setMatrixAt(i, o.matrix);
      o.position.set(x, y + 0.2 * s, z); o.updateMatrix(); crowns.current.setMatrixAt(i, o.matrix); crowns.current.setColorAt(i, shades[Math.min(2, Math.floor(k * 3))]);
    });
    trunks.current.instanceMatrix.needsUpdate = crowns.current.instanceMatrix.needsUpdate = true;
    if (crowns.current.instanceColor) crowns.current.instanceColor.needsUpdate = true;
  }, [pts, C]);
  return (
    <group>
      <instancedMesh ref={trunks} args={[null, null, pts.length]} castShadow><cylinderGeometry args={[0.02, 0.025, 0.12, 5]} /><meshStandardMaterial color={C.trunk} roughness={1} /></instancedMesh>
      <instancedMesh ref={crowns} args={[null, null, pts.length]} castShadow><icosahedronGeometry args={[0.13, 0]} /><meshStandardMaterial roughness={0.9} flatShading /></instancedMesh>
    </group>
  );
}

function City({ C }) {
  const ref = useRef();
  const blocks = useMemo(() => {
    const r = rng(9), out = [];
    for (const pid of ["IN-TN-01", "IN-KA-01"]) {
      const [cx, cz] = SITES[pid];
      for (let i = 0; i < 70; i++) {
        const a = r() * Math.PI * 2, d = 2.3 + r() * 2.6, x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d * 0.75;
        const h = heightAt(x, z); if (h < PAD - 0.01 || h > PAD + 0.25) continue;
        out.push([x, h, z, 0.18 + r() * 0.2, 0.2 + r() * (d < 3.4 ? 0.9 : 0.45), 0.18 + r() * 0.18, r()]);
      }
    }
    return out;
  }, []);
  const [map, emissive] = useMemo(() => [windowTexture(C.facade, C.windowDay, C.windowDark, 3, false), windowTexture("#000000", C.windowLit, "#000000", 3, true)], [C]);
  useEffect(() => {
    const o = new Object3D();
    blocks.forEach(([x, y, z, w, h, d, k], i) => { o.position.set(x, y + h / 2, z); o.scale.set(w, h, d); o.rotation.set(0, Math.round(k * 4) * 0.39, 0); o.updateMatrix(); ref.current.setMatrixAt(i, o.matrix); });
    ref.current.instanceMatrix.needsUpdate = true;
  }, [blocks]);
  return (
    <instancedMesh ref={ref} args={[null, null, blocks.length]} castShadow receiveShadow>
      <boxGeometry /><meshStandardMaterial map={map} emissiveMap={emissive} emissive={C.windowLit} emissiveIntensity={C.night ? 1.6 : 0} roughness={0.7} />
    </instancedMesh>
  );
}

// ------------------------------------------------------------------ roads with glowing edges and street lights
function roadRibbon(curve, width) {
  const N = 90, pos = [], idx = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N, p = curve.getPointAt(t), tg = curve.getTangentAt(t), side = new Vector3(-tg.z, 0, tg.x).normalize().multiplyScalar(width / 2);
    for (const s of [-1, 1]) { const q = p.clone().addScaledVector(side, s); pos.push(q.x, Math.max(heightAt(q.x, q.z), PAD) + 0.03, q.z); }
    if (i < N) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const g = new BufferGeometry(); g.setAttribute("position", new BufferAttribute(new Float32Array(pos), 3)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}
function Road({ curve, C, dim }) {
  const geo = useMemo(() => roadRibbon(curve, 0.34), [curve]);
  const edges = useMemo(() => [-1, 1].map(s => curve.getPoints(90).map((p, i, a) => {
    const tg = curve.getTangentAt(i / (a.length - 1)), side = new Vector3(-tg.z, 0, tg.x).normalize().multiplyScalar(0.17 * s), q = p.clone().add(side);
    return [q.x, Math.max(heightAt(q.x, q.z), PAD) + 0.05, q.z];
  })), [curve]);
  const centre = useMemo(() => curve.getPoints(90).map(p => [p.x, Math.max(heightAt(p.x, p.z), PAD) + 0.045, p.z]), [curve]);
  const glow = useMemo(() => new Color(C.roadGlow).multiplyScalar(C.night ? 2.2 : 1), [C]);
  const dash = useRef();
  useFrame((_, dt) => { if (dash.current?.material) dash.current.material.dashOffset -= dt * 0.6; });
  return (
    <group>
      <mesh geometry={geo} receiveShadow><meshStandardMaterial color={C.asphalt} roughness={0.85} side={DoubleSide} transparent opacity={dim ? 0.5 : 1} /></mesh>
      {edges.map((e, i) => <Line key={i} points={e} color={glow} lineWidth={C.night ? 1.6 : 1.1} transparent opacity={dim ? 0.25 : 0.95} toneMapped={false} />)}
      <Line ref={dash} points={centre} color={C.laneMark} lineWidth={1} dashed dashSize={0.12} gapSize={0.12} transparent opacity={dim ? 0.2 : 0.8} />
    </group>
  );
}
function StreetLights({ curves, C }) {
  const poles = useRef(), bulbs = useRef();
  const pts = useMemo(() => {
    const out = [];
    for (const c of curves) {
      const L = c.getLength(), n = Math.floor(L / 1.1);
      for (let i = 1; i < n; i++) {
        const t = i / n, p = c.getPointAt(t), tg = c.getTangentAt(t), side = new Vector3(-tg.z, 0, tg.x).normalize().multiplyScalar(i % 2 ? 0.28 : -0.28);
        const q = p.clone().add(side); out.push([q.x, Math.max(heightAt(q.x, q.z), PAD), q.z]);
      }
    }
    return out;
  }, [curves]);
  useEffect(() => {
    if (!poles.current || !bulbs.current) return;
    const o = new Object3D();
    pts.forEach(([x, y, z], i) => { o.position.set(x, y + 0.13, z); o.updateMatrix(); poles.current.setMatrixAt(i, o.matrix); o.position.set(x, y + 0.27, z); o.updateMatrix(); bulbs.current.setMatrixAt(i, o.matrix); });
    poles.current.instanceMatrix.needsUpdate = bulbs.current.instanceMatrix.needsUpdate = true;
  }, [pts]);
  const lamp = useMemo(() => new Color(C.lamp).multiplyScalar(C.night ? 4 : 1.2), [C]);
  if (!pts.length) return null;
  return (
    <group>
      <instancedMesh ref={poles} args={[null, null, pts.length]}><cylinderGeometry args={[0.008, 0.01, 0.26, 5]} /><meshStandardMaterial color={C.pole} /></instancedMesh>
      <instancedMesh ref={bulbs} args={[null, null, pts.length]}><sphereGeometry args={[0.022, 8, 8]} /><meshBasicMaterial color={lamp} toneMapped={false} /></instancedMesh>
    </group>
  );
}
function SeaRoute({ curve, C, dim }) {
  const pts = useMemo(() => curve.getPoints(80).map(p => [p.x, 0.06, p.z]), [curve]);
  const ref = useRef(), glow = useMemo(() => new Color(C.seaRoute).multiplyScalar(C.night ? 2.4 : 1.3), [C]);
  useFrame((_, dt) => { if (ref.current?.material) ref.current.material.dashOffset -= dt * 0.9; });
  return <Line ref={ref} points={pts} color={glow} lineWidth={2.4} dashed dashSize={0.35} gapSize={0.25} transparent opacity={dim ? 0.25 : 1} toneMapped={false} />;
}

// ------------------------------------------------------------------ sites
function StatusRing({ pos, color, r = 1.1, night }) {
  const wave = useRef();
  const glow = useMemo(() => new Color(color).multiplyScalar(night ? 2.6 : 1.4), [color, night]);
  useFrame(({ clock }) => {
    if (!wave.current) return;
    const t = (clock.elapsedTime * 0.6 + pos[0]) % 1;
    wave.current.scale.setScalar(1 + t * 0.7); wave.current.material.opacity = 0.5 * (1 - t);
  });
  return (
    <group position={pos}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[r, r + 0.08, 72]} /><meshBasicMaterial color={glow} toneMapped={false} /></mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.005, 0]}><circleGeometry args={[r, 56]} /><meshBasicMaterial color={color} transparent opacity={0.1} depthWrite={false} /></mesh>
      <mesh ref={wave} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[r, r + 0.045, 72]} /><meshBasicMaterial color={glow} toneMapped={false} transparent depthWrite={false} /></mesh>
    </group>
  );
}

function useFacade(C, seed) {
  return useMemo(() => ({ map: windowTexture(C.facade, C.windowDay, C.windowDark, seed, false), emissive: windowTexture("#000000", C.windowLit, "#000000", seed, true) }), [C, seed]);
}
function Facade({ args, position, C, tex }) {
  return (
    <mesh position={position} castShadow receiveShadow>
      <boxGeometry args={args} />
      <meshStandardMaterial map={tex.map} emissiveMap={tex.emissive} emissive={C.windowLit} emissiveIntensity={C.night ? 1.4 : 0} roughness={0.6} />
    </mesh>
  );
}

function SupplierSite({ id, s, status, C, selected, dim, onClick }) {
  const [x, z] = SITES[id];
  const y = Math.max(heightAt(x, z), PAD);
  const col = { HEALTHY: C.ok, WATCH: C.watch, RISK: C.late }[status];
  const tex = useFacade(C, id.charCodeAt(6));
  return (
    <group onClick={e => { e.stopPropagation(); onClick(id); }} onPointerOver={() => (document.body.style.cursor = "pointer")} onPointerOut={() => (document.body.style.cursor = "auto")}>
      <group position={[x, y, z]} scale={selected ? 1.1 : 1}>
        <mesh position={[0, 0.005, 0]} receiveShadow><boxGeometry args={[1.9, 0.02, 1.4]} /><meshStandardMaterial color={C.concrete} /></mesh>
        <Facade args={[1.0, 0.42, 0.62]} position={[-0.15, 0.21, -0.1]} C={C} tex={tex} />
        <Facade args={[0.5, 0.62, 0.42]} position={[0.55, 0.31, -0.18]} C={C} tex={tex} />
        <mesh position={[-0.15, 0.44, -0.1]} castShadow><boxGeometry args={[1.04, 0.04, 0.66]} /><meshStandardMaterial color={C.roof} /></mesh>
        {[[-0.45, -0.25], [-0.1, -0.2], [0.18, 0.02]].map(([ax, az], i) => <mesh key={i} position={[ax, 0.5, az]} castShadow><boxGeometry args={[0.12, 0.08, 0.12]} /><meshStandardMaterial color={C.hvac} metalness={0.4} roughness={0.4} /></mesh>)}
        {[-0.45, -0.15, 0.15].map((dx, i) => <mesh key={i} position={[dx, 0.12, 0.215]}><boxGeometry args={[0.18, 0.2, 0.01]} /><meshStandardMaterial color={C.door} /></mesh>)}
        <mesh position={[0.55, 0.75, -0.18]}><cylinderGeometry args={[0.04, 0.05, 0.26, 10]} /><meshStandardMaterial color={C.roof} /></mesh>
        {OVERSEAS.has(id) && <mesh position={[0, -0.12, -1.45]} castShadow receiveShadow><boxGeometry args={[1.6, 0.18, 0.55]} /><meshStandardMaterial color={C.concrete} /></mesh>}
      </group>
      <StatusRing pos={[x, y + 0.03, z]} color={col} r={selected ? 1.2 : 1.02} night={C.night} />
      {!dim && <Card position={[x, y + 1.05, z]} title={id} sub={`${s?.supplier_name?.split(" ").slice(0, 2).join(" ") || ""} · ${s?.otif_pct ?? "–"}%`}
        dot={col} bg={C.card} ink={C.cardInk} muted={C.cardMuted} scale={selected ? 0.034 : 0.028} />}
    </group>
  );
}

function SawtoothRoof({ position, length, count, C }) {
  const geo = useMemo(() => { const s = new Shape(); s.moveTo(0, 0); s.lineTo(0.32, 0); s.lineTo(0.32, 0.16); s.closePath(); const g = new ExtrudeGeometry(s, { depth: length, bevelEnabled: false }); g.translate(-0.16, 0, -length / 2); return g; }, [length]);
  return Array.from({ length: count }).map((_, i) => (
    <mesh key={i} geometry={geo} position={[position[0] - (count * 0.32) / 2 + i * 0.32 + 0.16, position[1], position[2]]} castShadow><meshStandardMaterial color={i % 2 ? C.roof : C.roofLight} roughness={0.5} metalness={0.3} /></mesh>));
}
function PlantSite({ id, label, C, inbound }) {
  const [x, z] = SITES[id];
  const y = Math.max(heightAt(x, z), PAD);
  return (
    <group>
      <group position={[x, y, z]}><PlantCampus C={C} seed={id === "IN-TN-01" ? 11 : 17} /></group>
      <StatusRing pos={[x, y + 0.03, z]} color={C.plant} r={2.35} night={C.night} />
      <Card position={[x, y + 2.0, z]} title={label} sub={`${id} · ${inbound} inbound`} dot={C.plantPin} bg={C.card} ink={C.cardInk} muted={C.cardMuted} pin scale={0.036} />
    </group>
  );
}

function Crane({ position, C }) {
  const col = C.crane;
  return (
    <group position={position}>
      {[[-0.22, -0.18], [0.22, -0.18], [-0.22, 0.18], [0.22, 0.18]].map(([lx, lz], i) => <mesh key={i} position={[lx, 0.55, lz]} castShadow><boxGeometry args={[0.05, 1.1, 0.05]} /><meshStandardMaterial color={col} metalness={0.3} /></mesh>)}
      <mesh position={[0, 1.1, 0]} castShadow><boxGeometry args={[0.52, 0.08, 0.44]} /><meshStandardMaterial color={col} metalness={0.3} /></mesh>
      <mesh position={[0, 1.18, 0.75]} castShadow><boxGeometry args={[0.12, 0.07, 2.2]} /><meshStandardMaterial color={col} metalness={0.3} /></mesh>
      <mesh position={[0, 1.24, 0.12]}><boxGeometry args={[0.16, 0.12, 0.16]} /><meshStandardMaterial color={C.bridge} /></mesh>
      <mesh position={[0, 0.85, 1.35]}><boxGeometry args={[0.02, 0.6, 0.02]} /><meshStandardMaterial color={C.pole} /></mesh>
    </group>
  );
}
function PortHub({ C, inbound, shipGeo, cargoGeo }) {
  const [x, z] = SITES.PORT;
  return (
    <group>
      <group position={[x + 0.2, PAD, z + 1.4]}><PortTerminal C={C} shipHull={shipGeo} shipCargo={cargoGeo} /></group>
      <StatusRing pos={[x + 0.2, PAD + 0.04, z + 1.4]} color={C.seaRoute} r={3.6} night={C.night} />
      <Card position={[x - 1.6, PAD + 1.7, z + 0.8]} title="Port Hub" sub={`Chennai port · ${inbound} ships`} dot={C.plantPin} bg={C.card} ink={C.cardInk} muted={C.cardMuted} pin scale={0.032} />
    </group>
  );
}

// ------------------------------------------------------------------ vehicles: detailed instanced ships + trucks, wakes and status badges
const MAXV = 160;
export function badgeTexture(fill, ink) {
  const S = 96, c = document.createElement("canvas"); c.width = c.height = S; const g = c.getContext("2d"); g.translate(S / 2, S / 2);
  g.beginPath(); g.arc(0, 0, 40, 0, Math.PI * 2); g.fillStyle = fill; g.fill(); g.lineWidth = 5; g.strokeStyle = ink; g.stroke();
  g.fillStyle = ink; g.beginPath(); g.moveTo(-22, 2); g.lineTo(22, 2); g.lineTo(15, 15); g.lineTo(-15, 15); g.closePath(); g.fill();
  g.fillRect(-10, -9, 8, 9); g.fillRect(0, -9, 8, 9); g.fillRect(-19, -18, 7, 18);
  const t = new CanvasTexture(c); t.colorSpace = SRGBColorSpace; return t;
}
function Vehicles({ data, routes, simDayRef, C, filters, statusOf, selectedSupplier, onPick, shipGeo, cargoGeo }) {
  const ships = useRef(), trucks = useRef(), wakes = useRef(), heads = useRef(), badges = useRef([]), cargo = useRef(), boxes = useRef();
  const truckGeo = useMemo(() => truckTractor(C), [C]), boxGeo = useMemo(() => truckContainer(C, C.box2), [C]);
  const corr = useMemo(() => corrugatedTexture(), []);
  const foam = useMemo(() => foamTexture(), []);
  const ids = useRef({ ship: [], truck: [] });
  const o = useMemo(() => new Object3D(), []);
  const P = useMemo(() => new Vector3(), []), T = useMemo(() => new Vector3(), []);
  const badgeMats = useMemo(() => ({ ok: badgeTexture(C.ok, C.trailer), late: badgeTexture(C.late, C.trailer), dis: badgeTexture(C.watch, C.trailer) }), [C]);
  const headCol = useMemo(() => new Color(C.lamp).multiplyScalar(C.night ? 5 : 1), [C]);

  useFrame(({ clock }) => {
    if (!ships.current || !trucks.current) return;
    const day = simDayRef.current, t = clock.elapsedTime;
    let ns = 0, nt = 0, nb = 0;
    ids.current.ship.length = 0; ids.current.truck.length = 0;
    for (const s of data.shipments) {
      if (day < s.t_depart || day >= s.t_eta) continue;
      const rt = routes[s.lane]; if (!rt) continue;
      if (filters.plant && s.plant_id !== filters.plant) continue;
      if (!filters.status.has(statusOf(s.supplier_id))) continue;
      if (filters.category && filters.catOf?.[s.material_id] !== filters.category) continue;
      const p = (day - s.t_depart) / Math.max(0.01, s.t_eta - s.t_depart);
      const atSea = rt.mode === "SEA" && p < 0.85;
      if ((atSea && !filters.sea) || (!atSea && !filters.road)) continue;
      const curve = atSea ? rt.sea : rt.road, u = Math.min(0.999, Math.max(0, atSea ? p / 0.85 : rt.mode === "SEA" ? (p - 0.85) / 0.15 : p));
      curve.getPointAt(u, P); curve.getTangentAt(u, T);
      const heading = Math.atan2(T.x, T.z);
      const st = s.disrupted ? "dis" : day > s.t_promised ? "late" : "ok";
      const big = selectedSupplier && s.supplier_id === selectedSupplier ? 1.2 : 1;
      if (atSea && ns < MAXV) {
        o.position.set(P.x, 0.03 + Math.sin(t * 1.8 + s.t_po) * 0.012, P.z); o.rotation.set(Math.sin(t * 1.3 + s.t_eta) * 0.035, heading, Math.sin(t * 1.1 + s.t_po) * 0.03); o.scale.setScalar(0.82 * big); o.updateMatrix();
        ships.current.setMatrixAt(ns, o.matrix); cargo.current.setMatrixAt(ns, o.matrix);
        o.rotation.set(-Math.PI / 2, 0, -heading); o.position.set(P.x - T.x * 0.75, 0.012, P.z - T.z * 0.75); o.scale.set(0.3 * big, 0.9 * big, 1); o.updateMatrix(); wakes.current.setMatrixAt(ns, o.matrix);
        ids.current.ship.push(s.id);
        const b = badges.current[nb];
        if (b && nb < 18) { b.visible = true; b.position.set(P.x, 0.95, P.z); b.material.map = badgeMats[st]; b.material.needsUpdate = true; b.userData.id = s.id; nb++; }
        ns++;
      } else if (!atSea && nt < MAXV) {
        o.position.set(P.x, P.y - 0.02 + Math.abs(Math.sin(t * 9 + s.t_po)) * 0.004, P.z); o.rotation.set(0, heading, 0); o.scale.setScalar(1.25 * big); o.updateMatrix();
        trucks.current.setMatrixAt(nt, o.matrix); boxes.current.setMatrixAt(nt, o.matrix);
        o.translateZ(0.33); o.translateY(0.1); o.updateMatrix(); heads.current.setMatrixAt(nt, o.matrix);
        ids.current.truck.push(s.id); nt++;
      }
    }
    ships.current.count = wakes.current.count = cargo.current.count = ns; trucks.current.count = heads.current.count = boxes.current.count = nt;
    for (const m of [ships, wakes, trucks, heads, cargo, boxes]) m.current.instanceMatrix.needsUpdate = true;
    for (let i = nb; i < badges.current.length; i++) if (badges.current[i]) badges.current[i].visible = false;
  });
  const pick = k => e => { e.stopPropagation(); const id = ids.current[k][e.instanceId]; if (id) onPick(id); };
  return (
    <group>
      <instancedMesh ref={ships} args={[shipGeo, null, MAXV]} castShadow onClick={pick("ship")}><meshStandardMaterial vertexColors roughness={0.55} metalness={0.15} /></instancedMesh>
      <instancedMesh ref={wakes} args={[null, null, MAXV]}><planeGeometry args={[1, 1]} /><meshBasicMaterial map={foam} transparent opacity={0.55} depthWrite={false} /></instancedMesh>
      <instancedMesh ref={cargo} args={[cargoGeo, null, MAXV]} castShadow onClick={pick("ship")}><meshStandardMaterial vertexColors map={corr} roughness={0.6} metalness={0.2} /></instancedMesh>
      <instancedMesh ref={trucks} args={[truckGeo, null, MAXV]} castShadow onClick={pick("truck")}><meshStandardMaterial vertexColors roughness={0.45} metalness={0.3} /></instancedMesh>
      <instancedMesh ref={boxes} args={[boxGeo, null, MAXV]} castShadow onClick={pick("truck")}><meshStandardMaterial vertexColors map={corr} roughness={0.6} metalness={0.2} /></instancedMesh>
      <instancedMesh ref={heads} args={[null, null, MAXV]}><boxGeometry args={[0.13, 0.02, 0.01]} /><meshBasicMaterial color={headCol} toneMapped={false} /></instancedMesh>
      {Array.from({ length: 40 }).map((_, i) => (
        <sprite key={i} ref={el => (badges.current[i] = el)} visible={false} scale={[0.024, 0.024, 1]} renderOrder={25}
          onClick={e => { e.stopPropagation(); const id = e.object.userData.id; if (id) onPick(id); }}>
          <spriteMaterial transparent depthTest={false} sizeAttenuation={false} toneMapped={false} />
        </sprite>))}
    </group>
  );
}

// ------------------------------------------------------------------ camera rig with imperative API
const HOME = { pos: new Vector3(3, 19, 27), target: new Vector3(2, 0, 4.5) };
function Rig({ controls, apiRef }) {
  const { camera } = useThree();
  const goal = useRef({ pos: HOME.pos.clone(), target: HOME.target.clone(), on: true });
  useMemo(() => camera.position.set(30, 40, 50), [camera]);
  useImperativeHandle(apiRef, () => {
    const orbit = fn => {
      const ctl = controls.current; if (!ctl) return;
      const tg = ctl.target.clone(), sp = new Spherical().setFromVector3(camera.position.clone().sub(tg));
      fn(sp); sp.phi = Math.max(0.08, Math.min(1.38, sp.phi)); sp.radius = Math.max(4, Math.min(60, sp.radius));
      goal.current = { pos: new Vector3().setFromSpherical(sp).add(tg), target: tg, on: true };
    };
    return {
      zoom: f => orbit(s => { s.radius *= f; }), rotate: d => orbit(s => { s.theta += (d * Math.PI) / 180; }),
      top: () => orbit(s => { s.phi = 0.08; }), tilt: deg => orbit(s => { s.phi = deg == null ? 1.0 : s.phi + (deg * Math.PI) / 180; }),
      perspective: () => orbit(s => { s.phi = 0.9; }), side: () => orbit(s => { s.phi = 1.35; s.radius = Math.min(s.radius, 14); }),
      north: () => orbit(s => { s.theta = 0; }),
      home: () => { goal.current = { pos: HOME.pos.clone(), target: HOME.target.clone(), on: true }; },
      focus: id => { const s = SITES[id]; if (!s) return; const tg = new Vector3(s[0], PAD, s[1]); goal.current = { pos: tg.clone().add(new Vector3(2.5, 5.5, 7)), target: tg, on: true }; },
    };
  }, [camera, controls]);
  useEffect(() => {
    const ctl = controls.current; if (!ctl) return;
    const stop = () => { goal.current.on = false; };
    ctl.addEventListener("start", stop); return () => ctl.removeEventListener("start", stop);
  }, [controls]);
  useFrame((_, dt) => {
    const ctl = controls.current; if (!ctl) return;
    if (goal.current.on) {
      const k = Math.min(1, dt * 2);
      camera.position.lerp(goal.current.pos, k); ctl.target.lerp(goal.current.target, k);
      if (camera.position.distanceTo(goal.current.pos) < 0.05) goal.current.on = false;
    }
    ctl.update();
  });
  return null;
}

// ------------------------------------------------------------------ palette (guide tokens), shared with the 3D map tracker
export function scenePalette(night) {
    const mix = (a, b, k) => "#" + new Color(token(a)).lerp(new Color(token(b)), k).getHexString();
    return {
      night,
      fog: night ? token("--page-bg") : mix("--bx-wash-6", "--white", 0.3),
      water: night ? mix("--brand-navy", "--chart-c1", 0.3) : mix("--chart-o4", "--chart-c4", 0.25), sun: night ? mix("--brand-navy", "--sky", 0.35) : token("--brand-white"),
      seabed: mix("--chart-o4", "--chart-c4", 0.3), sand: mix("--brand-peach-soft", "--brand-orange", 0.18),
      grass: night ? mix("--chart-c4", "--brand-navy", 0.55) : mix("--chart-c4", "--chart-c2", 0.12),
      hill: night ? mix("--chart-c4", "--brand-navy", 0.72) : mix("--chart-c4", "--brand-navy", 0.35),
      tree1: night ? mix("--chart-c4", "--brand-navy", 0.6) : mix("--chart-c4", "--brand-navy", 0.3),
      tree2: night ? mix("--chart-c4", "--brand-navy", 0.7) : mix("--chart-c4", "--brand-navy", 0.45),
      tree3: night ? mix("--chart-c4", "--chart-c2", 0.25) : mix("--chart-c4", "--chart-c2", 0.3), trunk: mix("--chart-c2", "--brand-navy", 0.6),
      facade: night ? mix("--muted-ink", "--brand-navy", 0.35) : mix("--white", "--muted-fill", 0.6),
      windowDay: mix("--chart-o2", "--brand-navy", 0.35), windowDark: night ? mix("--brand-navy", "--muted-ink", 0.2) : mix("--chart-o3", "--brand-navy", 0.3),
      windowLit: mix("--brand-orange", "--brand-white", 0.45), lamp: mix("--brand-orange", "--brand-white", 0.55),
      concrete: night ? mix("--muted-ink", "--brand-navy", 0.45) : mix("--muted-fill", "--muted-ink", 0.25),
      quayEdge: token("--brand-orange"), roof: mix("--muted-ink", "--brand-navy", 0.25), roofLight: mix("--muted-ink", "--white", 0.35),
      hvac: mix("--muted-ink", "--white", 0.5), door: mix("--chart-o3", "--brand-navy", 0.4),
      tank: mix("--white", "--muted-ink", 0.15), stack: mix("--white", "--muted-ink", 0.2), stackBand: token("--depth-0"), smoke: mix("--muted-fill", "--muted-ink", 0.3),
      asphalt: night ? mix("--brand-navy", "--muted-ink", 0.3) : mix("--muted-ink", "--brand-navy", 0.4), laneMark: mix("--brand-white", "--brand-orange", 0.2),
      roadGlow: night ? token("--sky") : mix("--sky", "--white", 0.3), seaRoute: token("--cyan"), pole: mix("--muted-ink", "--brand-navy", 0.3),
      ok: token("--chart-c4"), watch: token("--brand-orange"), late: token("--depth-0"), plant: token("--depth-2"), plantPin: token("--brand-blue"),
      crane: token("--chart-c1"), bridge: token("--brand-white"), window: mix("--brand-navy", "--chart-o3", 0.2),
      hull: mix("--brand-navy", "--depth-0", 0.15), hullStripe: token("--depth-0"), deck: mix("--muted-ink", "--depth-0", 0.3), funnel: token("--brand-orange"),
      box1: token("--brand-blue"), box2: token("--brand-orange"), box3: token("--depth-0"), box4: token("--chart-c4"), box5: mix("--brand-white", "--muted-fill", 0.3),
      trailer: token("--brand-white"), trailerStripe: token("--brand-blue"), cab: token("--depth-0"), chassis: mix("--brand-navy", "--muted-ink", 0.2), tyre: mix("--brand-navy", "--page-bg", 0.6),
      card: token("--node-glass"), cardInk: token("--text-primary"), cardMuted: token("--text-secondary"),
      antifoul: mix("--depth-0", "--brand-navy", 0.35), boot: token("--brand-white"), funnelTop: mix("--brand-navy", "--page-bg", 0.5), box6: mix("--chart-c1", "--brand-navy", 0.35),
      cabBody: token("--brand-white"), cabStripe: token("--brand-blue"), grille: mix("--brand-navy", "--muted-ink", 0.3), chrome: mix("--muted-fill", "--muted-ink", 0.2),
      glass: night ? mix("--chart-o1", "--brand-navy", 0.65) : mix("--chart-o2", "--sky", 0.4), glassDark: night ? mix("--chart-o3", "--brand-navy", 0.7) : mix("--chart-o3", "--sky", 0.25),
      mullion: night ? mix("--muted-ink", "--brand-navy", 0.5) : mix("--muted-fill", "--muted-ink", 0.35), wallLight: night ? mix("--muted-ink", "--brand-navy", 0.3) : mix("--white", "--muted-fill", 0.5),
      solar: mix("--chart-o4", "--brand-navy", 0.45), roofWhite: night ? mix("--muted-ink", "--brand-navy", 0.2) : mix("--white", "--muted-fill", 0.3),
      sign: token("--brand-purple"), steam: mix("--white", "--muted-fill", 0.2), fence: mix("--muted-ink", "--white", 0.3),
      apronMark: mix("--brand-orange", "--brand-white", 0.2), rtg: mix("--brand-orange", "--brand-white", 0.1), craneWhite: mix("--brand-white", "--muted-fill", 0.2),
    };
}

// ------------------------------------------------------------------ scene
const Network360Scene = forwardRef(function Network360Scene({ data, cards, theme, simDayRef, filters, statusOf, selected, onSelectSupplier, onPickShipment, inbound }, ref) {
  const controls = useRef();
  const night = theme === "dark";
  const C = useMemo(() => scenePalette(night), [theme]); // eslint-disable-line
  const routes = useMemo(() => buildRoutes(data.lanes), [data]);
  const shipGeo = useMemo(() => containerShipHull(C), [C]), cargoGeo = useMemo(() => containerShipCargo(C), [C]);
  const byId = useMemo(() => Object.fromEntries((cards || []).map(c => [c.supplier_id, c])), [cards]);
  const roads = useMemo(() => {
    const seen = new Map();
    data.lanes.forEach(l => { const r = routes[l.id]; if (!r) return; const key = r.mode === "SEA" ? `port>${l.plant_id}` : l.id; if (!seen.has(key)) seen.set(key, { curve: r.road, supplier: r.mode === "SEA" ? null : l.supplier_id }); });
    return [...seen.values()];
  }, [data, routes]);
  return (
    <Canvas shadows flat dpr={[1, 1.75]} camera={{ fov: 40, near: 0.1, far: 400, position: [30, 40, 50] }} onContextMenu={e => e.preventDefault()}>
      <color attach="background" args={[C.fog]} />
      <fog attach="fog" args={[C.fog, 38, 90]} />
      <Suspense fallback={null}>
        <Environment files={night ? "/env/dikhololo_night_1k.hdr" : "/env/venice_sunset_1k.hdr"} background={!night} backgroundBlurriness={0.35}
          backgroundIntensity={0.9} environmentIntensity={night ? 0.55 : 0.9} />
        <Ocean C={C} />
      </Suspense>
      {night && <Stars radius={140} depth={50} count={2200} factor={3.2} fade speed={0.35} />}
      <ambientLight intensity={night ? 0.25 : 0.35} />
      <directionalLight position={night ? [-14, 20, 10] : [16, 18, 12]} intensity={night ? 0.8 : 2.2} color={night ? C.sun : C.lamp} castShadow
        shadow-mapSize={[2048, 2048]} shadow-bias={-0.0004} shadow-camera-left={-26} shadow-camera-right={26} shadow-camera-top={22} shadow-camera-bottom={-22} />
      <Terrain C={C} />
      <Trees C={C} />
      <City C={C} />
      {filters.road && roads.map((r, i) => <Road key={i} curve={r.curve} C={C} dim={!!selected && !!r.supplier && r.supplier !== selected} />)}
      {filters.road && <StreetLights curves={roads.map(r => r.curve)} C={C} />}
      {filters.sea && data.lanes.filter(l => routes[l.id]?.sea).map(l => <SeaRoute key={l.id} curve={routes[l.id].sea} C={C} dim={!!selected && l.supplier_id !== selected} />)}
      {Object.keys(byId).filter(id => SITES[id]).map(id => (
        <SupplierSite key={id} id={id} s={byId[id]} status={statusOf(id)} C={C} selected={selected === id} dim={!filters.status.has(statusOf(id))} onClick={onSelectSupplier} />))}
      <PlantSite id="IN-TN-01" label="Chennai Plant" C={C} inbound={inbound["IN-TN-01"] || 0} />
      <PlantSite id="IN-KA-01" label="Bengaluru Plant" C={C} inbound={inbound["IN-KA-01"] || 0} />
      <PortHub C={C} inbound={inbound.port || 0} shipGeo={shipGeo} cargoGeo={cargoGeo} />
      <Vehicles data={data} routes={routes} simDayRef={simDayRef} C={C} filters={filters} statusOf={statusOf} selectedSupplier={selected} onPick={onPickShipment} shipGeo={shipGeo} cargoGeo={cargoGeo} />
      <OrbitControls ref={controls} makeDefault enableDamping dampingFactor={0.08} maxPolarAngle={1.38} minDistance={4} maxDistance={60}
        mouseButtons={{ LEFT: MOUSE.ROTATE, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.PAN }} />
      <Rig controls={controls} apiRef={ref} />
      <EffectComposer multisampling={0}>
        <Bloom intensity={night ? 1.35 : 0.35} luminanceThreshold={night ? 0.6 : 0.92} luminanceSmoothing={0.25} mipmapBlur />
        <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
        <SMAA />
        <Vignette eskil={false} offset={0.28} darkness={night ? 0.65 : 0.3} />
      </EffectComposer>
    </Canvas>
  );
});
export default Network360Scene;
