import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, extend, useFrame, useLoader } from "@react-three/fiber";
import { ContactShadows, Environment, OrbitControls, RoundedBox, Sky } from "@react-three/drei";
import { Bloom, EffectComposer, SMAA, ToneMapping, Vignette } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import { BufferAttribute, BufferGeometry, CanvasTexture, Color, DoubleSide, Matrix4, PlaneGeometry, RepeatWrapping, SRGBColorSpace, TextureLoader, Vector3 } from "three";
import { Water } from "three/examples/jsm/objects/Water.js";

extend({ Water });

/* Realistic digital-twin scenes for the network map. Rendered in the browser from code + bundled assets
   (HDR sky lighting /env/venice_sunset_1k.hdr, ocean normals /env/waternormals.jpg); nothing is downloaded at run time.
   PBR materials, filmic tone mapping, soft shadows, reflective water. Our PO lines are drawn as cargo coloured by material. */
export const MAT_COLORS = ["#6f3dba", "#0e9c86", "#e4572e", "#2f6fdb", "#e0a21a", "#c2185b", "#2e7d32", "#5c6bc0", "#00897b", "#8d6e63", "#ef6c00", "#455a64"];
export const matColor = (id, list) => MAT_COLORS[Math.max(0, list.indexOf(id)) % MAT_COLORS.length];
const STATUS_COLOR = { late: "#c0392b", risk: "#d9822b", ok: "#1f8f74" };

// ------------------------------------------------------------------ procedural textures (canvas, cached)
const _tex = {};
function canvasTex(key, w, h, draw, repeat = [1, 1]) {
  if (!_tex[key]) {
    const c = document.createElement("canvas"); c.width = w; c.height = h; draw(c.getContext("2d"), w, h);
    const t = new CanvasTexture(c); t.colorSpace = SRGBColorSpace; t.wrapS = t.wrapT = RepeatWrapping; t.anisotropy = 8; _tex[key] = t;
  }
  const t = _tex[key].clone(); t.repeat.set(...repeat); t.needsUpdate = true; return t;
}
const noise = (g, w, h, base, spread, n = 6000, size = 2) => {
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  for (let i = 0; i < n; i++) { const v = Math.floor(Math.random() * spread * 2 - spread); g.fillStyle = `rgba(${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${Math.abs(v) / 255})`; g.fillRect(Math.random() * w, Math.random() * h, size, size); }
};
const T = {
  container: () => canvasTex("container", 256, 128, (g, w, h) => {             // corrugated steel, tinted per box
    g.fillStyle = "#e6e6e6"; g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 8) { const gr = g.createLinearGradient(x, 0, x + 8, 0); gr.addColorStop(0, "#c9c9c9"); gr.addColorStop(0.5, "#ffffff"); gr.addColorStop(1, "#bdbdbd"); g.fillStyle = gr; g.fillRect(x, 6, 8, h - 12); }
    g.fillStyle = "#9a9a9a"; g.fillRect(0, 0, w, 6); g.fillRect(0, h - 6, w, 6); g.fillRect(0, 0, 5, h); g.fillRect(w - 5, 0, 5, h);
    for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(90,60,40,${Math.random() * 0.08})`; g.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 6, 1 + Math.random() * 3); }
  }),
  windows: (rows, cols) => canvasTex(`win${rows}x${cols}`, 512, 256, (g, w, h) => {
    g.fillStyle = "#f4f5f7"; g.fillRect(0, 0, w, h);
    const rh = h / rows, cw = w / cols;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { const gr = g.createLinearGradient(0, r * rh, 0, r * rh + rh); gr.addColorStop(0, "#22364f"); gr.addColorStop(1, "#5d7d9e"); g.fillStyle = gr; g.fillRect(c * cw + cw * 0.18, r * rh + rh * 0.25, cw * 0.64, rh * 0.45); }
  }),
  road: () => canvasTex("road", 1024, 128, (g, w, h) => {
    noise(g, w, h, "#3a3d42", 22, 9000, 2);
    g.fillStyle = "#e9e9e9"; g.fillRect(0, 8, w, 4); g.fillRect(0, h - 12, w, 4);
    g.fillStyle = "#f2f2f2"; for (let x = 0; x < w; x += 128) g.fillRect(x, h / 2 - 2, 64, 4);
  }),
  grass: () => canvasTex("grass", 256, 256, (g, w, h) => {
    noise(g, w, h, "#5f8a3e", 30, 14000, 2);
    for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? "120,95,50" : "70,110,40"},0.12)`; g.beginPath(); g.ellipse(Math.random() * w, Math.random() * h, 10 + Math.random() * 30, 6 + Math.random() * 20, Math.random(), 0, 7); g.fill(); }
  }),
  concrete: () => canvasTex("concrete", 256, 256, (g, w, h) => { noise(g, w, h, "#b9b8b2", 16, 9000, 2); g.strokeStyle = "rgba(0,0,0,0.12)"; g.lineWidth = 2; for (let x = 0; x <= w; x += 64) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); g.beginPath(); g.moveTo(0, x); g.lineTo(w, x); g.stroke(); } }),
  asphalt: () => canvasTex("asphalt", 256, 256, (g, w, h) => noise(g, w, h, "#45484d", 20, 9000, 2)),
  parking: () => canvasTex("parking", 256, 256, (g, w, h) => { noise(g, w, h, "#4a4d52", 18, 7000, 2); g.fillStyle = "#e8e8e8"; for (let x = 0; x < w; x += 32) g.fillRect(x, 0, 3, h * 0.42); for (let x = 0; x < w; x += 32) g.fillRect(x, h * 0.58, 3, h * 0.42); }),
  cladding: () => canvasTex("cladding", 256, 256, (g, w, h) => {
    for (let x = 0; x < w; x += 6) { const gr = g.createLinearGradient(x, 0, x + 6, 0); gr.addColorStop(0, "#c5c9cf"); gr.addColorStop(0.5, "#eef0f3"); gr.addColorStop(1, "#b9bec5"); g.fillStyle = gr; g.fillRect(x, 0, 6, h); }
  }),
  curtain: () => canvasTex("curtain", 256, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, "#5f86ad"); gr.addColorStop(1, "#24405f"); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = "#cfd6de"; for (let x = 0; x < w; x += 32) g.fillRect(x, 0, 3, h); for (let y = 0; y < h; y += 42) g.fillRect(0, y, w, 4);
  }),
  roller: () => canvasTex("roller", 128, 128, (g, w, h) => { for (let y = 0; y < h; y += 4) { g.fillStyle = y % 8 ? "#8c949e" : "#a8b0ba"; g.fillRect(0, y, w, 4); } }),
  carton: () => canvasTex("carton", 256, 256, (g, w, h) => {
    noise(g, w, h, "#b48a57", 16, 4000, 2);
    g.strokeStyle = "rgba(60,40,20,0.45)"; g.lineWidth = 3; for (let y = 0; y <= h; y += 85) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); } for (let x = 0; x <= w; x += 128) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
    g.fillStyle = "rgba(255,255,255,0.18)"; g.fillRect(0, 0, w, h);
  }),
  wood: () => canvasTex("wood", 128, 64, (g, w, h) => { noise(g, w, h, "#a07a4b", 18, 1500, 2); g.fillStyle = "rgba(60,40,20,0.35)"; for (let y = 0; y < h; y += 16) g.fillRect(0, y, w, 2); }),
  grille: () => canvasTex("grille", 128, 128, (g, w, h) => { g.fillStyle = "#1d1f23"; g.fillRect(0, 0, w, h); for (let y = 6; y < h; y += 14) { const gr = g.createLinearGradient(0, y, 0, y + 7); gr.addColorStop(0, "#f5f5f5"); gr.addColorStop(1, "#8c8c8c"); g.fillStyle = gr; g.fillRect(4, y, w - 8, 7); } }),
  tyre: () => canvasTex("tyre", 256, 32, (g, w, h) => { g.fillStyle = "#16171a"; g.fillRect(0, 0, w, h); g.fillStyle = "#2a2c30"; for (let x = 0; x < w; x += 10) g.fillRect(x, 4, 5, h - 8); }),
  rim: () => canvasTex("rim", 128, 128, (g, w) => {
    const c = w / 2; const gr = g.createRadialGradient(c, c, 4, c, c, c); gr.addColorStop(0, "#f2f2f2"); gr.addColorStop(0.7, "#b8bcc2"); gr.addColorStop(1, "#7e848c"); g.fillStyle = gr; g.beginPath(); g.arc(c, c, c, 0, 7); g.fill();
    g.fillStyle = "#3a3d42"; for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; g.beginPath(); g.arc(c + Math.cos(a) * c * 0.62, c + Math.sin(a) * c * 0.62, c * 0.1, 0, 7); g.fill(); }
    g.fillStyle = "#555"; g.beginPath(); g.arc(c, c, c * 0.2, 0, 7); g.fill();
  }),
  smoke: () => canvasTex("smoke", 128, 128, (g, w, h) => { const gr = g.createRadialGradient(64, 64, 4, 64, 64, 62); gr.addColorStop(0, "rgba(235,238,242,0.85)"); gr.addColorStop(1, "rgba(235,238,242,0)"); g.fillStyle = gr; g.fillRect(0, 0, w, h); }),
  foam: () => canvasTex("foam", 128, 128, (g, w, h) => { const gr = g.createRadialGradient(64, 64, 2, 64, 64, 62); gr.addColorStop(0, "rgba(255,255,255,0.9)"); gr.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = gr; g.fillRect(0, 0, w, h); }),
};

// ------------------------------------------------------------------ shared pieces
function Lighting({ sun = [60, 45, 30], shadow = 40 }) {
  return <>
    <Environment files="/env/venice_sunset_1k.hdr" environmentIntensity={0.85} />
    <directionalLight position={sun} intensity={2.1} color="#fff4e2" castShadow shadow-mapSize={[2048, 2048]} shadow-bias={-0.0004}
      shadow-camera-left={-shadow} shadow-camera-right={shadow} shadow-camera-top={shadow} shadow-camera-bottom={-shadow} shadow-camera-far={300} />
    <hemisphereLight args={["#dfe9f5", "#5b6a4a", 0.35]} />
  </>;
}
function Post({ bloom = 0.2 }) {
  return <EffectComposer multisampling={0}>
    <SMAA /><Bloom intensity={bloom} luminanceThreshold={0.9} luminanceSmoothing={0.2} mipmapBlur />
    <ToneMapping mode={ToneMappingMode.ACES_FILMIC} /><Vignette eskil={false} offset={0.25} darkness={0.45} />
  </EffectComposer>;
}
function Smoke({ position, scale = 1, rate = 1 }) {
  const ref = useRef(); const map = useMemo(() => T.smoke(), []);
  useFrame(({ clock }) => ref.current?.children.forEach((s, i) => {
    const k = (clock.elapsedTime * 0.12 * rate + i / 10) % 1;
    s.position.set(k * 4 * scale + Math.sin(i * 2.7) * 0.4, k * 9 * scale, Math.cos(i * 1.9) * 0.4);
    s.scale.setScalar((1.2 + k * 5) * scale); s.material.opacity = 0.55 * (1 - k) * Math.min(1, k * 6);
  }));
  return <group ref={ref} position={position}>{Array.from({ length: 10 }, (_, i) =>
    <sprite key={i}><spriteMaterial map={map} transparent depthWrite={false} opacity={0} /></sprite>)}</group>;
}
function Tree({ position, s = 1, seed = 1 }) {
  const greens = ["#3e6b2f", "#4a7a35", "#567f3c", "#355e2a"];
  const blobs = useMemo(() => Array.from({ length: 6 }, (_, i) => {
    const a = seed * 1.7 + i * 1.05; return { p: [Math.cos(a) * 0.9, 3.2 + (i % 3) * 0.7, Math.sin(a) * 0.9], r: 1.1 + ((seed * 7 + i * 3) % 5) / 9, c: greens[(seed + i) % 4] };
  }), [seed]);
  return <group position={position} scale={s}>
    <mesh position={[0, 1.3, 0]} castShadow><cylinderGeometry args={[0.16, 0.26, 2.6, 8]} /><meshStandardMaterial color="#5a4330" roughness={0.95} /></mesh>
    {blobs.map((b, i) => <mesh key={i} position={b.p} castShadow><icosahedronGeometry args={[b.r, 1]} /><meshStandardMaterial color={b.c} roughness={0.9} flatShading /></mesh>)}
  </group>;
}
function Wheel({ position, r = 0.55, w = 0.36, spin }) {
  const tyre = useMemo(() => T.tyre(), []), rim = useMemo(() => T.rim(), []);
  return <group position={position} ref={spin}>
    <mesh rotation={[Math.PI / 2, 0, 0]} castShadow><cylinderGeometry args={[r, r, w, 28]} /><meshStandardMaterial map={tyre} color="#2a2b2e" roughness={0.92} /></mesh>
    <mesh position={[0, 0, w / 2 + 0.005]}><circleGeometry args={[r * 0.62, 28]} /><meshStandardMaterial map={rim} metalness={0.85} roughness={0.28} /></mesh>
    <mesh position={[0, 0, -w / 2 - 0.005]} rotation={[0, Math.PI, 0]}><circleGeometry args={[r * 0.62, 28]} /><meshStandardMaterial map={rim} metalness={0.85} roughness={0.28} /></mesh>
  </group>;
}
/** pallet with stretch-wrapped cartons and a coloured material label band */
function Pallet({ position, color, hovered, onOver, onOut, layers = 3 }) {
  const carton = useMemo(() => T.carton(), []), wood = useMemo(() => T.wood(), []);
  const h = 0.32 * layers;
  return <group position={position}>
    <mesh position={[0, 0.07, 0]} castShadow><boxGeometry args={[1.2, 0.14, 1.0]} /><meshStandardMaterial map={wood} roughness={0.9} /></mesh>
    <mesh position={[0, 0.14 + h / 2, 0]} castShadow onPointerOver={onOver} onPointerOut={onOut}>
      <boxGeometry args={[1.12, h, 0.94]} /><meshStandardMaterial map={carton} roughness={0.55} emissive={color} emissiveIntensity={hovered ? 0.35 : 0} />
    </mesh>
    <mesh position={[0, 0.14 + h * 0.62, 0]}><boxGeometry args={[1.14, 0.16, 0.96]} /><meshStandardMaterial color={color} roughness={0.4} emissive={color} emissiveIntensity={hovered ? 0.6 : 0.08} /></mesh>
  </group>;
}

// ------------------------------------------------------------------ SHIP
const L = 46, B = 3.7, KEEL = -3.0, DECK = 1.9;
function halfBreadth(t) {                               // t: 0 = stern, 1 = bow
  if (t < 0.07) return B * (0.78 + 0.22 * Math.sin((t / 0.07) * Math.PI / 2));
  if (t > 0.7) { const u = (t - 0.7) / 0.3; return Math.max(0.04, B * (1 - Math.pow(u, 1.9))); }
  return B;
}
function hullGeometry() {
  const N = 72, M = 12, pos = [], col = [], idx = [];
  const anti = new Color("#8e2420"), boot = new Color("#f2f2f2"), side = new Color("#1d3550");
  const ring = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N, x = -L / 2 + t * L, hb = halfBreadth(t), u = t > 0.7 ? (t - 0.7) / 0.3 : 0;
    const keelY = KEEL + u * u * 2.2 + (t < 0.05 ? (0.05 - t) * 18 : 0);           // rising forefoot + cut-up stern
    const pts = [];
    for (let j = 0; j <= M; j++) {
      const s = j / M, y = DECK - s * (DECK - keelY);
      const shape = Math.pow(1 - Math.pow(s, 4 + 6 * (1 - u)), 0.5 + 0.9 * u);    // full bilge midship, V-shaped at the bow
      pts.push([x, y, hb * shape]);
    }
    ring.push([...pts, ...pts.slice(0, -1).reverse().map(p => [p[0], p[1], -p[2]])]);
  }
  const R = ring[0].length;
  ring.forEach(r => r.forEach(([x, y, z]) => {
    pos.push(x, y, z);
    const c = y < -0.25 ? anti : y < 0.12 ? boot : side; col.push(c.r, c.g, c.b);
  }));
  for (let i = 0; i < N; i++) for (let j = 0; j < R - 1; j++) { const a = i * R + j, b = a + 1, c = a + R, d = c + 1; idx.push(a, c, b, b, c, d); }
  const base = pos.length / 3, st = ring[0], cy = st.reduce((s, p) => s + p[1], 0) / st.length;
  pos.push(-L / 2, cy, 0); col.push(side.r, side.g, side.b);
  for (let j = 0; j < R - 1; j++) idx.push(base, j + 1, j);
  const g = new BufferGeometry(); g.setAttribute("position", new BufferAttribute(new Float32Array(pos), 3)); g.setAttribute("color", new BufferAttribute(new Float32Array(col), 3));
  g.setIndex(idx); g.computeVertexNormals(); return g;
}
function deckGeometry() {
  const N = 72, pos = [], idx = [];
  for (let i = 0; i <= N; i++) { const t = i / N, x = -L / 2 + t * L, z = halfBreadth(t); pos.push(x, DECK, z, x, DECK, -z); }
  for (let i = 0; i < N; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const g = new BufferGeometry(); g.setAttribute("position", new BufferAttribute(new Float32Array(pos), 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
}
function Ocean() {
  const ref = useRef();
  const normals = useLoader(TextureLoader, "/env/waternormals.jpg");
  normals.wrapS = normals.wrapT = RepeatWrapping;
  const args = useMemo(() => [new PlaneGeometry(2400, 2400), {
    textureWidth: 512, textureHeight: 512, waterNormals: normals, sunDirection: new Vector3(0.6, 0.45, 0.3).normalize(),
    sunColor: new Color("#fff6e5"), waterColor: new Color("#0c3b57"), distortionScale: 3.2, fog: true, alpha: 1,
  }], [normals]);
  useEffect(() => { if (ref.current?.material?.uniforms) ref.current.material.uniforms.size.value = 1.6; }, [args]);
  useFrame((_, dt) => { if (ref.current?.material?.uniforms) ref.current.material.uniforms.time.value += dt * 0.45; });
  return <water ref={ref} args={args} rotation-x={-Math.PI / 2} />;
}
function Wake() {
  const ref = useRef(); const map = useMemo(() => T.foam(), []);
  useFrame(({ clock }) => ref.current?.children.forEach((s, i) => {
    const k = (clock.elapsedTime * 0.18 + i / 26) % 1, side = i % 2 ? 1 : -1, bow = i % 5 === 0;
    if (bow) { s.position.set(L / 2 - 2 - k * 6, 0.08, side * (1.2 + k * 3)); s.scale.setScalar(1.5 + k * 3); }
    else { s.position.set(-L / 2 - k * 46, 0.08, side * (1.5 + k * 9)); s.scale.setScalar(2 + k * 8); }
    s.material.opacity = 0.75 * (1 - k);
  }));
  return <group ref={ref}>{Array.from({ length: 26 }, (_, i) => <sprite key={i}><spriteMaterial map={map} transparent depthWrite={false} /></sprite>)}</group>;
}
const FILLER = ["#8b3a2b", "#2d5b8a", "#6b7078", "#3d6b4f", "#b8bcc2", "#a4572f", "#244a6b", "#7a7f86"];
function Containers({ cargo, onHover, hovered }) {
  const tex = useMemo(() => T.container(), []);
  // 6 bays x 5 rows; our PO lines fill the camera-facing rows of the middle bays first, other shippers' boxes fill the rest
  const slots = useMemo(() => {
    const out = [], ours = cargo.filter(c => !c.filler), H = (b, r) => 2 + ((b * 7 + r * 3) % 3);
    const order = []; for (const r of [4, 3, 2, 1, 0]) for (const b of [2, 3, 1, 4, 0, 5]) order.push([b, r]);
    const used = new Map(); ours.slice(0, order.length).forEach((it, i) => used.set(order[i].join(), it));
    for (let b = 0; b < 6; b++) for (let r = 0; r < 5; r++) {
      const it = used.get(`${b},${r}`), h = it ? Math.min(4, Math.max(it.h, 1)) : H(b, r);
      for (let t = 0; t < h; t++) out.push({ b, r, t, it, color: it ? it.color : FILLER[(b * 5 + r * 3 + t) % FILLER.length] });
    }
    return out;
  }, [cargo]);
  return <group>{slots.map((s, i) => (
    <mesh key={i} position={[-12.4 + s.b * 4.45, DECK + 0.32 + 0.67 + s.t * 1.33, (s.r - 2) * 1.32]} castShadow receiveShadow
      onPointerOver={s.it ? e => { e.stopPropagation(); onHover(s.it); document.body.style.cursor = "pointer"; } : undefined}
      onPointerOut={s.it ? () => { onHover(null); document.body.style.cursor = "auto"; } : undefined}>
      <boxGeometry args={[4.15, 1.3, 1.26]} />
      <meshStandardMaterial map={tex} color={s.color} roughness={0.62} metalness={0.35} emissive={s.it ? s.color : "#000"} emissiveIntensity={s.it && hovered === s.it.key ? 0.55 : 0} />
    </mesh>))}
    {Array.from({ length: 7 }, (_, b) => <mesh key={b} position={[-14.65 + b * 4.45, DECK + 1.6, 0]} castShadow>{/* lashing bridges */}
      <boxGeometry args={[0.16, 3.2, 6.9]} /><meshStandardMaterial color="#c9a227" metalness={0.5} roughness={0.5} /></mesh>)}
  </group>;
}
function Superstructure({ status }) {
  const win = useMemo(() => T.windows(5, 8), []), sideWin = useMemo(() => T.windows(5, 6), []);
  return <group position={[-19.2, DECK, 0]}>
    <mesh position={[0, 3.4, 0]} castShadow receiveShadow>
      <boxGeometry args={[4.6, 6.8, 6.6]} />
      {[sideWin, sideWin, null, null, win, win].map((m, i) => <meshStandardMaterial key={i} attach={`material-${i}`} map={m || undefined} color={m ? "#ffffff" : "#eef0f3"} roughness={0.45} metalness={0.1} />)}
    </mesh>
    <mesh position={[0.4, 7.25, 0]} castShadow><boxGeometry args={[3.8, 0.9, 9.2]} /><meshStandardMaterial color="#f4f5f7" roughness={0.4} /></mesh>
    <mesh position={[2.32, 7.3, 0]}><boxGeometry args={[0.06, 0.55, 9.0]} /><meshPhysicalMaterial color="#1c2f45" metalness={0.6} roughness={0.08} envMapIntensity={1.6} /></mesh>
    <mesh position={[0, 8.5, 0]} castShadow><cylinderGeometry args={[0.09, 0.12, 2.6, 8]} /><meshStandardMaterial color="#e9ecf0" metalness={0.4} /></mesh>
    <mesh position={[0, 9.4, 0]}><boxGeometry args={[0.2, 0.12, 2.2]} /><meshStandardMaterial color="#d9dde2" /></mesh>
    <group position={[-2.4, 7.0, 0]}>
      <mesh castShadow><cylinderGeometry args={[1.0, 1.25, 3.6, 24]} /><meshStandardMaterial color="#2a2d33" roughness={0.6} /></mesh>
      <mesh position={[0, 0.4, 0]}><cylinderGeometry args={[1.07, 1.12, 0.9, 24]} /><meshStandardMaterial color="#6f3dba" roughness={0.45} /></mesh>
      <mesh position={[0, 1.85, 0]}><cylinderGeometry args={[1.0, 1.0, 0.15, 24]} /><meshStandardMaterial color="#111" /></mesh>
      <Smoke position={[0, 2.1, 0]} scale={0.9} />
    </group>
    {[3.6, -3.6].map(z => <group key={z} position={[-0.8, 4.4, z]}>
      <mesh rotation={[0, 0, Math.PI / 2]} castShadow><capsuleGeometry args={[0.55, 2.6, 6, 14]} /><meshStandardMaterial color="#ff7a1a" roughness={0.45} /></mesh>
      <mesh position={[0, 0.65, 0]}><boxGeometry args={[2.6, 0.12, 0.12]} /><meshStandardMaterial color="#d0d4da" metalness={0.6} /></mesh>
    </group>)}
    <mesh position={[0.4, 7.8, 0]}><sphereGeometry args={[0.18, 12, 12]} /><meshStandardMaterial color={STATUS_COLOR[status]} emissive={STATUS_COLOR[status]} emissiveIntensity={2.2} /></mesh>
  </group>;
}
function Ship({ cargo, status, onHover, hovered }) {
  const g = useRef();
  const hull = useMemo(() => hullGeometry(), []), deck = useMemo(() => deckGeometry(), []);
  useFrame(({ clock }) => { const t = clock.elapsedTime; if (!g.current) return;
    g.current.position.y = Math.sin(t * 0.7) * 0.12; g.current.rotation.x = Math.sin(t * 0.5) * 0.012; g.current.rotation.z = Math.sin(t * 0.43) * 0.008; });
  return <group ref={g}>
    <mesh geometry={hull} castShadow receiveShadow><meshStandardMaterial vertexColors roughness={0.55} metalness={0.25} side={DoubleSide} /></mesh>
    <mesh geometry={deck} receiveShadow><meshStandardMaterial color="#6e7178" roughness={0.8} side={DoubleSide} /></mesh>
    <mesh position={[18.5, DECK + 0.45, 0]} castShadow><boxGeometry args={[5.5, 0.9, 4.6]} /><meshStandardMaterial color="#1d3550" roughness={0.55} metalness={0.25} /></mesh>
    {[[19.5, 1], [19.5, -1], [17.5, 1.2], [17.5, -1.2]].map(([x, z], i) => <mesh key={i} position={[x, DECK + 1.15, z]} castShadow><cylinderGeometry args={[0.28, 0.28, 0.5, 14]} /><meshStandardMaterial color="#9aa0a8" metalness={0.6} roughness={0.4} /></mesh>)}
    <Containers cargo={cargo} onHover={onHover} hovered={hovered} />
    <Superstructure status={status} />
  </group>;
}
export function ShipScene({ cargo, status, onHoverItem }) {
  const [hovered, setHovered] = useState(null);
  const hover = it => { setHovered(it?.key || null); onHoverItem?.(it); };
  return <Canvas shadows dpr={[1, 1.5]} camera={{ position: [44, 20, 52], fov: 36, far: 3000 }} gl={{ antialias: false }}>
    <fog attach="fog" args={["#c7d6e4", 140, 900]} />
    <Sky sunPosition={[60, 45, 30]} turbidity={5} rayleigh={1.1} mieCoefficient={0.004} mieDirectionalG={0.85} />
    <Suspense fallback={null}><Lighting sun={[60, 45, 30]} shadow={34} /><Ocean /></Suspense>
    <Wake />
    <Ship cargo={cargo} status={status} onHover={hover} hovered={hovered} />
    <Post bloom={0.18} />
    <OrbitControls autoRotate autoRotateSpeed={0.35} enablePan={false} minDistance={30} maxDistance={120} maxPolarAngle={Math.PI * 0.47} target={[0, 3, 0]} />
  </Canvas>;
}

// ------------------------------------------------------------------ TRUCK
function Highway({ speed = 16 }) {
  const road = useMemo(() => { const t = T.road(); t.repeat.set(30, 1); return t; }, []);
  const grass = useMemo(() => { const t = T.grass(); t.repeat.set(60, 60); return t; }, []);
  const posts = useRef(), trees = useRef();
  const treeList = useMemo(() => Array.from({ length: 44 }, (_, i) => ({ x: -110 + i * 5.1, z: (i % 2 ? 1 : -1) * (34 + ((i * 13) % 22)), s: 1.1 + ((i * 7) % 6) / 8 })), []);
  useFrame((_, dt) => {
    road.offset.x += (dt * speed) / 600 * 30; grass.offset.x += (dt * speed) / 800 * 60;
    posts.current?.children.forEach(c => { c.position.x -= dt * speed; if (c.position.x < -110) c.position.x += 220; });
    trees.current?.children.forEach(c => { c.position.x -= dt * speed; if (c.position.x < -115) c.position.x += 224; });
  });
  return <>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow><planeGeometry args={[800, 800]} /><meshStandardMaterial map={grass} roughness={0.95} /></mesh>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]} receiveShadow><planeGeometry args={[600, 9]} /><meshStandardMaterial map={road} roughness={0.85} /></mesh>
    {[5.6, -5.6].map(z => <mesh key={z} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, z]} receiveShadow><planeGeometry args={[600, 2.2]} /><meshStandardMaterial color="#9b9488" roughness={1} /></mesh>)}
    {[6.6, -6.6].map(z => <mesh key={z} position={[0, 0.75, z]} castShadow><boxGeometry args={[600, 0.32, 0.08]} /><meshStandardMaterial color="#c9cdd2" metalness={0.75} roughness={0.35} /></mesh>)}
    <group ref={posts}>{Array.from({ length: 55 }, (_, i) => [6.6, -6.6].map(z => <mesh key={`${i}${z}`} position={[-110 + i * 4, 0.4, z]} castShadow><boxGeometry args={[0.1, 0.8, 0.1]} /><meshStandardMaterial color="#8f949b" metalness={0.6} /></mesh>))}</group>
    <group ref={trees}>{treeList.map((t, i) => <Tree key={i} position={[t.x, 0, t.z]} s={t.s} seed={i + 2} />)}</group>
  </>;
}
function TruckRig({ cargo, status, onHover, hovered }) {
  const wheelRefs = useRef([]), body = useRef();
  const grille = useMemo(() => T.grille(), []);
  useFrame(({ clock }, dt) => { wheelRefs.current.forEach(w => w && (w.rotation.z -= dt * 16 / 0.55)); if (body.current) body.current.position.y = Math.sin(clock.elapsedTime * 7) * 0.015; });
  const spin = i => el => (wheelRefs.current[i] = el);
  const paint = "#f4f5f7";
  const pallets = useMemo(() => { const list = []; cargo.forEach(it => { for (let k = 0; k < Math.max(1, it.h); k++) list.push(it); }); return list.slice(0, 20); }, [cargo]);
  const wheelsAt = [[7.2, 1.05], [7.2, -1.05], [4.7, 1.05], [4.7, -1.05], [3.55, 1.05], [3.55, -1.05], [-6.0, 1.05], [-6.0, -1.05], [-7.25, 1.05], [-7.25, -1.05], [-8.5, 1.05], [-8.5, -1.05]];
  const over = it => e => { e.stopPropagation(); onHover(it); document.body.style.cursor = "pointer"; };
  const out = () => { onHover(null); document.body.style.cursor = "auto"; };
  return <group position={[0, 0, 1.8]}>
    {wheelsAt.map(([x, z], i) => <Wheel key={i} position={[x, 0.55, z]} spin={spin(i)} />)}
    <group ref={body}>
      <mesh position={[5.6, 0.95, 0]} castShadow><boxGeometry args={[4.6, 0.35, 1.5]} /><meshStandardMaterial color="#1b1c20" roughness={0.7} /></mesh>
      <RoundedBox args={[2.4, 3.0, 2.5]} radius={0.22} smoothness={5} position={[7.15, 2.65, 0]} castShadow><meshPhysicalMaterial color={paint} metalness={0.45} roughness={0.22} clearcoat={1} clearcoatRoughness={0.08} /></RoundedBox>
      <mesh position={[7.15, 1.6, 0]} castShadow><boxGeometry args={[2.42, 0.42, 2.52]} /><meshPhysicalMaterial color={STATUS_COLOR[status]} metalness={0.4} roughness={0.25} clearcoat={1} /></mesh>
      <mesh position={[8.37, 3.25, 0]} rotation={[0, 0, 0.05]}><boxGeometry args={[0.04, 1.15, 2.2]} /><meshPhysicalMaterial color="#0f1a26" metalness={0.2} roughness={0.03} envMapIntensity={2} /></mesh>
      {[1.26, -1.26].map(z => <mesh key={z} position={[7.45, 3.15, z]}><boxGeometry args={[1.25, 0.9, 0.03]} /><meshPhysicalMaterial color="#0f1a26" roughness={0.04} envMapIntensity={2} /></mesh>)}
      <mesh position={[8.37, 2.05, 0]} rotation={[0, Math.PI / 2, 0]}><planeGeometry args={[1.6, 0.7]} /><meshStandardMaterial map={grille} metalness={0.8} roughness={0.3} side={DoubleSide} /></mesh>
      <RoundedBox args={[0.35, 0.45, 2.5]} radius={0.08} position={[8.42, 1.2, 0]} castShadow><meshStandardMaterial color="#2b2d31" roughness={0.6} /></RoundedBox>
      {[0.95, -0.95].map(z => <mesh key={z} position={[8.45, 1.5, z]}><boxGeometry args={[0.06, 0.18, 0.42]} /><meshStandardMaterial color="#fffaf0" emissive="#fff3d6" emissiveIntensity={2.4} /></mesh>)}
      {[1.42, -1.42].map(z => <group key={z} position={[8.1, 3.25, z]}><mesh><boxGeometry args={[0.06, 0.06, 0.35]} /><meshStandardMaterial color="#222" /></mesh>
        <mesh position={[0, -0.1, z > 0 ? 0.22 : -0.22]}><boxGeometry args={[0.1, 0.55, 0.16]} /><meshStandardMaterial color="#1e1f23" metalness={0.5} /></mesh></group>)}
      <mesh position={[6.6, 4.45, 0]} rotation={[0, 0, -0.32]} castShadow><boxGeometry args={[1.9, 0.18, 2.3]} /><meshPhysicalMaterial color={paint} metalness={0.45} roughness={0.25} clearcoat={1} /></mesh>
      <mesh position={[5.4, 1.15, 1.05]} rotation={[Math.PI / 2, 0, 0]} castShadow><cylinderGeometry args={[0.32, 0.32, 0.5, 20]} /><meshStandardMaterial color="#d8dce1" metalness={0.95} roughness={0.15} /></mesh>
      <mesh position={[4.2, 1.25, 0]} castShadow><cylinderGeometry args={[0.6, 0.6, 0.12, 24]} /><meshStandardMaterial color="#26282c" metalness={0.5} /></mesh>
      {/* curtain-side trailer: far curtain + roof closed, near curtain open to show the pallets */}
      <group position={[-2.4, 0, 0]}>
        <mesh position={[0, 1.35, 0]} castShadow receiveShadow><boxGeometry args={[13.6, 0.22, 2.5]} /><meshStandardMaterial color="#3a3d42" metalness={0.5} roughness={0.5} /></mesh>
        <mesh position={[0, 1.05, 0]}><boxGeometry args={[13.4, 0.35, 0.5]} /><meshStandardMaterial color="#1b1c20" /></mesh>
        <mesh position={[6.7, 2.95, 0]} castShadow><boxGeometry args={[0.12, 3.0, 2.5]} /><meshStandardMaterial color="#d4d7dc" metalness={0.4} /></mesh>
        <mesh position={[0, 4.48, 0]} castShadow><boxGeometry args={[13.6, 0.08, 2.5]} /><meshStandardMaterial color="#e8eaed" roughness={0.6} /></mesh>
        <mesh position={[0, 2.95, -1.22]}><boxGeometry args={[13.6, 3.0, 0.04]} /><meshStandardMaterial color="#e9ebee" roughness={0.75} /></mesh>
        <mesh position={[0, 3.9, -1.18]}><boxGeometry args={[13.6, 0.35, 0.02]} /><meshStandardMaterial color="#6f3dba" roughness={0.6} /></mesh>
        {[-6.7, -3.4, 0, 3.4].map(x => <mesh key={x} position={[x, 2.95, 1.22]}><boxGeometry args={[0.1, 3.0, 0.08]} /><meshStandardMaterial color="#c7cbd1" metalness={0.6} /></mesh>)}
        <mesh position={[-6.45, 2.95, 1.2]} castShadow><cylinderGeometry args={[0.28, 0.28, 3.0, 16]} /><meshStandardMaterial color="#d9dce0" roughness={0.8} /></mesh>
        {[1.25, -1.25].map(z => <mesh key={z} position={[0, 0.95, z]}><boxGeometry args={[7, 0.35, 0.05]} /><meshStandardMaterial color="#b8bdc4" metalness={0.5} /></mesh>)}
        {[0.95, -0.95].map(z => <mesh key={z} position={[-6.82, 1.15, z]}><boxGeometry args={[0.05, 0.22, 0.4]} /><meshStandardMaterial color="#c0392b" emissive="#ff2a1a" emissiveIntensity={1.6} /></mesh>)}
        {pallets.map((it, i) => <Pallet key={i} position={[-5.9 + Math.floor(i / 2) * 1.32, 1.46, i % 2 ? -0.6 : 0.6]} color={it.color} hovered={hovered === it.key} onOver={over(it)} onOut={out} />)}
      </group>
    </group>
  </group>;
}
export function TruckScene({ cargo, status, onHoverItem }) {
  const [hovered, setHovered] = useState(null);
  const hover = it => { setHovered(it?.key || null); onHoverItem?.(it); };
  return <Canvas shadows dpr={[1, 1.5]} camera={{ position: [17, 7.5, 19], fov: 38, far: 2000 }} gl={{ antialias: false }}>
    <fog attach="fog" args={["#cdd9e3", 70, 420]} />
    <Sky sunPosition={[60, 40, 30]} turbidity={4.5} rayleigh={1} />
    <Suspense fallback={null}><Lighting sun={[40, 50, 30]} shadow={22} /></Suspense>
    <Highway />
    <TruckRig cargo={cargo} status={status} onHover={hover} hovered={hovered} />
    <ContactShadows position={[0, 0.03, 1.8]} opacity={0.55} scale={34} blur={2.4} far={5} />
    <Post bloom={0.15} />
    <OrbitControls autoRotate autoRotateSpeed={0.45} enablePan={false} minDistance={12} maxDistance={30} maxPolarAngle={Math.PI * 0.47} target={[0, 2.4, 1.8]} />
  </Canvas>;
}

// ------------------------------------------------------------------ SUPPLIER CAMPUS
// Units ~ metres. Vehicles follow road centre-lines sampled by distance; heading = road tangent, so they always face forward.

/** closed rounded-rectangle road centre-line in the X-Z plane */
function roundedRect(hx, hz, r, seg = 12) {
  const c = [[hx - r, hz - r, 0], [-(hx - r), hz - r, 90], [-(hx - r), -(hz - r), 180], [hx - r, -(hz - r), 270]], pts = [];
  for (const [cx, cz, a0] of c) for (let i = 0; i <= seg; i++) { const a = ((a0 + (90 * i) / seg) * Math.PI) / 180; pts.push([cx + r * Math.cos(a), cz + r * Math.sin(a)]); }
  return pts;
}
/** distance-parameterised track: at(d) -> position + unit tangent */
function makeTrack(pts, closed = true) {
  const P = closed ? [...pts, pts[0]] : pts, cum = [0];
  for (let i = 1; i < P.length; i++) cum.push(cum[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
  const L = cum[cum.length - 1];
  const at = d => {
    d = ((d % L) + L) % L;
    let lo = 0, hi = cum.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= d) lo = m; else hi = m; }
    const a = P[lo], b = P[hi], k = (d - cum[lo]) / ((cum[hi] - cum[lo]) || 1), len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    return { p: [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k], t: [(b[0] - a[0]) / len, (b[1] - a[1]) / len] };
  };
  return { P, L, at };
}
/** flat road ribbon along a polyline, UVs run along the road so lane markings follow it */
function ribbonGeometry(P, width, uvLen, y = 0.02) {
  const pos = [], uv = [], nor = [], idx = []; let dist = 0;
  for (let i = 0; i < P.length; i++) {
    const a = P[Math.max(0, i - 1)], b = P[Math.min(P.length - 1, i + 1)];
    const tx = b[0] - a[0], tz = b[1] - a[1], l = Math.hypot(tx, tz) || 1, nx = -tz / l, nz = tx / l;
    if (i) dist += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]);
    pos.push(P[i][0] + nx * width / 2, y, P[i][1] + nz * width / 2, P[i][0] - nx * width / 2, y, P[i][1] - nz * width / 2);
    uv.push(dist / uvLen, 0, dist / uvLen, 1); nor.push(0, 1, 0, 0, 1, 0);
    if (i) { const k = i * 2; idx.push(k - 2, k - 1, k, k - 1, k + 1, k); }
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array(pos), 3)); g.setAttribute("uv", new BufferAttribute(new Float32Array(uv), 2));
  g.setAttribute("normal", new BufferAttribute(new Float32Array(nor), 3)); g.setIndex(idx);
  return g;
}
function Road({ P, width = 7.5 }) {
  const map = useMemo(() => { const t = T.road(); t.repeat.set(1, 1); return t; }, []);
  const geo = useMemo(() => ribbonGeometry(P, width, 48), [P, width]);
  return <mesh geometry={geo} receiveShadow><meshStandardMaterial map={map} roughness={0.88} side={DoubleSide} polygonOffset polygonOffsetFactor={-2} /></mesh>;
}
const signTex = name => canvasTex(`sign:${name}`, 1024, 160, (g, w, h) => {
  g.fillStyle = "#ffffff"; g.fillRect(0, 0, w, h);
  g.fillStyle = "#6f3dba"; g.fillRect(0, 0, 26, h);
  g.fillStyle = "#1f2f59"; g.font = "700 74px Inter, Arial, sans-serif"; g.textBaseline = "middle";
  g.fillText(name.toUpperCase(), 64, h / 2 + 4, w - 100);
});

/** articulated truck (tractor + 40 ft container). Forward = +X. Wheels roll with the speed. */
function Rig({ track, offset, speed, paint = "#f4f5f7", box = "#2d5b8a", lane = 1.8 }) {
  const ref = useRef(), wheels = useRef([]);
  const tex = useMemo(() => T.container(), []), grille = useMemo(() => T.grille(), []);
  useFrame(({ clock }, dt) => {
    if (!ref.current) return;
    const { p, t } = track.at(clock.elapsedTime * speed + offset);
    ref.current.position.set(p[0] - t[1] * lane, 0, p[1] + t[0] * lane);      // keep to the right-hand lane
    ref.current.rotation.y = Math.atan2(-t[1], t[0]);                          // face the direction of travel
    wheels.current.forEach(w => w && (w.rotation.z -= (dt * speed) / 0.5));
  });
  const spin = i => el => (wheels.current[i] = el);
  const axles = [[6.3, 0.5], [3.6, 0.5], [2.4, 0.5], [-5.4, 0.5], [-6.6, 0.5], [-7.8, 0.5]];
  return <group ref={ref}>
    {axles.flatMap(([x, r], i) => [1.05, -1.05].map((z, j) => <Wheel key={`${i}${j}`} position={[x, r, z]} r={r} w={0.32} spin={spin(i * 2 + j)} />))}
    <mesh position={[0.2, 0.95, 0]} castShadow><boxGeometry args={[14.8, 0.3, 1.4]} /><meshStandardMaterial color="#1b1c20" roughness={0.7} /></mesh>
    <RoundedBox args={[2.2, 2.6, 2.4]} radius={0.2} smoothness={4} position={[6.1, 2.45, 0]} castShadow><meshPhysicalMaterial color={paint} metalness={0.45} roughness={0.22} clearcoat={1} clearcoatRoughness={0.08} /></RoundedBox>
    <mesh position={[5.4, 3.95, 0]} rotation={[0, 0, -0.3]} castShadow><boxGeometry args={[1.6, 0.16, 2.2]} /><meshPhysicalMaterial color={paint} metalness={0.45} roughness={0.25} clearcoat={1} /></mesh>
    <mesh position={[7.22, 2.95, 0]} rotation={[0, 0, 0.06]}><boxGeometry args={[0.04, 1.0, 2.1]} /><meshPhysicalMaterial color="#0f1a26" roughness={0.03} metalness={0.2} envMapIntensity={2} /></mesh>
    {[1.21, -1.21].map(z => <mesh key={z} position={[6.45, 2.95, z]}><boxGeometry args={[1.1, 0.8, 0.03]} /><meshPhysicalMaterial color="#0f1a26" roughness={0.04} envMapIntensity={2} /></mesh>)}
    <mesh position={[7.23, 1.85, 0]} rotation={[0, Math.PI / 2, 0]}><planeGeometry args={[1.5, 0.65]} /><meshStandardMaterial map={grille} metalness={0.8} roughness={0.3} side={DoubleSide} /></mesh>
    <RoundedBox args={[0.32, 0.42, 2.4]} radius={0.08} position={[7.3, 1.1, 0]} castShadow><meshStandardMaterial color="#2b2d31" roughness={0.6} /></RoundedBox>
    {[0.9, -0.9].map(z => <mesh key={z} position={[7.32, 1.42, z]}><boxGeometry args={[0.05, 0.16, 0.38]} /><meshStandardMaterial color="#fffaf0" emissive="#fff3d6" emissiveIntensity={2.2} /></mesh>)}
    <mesh position={[4.4, 1.15, 1.0]} rotation={[0, 0, Math.PI / 2]} castShadow><cylinderGeometry args={[0.3, 0.3, 1.2, 18]} /><meshStandardMaterial color="#d8dce1" metalness={0.95} roughness={0.15} /></mesh>
    <mesh position={[4.95, 3.0, 1.05]} castShadow><cylinderGeometry args={[0.09, 0.09, 3.4, 10]} /><meshStandardMaterial color="#d8dce1" metalness={0.95} roughness={0.15} /></mesh>
    <mesh position={[-1.9, 2.55, 0]} castShadow receiveShadow><boxGeometry args={[12.2, 2.6, 2.45]} /><meshStandardMaterial map={tex} color={box} metalness={0.35} roughness={0.55} /></mesh>
    {[0.95, -0.95].map(z => <mesh key={z} position={[-8.02, 1.2, z]}><boxGeometry args={[0.05, 0.2, 0.36]} /><meshStandardMaterial color="#c0392b" emissive="#ff2a1a" emissiveIntensity={1.5} /></mesh>)}
  </group>;
}
/** parked trailer backed into a dock door (wheels at the far end, landing legs near the door). Forward = +X. */
function DockTrailer({ position, rotation, box }) {
  const tex = useMemo(() => T.container(), []);
  return <group position={position} rotation={[0, rotation, 0]}>
    <mesh position={[0, 2.55, 0]} castShadow receiveShadow><boxGeometry args={[12.2, 2.6, 2.45]} /><meshStandardMaterial map={tex} color={box} metalness={0.35} roughness={0.55} /></mesh>
    <mesh position={[0, 1.1, 0]}><boxGeometry args={[12, 0.3, 1.3]} /><meshStandardMaterial color="#1b1c20" /></mesh>
    {[-4.6, -3.4].flatMap(x => [1.05, -1.05].map(z => <Wheel key={`${x}${z}`} position={[x, 0.5, z]} r={0.5} w={0.32} />))}
    {[0.8, -0.8].map(z => <mesh key={z} position={[3.6, 0.6, z]}><boxGeometry args={[0.12, 1.2, 0.12]} /><meshStandardMaterial color="#8f949b" metalness={0.6} /></mesh>)}
  </group>;
}
/** forklift shuttling between two points; it turns round at each end instead of driving backwards */
function Forklift({ a, b, speed = 2.2, color = "#e8a317" }) {
  const ref = useRef();
  const dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz), head = Math.atan2(-dz, dx);
  const tTravel = len / speed, tTurn = 1.4, cycle = 2 * (tTravel + tTurn);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    let t = clock.elapsedTime % cycle, x, z, h;
    if (t < tTravel) { const k = t / tTravel; x = a[0] + dx * k; z = a[1] + dz * k; h = head; }
    else if ((t -= tTravel) < tTurn) { x = b[0]; z = b[1]; h = head + Math.PI * (t / tTurn); }
    else if ((t -= tTurn) < tTravel) { const k = t / tTravel; x = b[0] - dx * k; z = b[1] - dz * k; h = head + Math.PI; }
    else { t -= tTravel; x = a[0]; z = a[1]; h = head + Math.PI + Math.PI * (t / tTurn); }
    ref.current.position.set(x, 0, z); ref.current.rotation.y = h;
  });
  return <group ref={ref}>
    <RoundedBox args={[2.2, 1.0, 1.2]} radius={0.12} position={[-0.2, 0.8, 0]} castShadow><meshPhysicalMaterial color={color} metalness={0.3} roughness={0.35} clearcoat={0.6} /></RoundedBox>
    <mesh position={[-1.25, 0.95, 0]} castShadow><boxGeometry args={[0.4, 0.9, 1.15]} /><meshStandardMaterial color="#2b2d31" /></mesh>
    {[[0.4, 0.55], [0.4, -0.55], [-0.6, 0.55], [-0.6, -0.55]].map(([x, z]) => <mesh key={`${x}${z}`} position={[x, 2.0, z]} castShadow><boxGeometry args={[0.08, 1.6, 0.08]} /><meshStandardMaterial color="#26282c" /></mesh>)}
    <mesh position={[-0.1, 2.82, 0]} castShadow><boxGeometry args={[1.2, 0.08, 1.2]} /><meshStandardMaterial color="#26282c" /></mesh>
    {[0.35, -0.35].map(z => <mesh key={z} position={[1.0, 1.6, z]} castShadow><boxGeometry args={[0.1, 2.8, 0.12]} /><meshStandardMaterial color="#3a3d42" metalness={0.6} /></mesh>)}
    {[0.3, -0.3].map(z => <mesh key={z} position={[1.65, 0.2, z]} castShadow><boxGeometry args={[1.2, 0.06, 0.14]} /><meshStandardMaterial color="#3a3d42" metalness={0.6} /></mesh>)}
    <group position={[1.6, 0.24, 0]}><Pallet position={[0, 0, 0]} color="#6f3dba" layers={2} /></group>
    {[[0.6, 0.55], [0.6, -0.55], [-0.9, 0.55], [-0.9, -0.55]].map(([x, z]) => <mesh key={`${x}${z}`} position={[x, 0.32, z]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.32, 0.32, 0.25, 14]} /><meshStandardMaterial color="#17181b" roughness={0.9} /></mesh>)}
  </group>;
}
function Lamp({ position, rot = 0 }) {
  return <group position={position} rotation={[0, rot, 0]}>
    <mesh position={[0, 4, 0]} castShadow><cylinderGeometry args={[0.09, 0.14, 8, 8]} /><meshStandardMaterial color="#7e848c" metalness={0.7} roughness={0.35} /></mesh>
    <mesh position={[0.7, 7.9, 0]}><boxGeometry args={[1.5, 0.1, 0.1]} /><meshStandardMaterial color="#7e848c" metalness={0.7} /></mesh>
    <mesh position={[1.4, 7.8, 0]}><boxGeometry args={[0.6, 0.15, 0.3]} /><meshStandardMaterial color="#fffaf0" emissive="#fff1c9" emissiveIntensity={0.8} /></mesh>
  </group>;
}
function Fence({ hx, hz, gate = 7 }) {
  const mesh = useMemo(() => canvasTex("chainlink", 64, 64, (g, w, h) => {
    g.clearRect(0, 0, w, h); g.strokeStyle = "rgba(170,176,184,0.9)"; g.lineWidth = 2;
    for (let i = -w; i < w * 2; i += 12) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + h, h); g.stroke(); g.beginPath(); g.moveTo(i + h, 0); g.lineTo(i, h); g.stroke(); }
  }), []);
  const sides = [[[-hx, -hz], [hx, -hz]], [[hx, -hz], [hx, hz]], [[-hx, hz], [-gate, hz]], [[gate, hz], [hx, hz]], [[-hx, -hz], [-hx, hz]]];
  return <group>{sides.map(([a, b], i) => {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]), m = mesh.clone(); m.repeat.set(len / 2.2, 1); m.needsUpdate = true;
    const posts = Math.floor(len / 3.5);
    return <group key={i}>
      <mesh position={[(a[0] + b[0]) / 2, 1.1, (a[1] + b[1]) / 2]} rotation={[0, -Math.atan2(b[1] - a[1], b[0] - a[0]), 0]}>
        <planeGeometry args={[len, 2.2]} /><meshStandardMaterial map={m} transparent alphaTest={0.3} side={DoubleSide} metalness={0.6} roughness={0.4} /></mesh>
      {Array.from({ length: posts + 1 }, (_, k) => <mesh key={k} position={[a[0] + ((b[0] - a[0]) * k) / posts, 1.15, a[1] + ((b[1] - a[1]) * k) / posts]}>
        <cylinderGeometry args={[0.05, 0.05, 2.3, 6]} /><meshStandardMaterial color="#8f949b" metalness={0.6} /></mesh>)}
    </group>;
  })}</group>;
}
function Beacon({ color, position }) {
  const ref = useRef();
  useFrame(({ clock }) => { if (ref.current) ref.current.material.emissiveIntensity = 1.2 + Math.sin(clock.elapsedTime * 3) * 0.9; });
  return <mesh ref={ref} position={position}><sphereGeometry args={[0.45, 16, 12]} /><meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.5} /></mesh>;
}
function SolarArray({ position, cols = 8, rows = 3 }) {
  return <group position={position}>{Array.from({ length: cols * rows }, (_, i) => {
    const c = i % cols, r = Math.floor(i / cols);
    return <mesh key={i} position={[c * 2.2, 0.5, r * 2.6]} rotation={[-0.35, 0, 0]} castShadow>
      <boxGeometry args={[2.0, 0.06, 1.6]} /><meshPhysicalMaterial color="#1a2c4f" metalness={0.6} roughness={0.15} clearcoat={1} envMapIntensity={1.4} /></mesh>;
  })}</group>;
}
function Cars({ position }) {
  const cols = ["#f2f2f2", "#c0c4c9", "#1d1f23", "#8a1c1c", "#2d4f7c", "#e6e6e6", "#5d6166", "#2f2f33"];
  return <group position={position}>{Array.from({ length: 18 }, (_, i) => {
    const row = Math.floor(i / 9), x = (i % 9) * 2.6, c = cols[(i * 5) % cols.length];
    if ((i * 7) % 11 === 3) return null;                                    // a few empty bays
    return <group key={i} position={[x, 0, row ? -3.6 : 3.6]} rotation={[0, row ? Math.PI : 0, 0]}>
      <RoundedBox args={[1.8, 0.7, 4.3]} radius={0.25} smoothness={3} position={[0, 0.6, 0]} castShadow><meshPhysicalMaterial color={c} metalness={0.6} roughness={0.25} clearcoat={1} /></RoundedBox>
      <RoundedBox args={[1.6, 0.55, 2.2]} radius={0.22} smoothness={3} position={[0, 1.12, -0.2]} castShadow><meshPhysicalMaterial color="#121821" roughness={0.05} metalness={0.3} envMapIntensity={1.8} /></RoundedBox>
      {[[0.8, 1.4], [-0.8, 1.4], [0.8, -1.4], [-0.8, -1.4]].map(([wx, wz]) => <mesh key={`${wx}${wz}`} position={[wx, 0.33, wz]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.33, 0.33, 0.22, 14]} /><meshStandardMaterial color="#17181b" /></mesh>)}
    </group>;
  })}</group>;
}

export function CampusScene({ name = "Supplier", health = "WATCH", materials = [] }) {
  const hc = health === "AT_RISK" ? "#c0392b" : health === "HEALTHY" ? "#1f8f74" : "#d9822b";
  const tx = useMemo(() => {
    const r = (t, a, b) => { t.repeat.set(a, b); return t; };
    return { grass: r(T.grass(), 40, 40), conc: r(T.concrete(), 12, 10), park: r(T.parking(), 5, 1), clad: r(T.cladding(), 10, 1), clad2: r(T.cladding(), 5, 1),
      curtain: r(T.curtain(), 4, 4), roller: T.roller(), sign: signTex(name) };
  }, [name]);
  // site plan: plot inside a perimeter ring road, access road to the south
  const HX = 58, HZ = 46;
  const loop = useMemo(() => makeTrack(roundedRect(HX, HZ, 12)), []);
  const access = useMemo(() => [[0, HZ], [0, 260]], []);
  const rigs = [["#f4f5f7", "#2d5b8a"], ["#c0392b", "#7a7f86"], ["#1f2f59", "#a4572f"], ["#e8e8e8", "#3d6b4f"]];
  const pallets = materials.slice(0, 8);
  const trees = useMemo(() => Array.from({ length: 70 }, (_, i) => {
    const a = (i / 70) * Math.PI * 2 + Math.sin(i * 3.1) * 0.04, rr = 1 + ((i * 37) % 23) / 60;
    const x = Math.cos(a) * (HX + 20) * rr, z = Math.sin(a) * (HZ + 22) * rr;
    return Math.abs(x) < 9 && z > 0 ? null : { x, z, s: 1.2 + ((i * 7) % 5) * 0.15, seed: i + 3 };
  }).filter(Boolean), []);
  return <Canvas shadows dpr={[1, 1.5]} camera={{ position: [96, 58, 104], fov: 34, far: 2500 }} gl={{ antialias: false }}>
    <fog attach="fog" args={["#d6e1ec", 220, 760]} />
    <Sky sunPosition={[70, 55, 60]} turbidity={4} rayleigh={1} />
    <Suspense fallback={null}><Lighting sun={[70, 85, 55]} shadow={90} /></Suspense>
    {/* ground, plot, roads */}
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]} receiveShadow><planeGeometry args={[1400, 1400]} /><meshStandardMaterial map={tx.grass} roughness={0.95} /></mesh>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -2]} receiveShadow><planeGeometry args={[2 * HX - 16, 2 * HZ - 12]} /><meshStandardMaterial map={tx.conc} roughness={0.85} /></mesh>
    <Road P={loop.P} />
    <Road P={access} width={8} />
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.015, HZ - 10]} receiveShadow><planeGeometry args={[14, 14]} /><meshStandardMaterial map={tx.conc} roughness={0.85} /></mesh>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-30, 0.02, 24]} receiveShadow><planeGeometry args={[26, 15]} /><meshStandardMaterial map={tx.park} roughness={0.9} /></mesh>
    <Fence hx={HX - 8} hz={HZ - 6} />
    {/* entrance: gatehouse, barrier and monument sign with the supplier's name */}
    <mesh position={[9.5, 1.6, HZ - 7]} castShadow><boxGeometry args={[3.5, 3.2, 3]} /><meshStandardMaterial map={tx.clad2} color="#f1ede4" /></mesh>
    <mesh position={[3.5, 1.0, HZ - 6]}><boxGeometry args={[7, 0.12, 0.12]} /><meshStandardMaterial color="#e74c3c" /></mesh>
    <group position={[-12, 0, HZ - 3]}>
      <mesh position={[0, 1.3, 0]} castShadow><boxGeometry args={[9, 2.6, 0.9]} /><meshStandardMaterial color="#3a3f47" roughness={0.6} /></mesh>
      <mesh position={[0, 1.4, 0.46]}><planeGeometry args={[8.4, 1.3]} /><meshStandardMaterial map={tx.sign} roughness={0.4} /></mesh>
    </group>
    {/* production hall: cladding, name on the facade, skylights, solar, rooftop plant, docks with trailers */}
    <group position={[-12, 0, -12]}>
      <mesh position={[0, 6, 0]} castShadow receiveShadow><boxGeometry args={[44, 12, 26]} /><meshStandardMaterial map={tx.clad} metalness={0.25} roughness={0.55} /></mesh>
      <mesh position={[0, 12.2, 0]} castShadow><boxGeometry args={[44.4, 0.4, 26.4]} /><meshStandardMaterial color="#7e848c" roughness={0.7} /></mesh>
      <mesh position={[0, 10.2, 13.03]}><planeGeometry args={[22, 3.4]} /><meshStandardMaterial map={tx.sign} roughness={0.4} /></mesh>
      <mesh position={[0, 8.0, 13.02]}><planeGeometry args={[44, 0.5]} /><meshStandardMaterial color={hc} emissive={hc} emissiveIntensity={0.35} /></mesh>
      {[-15, -5].map(x => <mesh key={x} position={[x, 12.45, -6]}><boxGeometry args={[3, 0.25, 12]} /><meshPhysicalMaterial color="#8fb3d6" roughness={0.05} metalness={0.4} envMapIntensity={1.6} /></mesh>)}
      <SolarArray position={[2, 12.4, -10]} cols={8} rows={3} />
      {[[-17, 7], [-9, 8], [14, 8]].map(([x, z], i) => <mesh key={i} position={[x, 13.0, z]} castShadow><boxGeometry args={[2.6, 1.3, 2.6]} /><meshStandardMaterial color="#b9bec5" metalness={0.6} roughness={0.4} /></mesh>)}
      {[-16, -10, -4, 2, 8].map((x, i) => <group key={x} position={[x, 0, 13.04]}>
        <mesh position={[0, 2.4, 0]}><planeGeometry args={[3.6, 4.6]} /><meshStandardMaterial map={tx.roller} metalness={0.5} roughness={0.5} /></mesh>
        <mesh position={[0, 5.2, 0.9]} castShadow><boxGeometry args={[4.6, 0.2, 1.8]} /><meshStandardMaterial color="#5c6168" metalness={0.5} /></mesh>
        <mesh position={[0, 0.6, 0.9]}><boxGeometry args={[3.2, 1.2, 1.8]} /><meshStandardMaterial color="#3a3d42" /></mesh>
        {i % 2 === 0 && <DockTrailer position={[0, 0, 7.8]} rotation={-Math.PI / 2} box={["#2d5b8a", "#8b3a2b", "#3d6b4f"][i / 2]} />}
      </group>)}
    </group>
    {/* office tower with lobby canopy and flags */}
    <group position={[30, 0, -20]}>
      <mesh position={[0, 11, 0]} castShadow receiveShadow><boxGeometry args={[14, 22, 13]} /><meshStandardMaterial map={tx.curtain} metalness={0.7} roughness={0.12} /></mesh>
      <mesh position={[0, 22.2, 0]} castShadow><boxGeometry args={[14.3, 0.4, 13.3]} /><meshStandardMaterial color="#3a3f47" /></mesh>
      <mesh position={[0, 3.6, 7.6]} castShadow><boxGeometry args={[8, 0.3, 2.6]} /><meshStandardMaterial color="#e3e6ea" /></mesh>
      <Beacon color={hc} position={[5.5, 23.2, 5]} />
      {[-3, 0, 3].map((x, i) => <group key={x} position={[x, 0, 12]}>
        <mesh position={[0, 4.5, 0]}><cylinderGeometry args={[0.06, 0.06, 9, 8]} /><meshStandardMaterial color="#c9cdd2" metalness={0.8} /></mesh>
        <mesh position={[0.75, 8.2, 0]}><planeGeometry args={[1.5, 0.95]} /><meshStandardMaterial color={["#6f3dba", "#1f2f59", "#e4572e"][i]} side={DoubleSide} /></mesh>
      </group>)}
    </group>
    {/* warehouse */}
    <group position={[30, 0, 14]}>
      <mesh position={[0, 4.5, 0]} castShadow receiveShadow><boxGeometry args={[18, 9, 20]} /><meshStandardMaterial map={tx.clad2} color="#f1ede4" metalness={0.25} roughness={0.55} /></mesh>
      <mesh position={[0, 9.15, 0]} castShadow><boxGeometry args={[18.3, 0.3, 20.3]} /><meshStandardMaterial color="#8d939b" /></mesh>
      {[-5.5, 0, 5.5].map(z => <mesh key={z} position={[-9.03, 2.2, z]} rotation={[0, -Math.PI / 2, 0]}><planeGeometry args={[3.4, 4.4]} /><meshStandardMaterial map={tx.roller} metalness={0.5} /></mesh>)}
    </group>
    {/* utilities: tanks and chimney */}
    {[[-46, -30], [-46, -22]].map(([x, z], i) => <group key={i} position={[x, 0, z]}>
      <mesh position={[0, 6, 0]} castShadow><cylinderGeometry args={[3, 3, 12, 32]} /><meshStandardMaterial color="#d7dbe0" metalness={0.75} roughness={0.25} /></mesh>
      <mesh position={[0, 12, 0]} castShadow><sphereGeometry args={[3, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2]} /><meshStandardMaterial color="#d7dbe0" metalness={0.75} roughness={0.25} /></mesh></group>)}
    <group position={[-38, 0, -34]}>
      {Array.from({ length: 6 }, (_, i) => <mesh key={i} position={[0, 2.5 + i * 5, 0]} castShadow><cylinderGeometry args={[1.25 - i * 0.05, 1.3 - i * 0.05, 5, 24]} /><meshStandardMaterial color={i % 2 ? "#c0392b" : "#f2f2f2"} roughness={0.6} /></mesh>)}
      <Smoke position={[0, 30.5, 0]} scale={1.6} rate={0.8} />
    </group>
    {/* pallet yard (one row per material we buy) + forklift */}
    {pallets.map((m, i) => Array.from({ length: 3 }, (_, k) => <Pallet key={`${m.material_id}${k}`} position={[12 + (i % 4) * 2.4, 0, 22 + Math.floor(i / 4) * 5 + k * 1.3]} color={MAT_COLORS[i % MAT_COLORS.length]} layers={2 + (k % 2)} />))}
    <Forklift a={[8, 12]} b={[8, 30]} />
    <Cars position={[-40, 0, 24]} />
    {/* street lamps along the ring road */}
    {Array.from({ length: 16 }, (_, i) => { const { p, t } = loop.at((i / 16) * loop.L); return <Lamp key={i} position={[p[0] + t[1] * 5, 0, p[1] - t[0] * 5]} rot={Math.atan2(-t[0], -t[1])} />; })}
    {trees.map((t, i) => <Tree key={i} position={[t.x, 0, t.z]} s={t.s} seed={t.seed} />)}
    {Array.from({ length: 14 }, (_, i) => <Tree key={`a${i}`} position={[i % 2 ? 9 : -9, 0, HZ + 14 + Math.floor(i / 2) * 16]} s={1.3} seed={i + 40} />)}
    {/* trucks on the ring road: same speed, evenly spaced, always facing the direction of travel */}
    {rigs.map(([paint, box], i) => <Rig key={i} track={loop} offset={(i / rigs.length) * loop.L} speed={7} paint={paint} box={box} />)}
    <Post bloom={0.15} />
    <OrbitControls autoRotate autoRotateSpeed={0.25} enablePan={false} minDistance={45} maxDistance={220} maxPolarAngle={Math.PI * 0.45} target={[0, 6, 0]} />
  </Canvas>;
}

// ------------------------------------------------------------------ PORT
// Quay along Z at x = 0, sea for x > 0, land (yard) for x < 0. Units ~ metres.
const QUAY_Y = 1.6;
/** container yard: hundreds of boxes in one instanced mesh (fast), stacked 1-4 high in blocks */
function Yard({ x0 = -34, blocks = 6, rows = 6, bays = 9 }) {
  const ref = useRef(); const tex = useMemo(() => T.container(), []);
  const boxes = useMemo(() => {
    const out = []; let s = 7;
    const rnd = () => { const v = Math.sin(s++ * 12.9898) * 43758.5453; return v - Math.floor(v); };
    for (let b = 0; b < blocks; b++) for (let r = 0; r < rows; r++) for (let k = 0; k < bays; k++) {
      const h = 1 + Math.floor(rnd() * 4);
      for (let t = 0; t < h; t++) out.push({ x: x0 - (b % 2) * 32 - r * 2.7, z: -58 + Math.floor(b / 2) * 42 + k * 4.4, y: QUAY_Y + 1.3 + t * 2.62, c: FILLER[(b * 7 + r * 3 + k + t * 5) % FILLER.length] });
    }
    return out;
  }, [x0, blocks, rows, bays]);
  useEffect(() => {
    const m = ref.current; if (!m) return;
    const mat = new Matrix4(), c = new Color();
    boxes.forEach((b, i) => { mat.makeTranslation(b.x, b.y, b.z); m.setMatrixAt(i, mat); m.setColorAt(i, c.set(b.c)); });
    m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [boxes]);
  return <instancedMesh ref={ref} args={[null, null, boxes.length]} castShadow receiveShadow>
    <boxGeometry args={[2.45, 2.55, 4.2]} /><meshStandardMaterial map={tex} roughness={0.6} metalness={0.35} />
  </instancedMesh>;
}
/** rubber-tyred gantry crane straddling a yard block; drives slowly along the block */
function RTG({ x, z0, z1, phase = 0 }) {
  const ref = useRef();
  useFrame(({ clock }) => { if (ref.current) ref.current.position.z = z0 + (z1 - z0) * (0.5 + 0.5 * Math.sin(clock.elapsedTime * 0.06 + phase)); });
  const span = 18;
  return <group ref={ref} position={[x, QUAY_Y, z0]}>
    {[-span / 2, span / 2].flatMap(dx => [-3, 3].map(dz => <mesh key={`${dx}${dz}`} position={[dx, 9, dz]} castShadow><boxGeometry args={[0.7, 18, 0.7]} /><meshStandardMaterial color="#e8b71c" metalness={0.4} roughness={0.45} /></mesh>))}
    {[-3, 3].map(dz => <mesh key={dz} position={[0, 18.2, dz]} castShadow><boxGeometry args={[span + 1, 1.0, 0.8]} /><meshStandardMaterial color="#e8b71c" metalness={0.4} roughness={0.45} /></mesh>)}
    {[-span / 2, span / 2].map(dx => <mesh key={dx} position={[dx, 0.6, 0]}><boxGeometry args={[1.4, 1.2, 7.6]} /><meshStandardMaterial color="#2b2d31" /></mesh>)}
    <mesh position={[2, 17.6, 0]} castShadow><boxGeometry args={[3, 1.8, 7]} /><meshStandardMaterial color="#f2f2f2" /></mesh>
  </group>;
}
/** ship-to-shore gantry crane; its trolley carries a box from the ship to the quay and back */
function STSCrane({ z, color = "#c0392b", phase = 0 }) {
  const trolley = useRef(), spreader = useRef(), box = useRef(), cable = useRef();
  const tex = useMemo(() => T.container(), []);
  const BOOM_Y = 34, SHIP_X = 15, QUAY_X = -6;
  useFrame(({ clock }) => {
    const t = (clock.elapsedTime * 0.06 + phase) % 1;                       // one move cycle (~17 s)
    // lower over the ship, hoist a box, travel to the quay, lower it, release, travel back
    let x, drop, carry;
    if (t < 0.2) { x = SHIP_X; drop = t / 0.2; carry = false; }
    else if (t < 0.4) { x = SHIP_X; drop = 1 - (t - 0.2) / 0.2; carry = true; }
    else if (t < 0.6) { x = SHIP_X + (QUAY_X - SHIP_X) * ((t - 0.4) / 0.2); drop = 0; carry = true; }
    else if (t < 0.75) { x = QUAY_X; drop = (t - 0.6) / 0.15; carry = true; }
    else if (t < 0.85) { x = QUAY_X; drop = 1 - (t - 0.75) / 0.1; carry = false; }
    else { x = QUAY_X + (SHIP_X - QUAY_X) * ((t - 0.85) / 0.15); drop = 0; carry = false; }
    const depth = x > 0 ? 15 : 26, y = BOOM_Y - 3 - drop * depth;      // stops on the stack top over the ship, on the apron over the quay
    if (trolley.current) trolley.current.position.x = x;
    if (spreader.current) spreader.current.position.set(x, y, 0);
    if (box.current) { box.current.visible = carry; box.current.position.set(x, y - 1.6, 0); }
    if (cable.current) { const len = BOOM_Y - 1 - y; cable.current.scale.y = Math.max(0.1, len); cable.current.position.set(x, y + len / 2, 0); }
  });
  return <group position={[0, QUAY_Y, z]}>
    {[-12, 2].flatMap(x => [-7, 7].map(dz => <mesh key={`${x}${dz}`} position={[x, 15, dz]} castShadow><boxGeometry args={[1.0, 30, 1.0]} /><meshStandardMaterial color={color} metalness={0.35} roughness={0.45} /></mesh>))}
    {[-7, 7].map(dz => <mesh key={dz} position={[-5, 29.5, dz]} castShadow><boxGeometry args={[16, 1.2, 1.0]} /><meshStandardMaterial color={color} metalness={0.35} roughness={0.45} /></mesh>)}
    {[-12, 2].map(x => <mesh key={x} position={[x, 12, 0]} castShadow><boxGeometry args={[0.8, 0.8, 14]} /><meshStandardMaterial color={color} metalness={0.35} roughness={0.45} /></mesh>)}
    {[-12, 2].flatMap(x => [-7, 7].map(dz => <mesh key={`w${x}${dz}`} position={[x, 0.5, dz]}><boxGeometry args={[2.4, 1, 1.6]} /><meshStandardMaterial color="#2b2d31" /></mesh>))}
    <mesh position={[3, BOOM_Y, 0]} castShadow><boxGeometry args={[52, 1.6, 3.2]} /><meshStandardMaterial color="#f2f2f2" metalness={0.3} roughness={0.4} /></mesh>
    <mesh position={[-12, BOOM_Y + 2, 0]} castShadow><boxGeometry args={[6, 3.6, 5]} /><meshStandardMaterial color="#f2f2f2" roughness={0.45} /></mesh>
    <mesh position={[-5, BOOM_Y - 3.2, 0]} castShadow><boxGeometry args={[3, 2.4, 3]} /><meshPhysicalMaterial color="#1c2f45" roughness={0.1} metalness={0.4} /></mesh>
    {[[-2, 1], [8, -1]].map(([x, s], i) => <mesh key={i} position={[x, BOOM_Y + 5.5, 0]} rotation={[0, 0, s * 0.42]} castShadow><boxGeometry args={[0.7, 12, 0.7]} /><meshStandardMaterial color={color} /></mesh>)}
    <mesh position={[16, BOOM_Y + 4.5, 0]} rotation={[0, 0, -0.27]}><boxGeometry args={[30, 0.12, 0.12]} /><meshStandardMaterial color="#555" /></mesh>
    <mesh ref={trolley} position={[SHIP_X, BOOM_Y - 1.1, 0]} castShadow><boxGeometry args={[3, 1.2, 3.6]} /><meshStandardMaterial color="#2b2d31" /></mesh>
    <mesh ref={cable}><boxGeometry args={[0.08, 1, 0.08]} /><meshStandardMaterial color="#222" /></mesh>
    <mesh ref={spreader} castShadow><boxGeometry args={[2.6, 0.5, 6.2]} /><meshStandardMaterial color="#e8b71c" metalness={0.4} /></mesh>
    <mesh ref={box} castShadow><boxGeometry args={[2.45, 2.55, 6.1]} /><meshStandardMaterial map={tex} color={FILLER[Math.floor(phase * 10) % FILLER.length]} roughness={0.6} metalness={0.35} /></mesh>
  </group>;
}
function LightMast({ position }) {
  return <group position={position}>
    <mesh position={[0, 15, 0]} castShadow><cylinderGeometry args={[0.25, 0.45, 30, 10]} /><meshStandardMaterial color="#9aa0a8" metalness={0.7} roughness={0.35} /></mesh>
    <mesh position={[0, 30.2, 0]}><boxGeometry args={[3, 1, 3]} /><meshStandardMaterial color="#fffaf0" emissive="#fff1c9" emissiveIntensity={0.9} /></mesh>
  </group>;
}
function Lighthouse({ position }) {
  const lamp = useRef();
  useFrame(({ clock }) => { if (lamp.current) lamp.current.material.emissiveIntensity = (clock.elapsedTime % 3) < 0.6 ? 4 : 0.2; });
  return <group position={position}>
    {Array.from({ length: 4 }, (_, i) => <mesh key={i} position={[0, 2 + i * 4, 0]} castShadow><cylinderGeometry args={[1.6 - i * 0.2, 1.8 - i * 0.2, 4, 18]} /><meshStandardMaterial color={i % 2 ? "#c0392b" : "#f4f4f4"} /></mesh>)}
    <mesh ref={lamp} position={[0, 17, 0]}><sphereGeometry args={[0.9, 16, 12]} /><meshStandardMaterial color="#fff6c2" emissive="#fff1a0" emissiveIntensity={2} /></mesh>
  </group>;
}

export function PortScene({ name = "Port", status = "ok" }) {
  const tx = useMemo(() => {
    const r = (t, a, b) => { t.repeat.set(a, b); return t; };
    return { conc: r(T.concrete(), 30, 40), asph: r(T.asphalt(), 6, 30), sign: signTex(name), curtain: r(T.curtain(), 6, 4) };
  }, [name]);
  // terminal-truck loop on the apron between the cranes and the yard (trucks drive forward along its tangent)
  const apron = useMemo(() => makeTrack(roundedRect(9, 70, 6).map(([x, z]) => [x - 20, z])), []);
  return <Canvas shadows dpr={[1, 1.5]} camera={{ position: [130, 75, 135], fov: 34, far: 3000 }} gl={{ antialias: false }}>
    <fog attach="fog" args={["#c7d6e4", 280, 1200]} />
    <Sky sunPosition={[80, 55, 40]} turbidity={5} rayleigh={1.1} mieCoefficient={0.004} mieDirectionalG={0.85} />
    <Suspense fallback={null}><Lighting sun={[90, 80, 50]} shadow={120} /><Ocean /></Suspense>
    {/* land: quay apron + yard; quay wall with fenders and bollards facing the sea (+x) */}
    <mesh position={[-130, QUAY_Y / 2 - 1, 0]} receiveShadow castShadow><boxGeometry args={[260, QUAY_Y + 2, 300]} /><meshStandardMaterial color="#8d8a84" roughness={0.9} /></mesh>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-130, QUAY_Y + 0.01, 0]} receiveShadow><planeGeometry args={[260, 300]} /><meshStandardMaterial map={tx.conc} roughness={0.85} /></mesh>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-20, QUAY_Y + 0.03, 0]} receiveShadow><planeGeometry args={[26, 156]} /><meshStandardMaterial map={tx.asph} roughness={0.9} /></mesh>
    {[-3.5, -36.5].map(x => <mesh key={x} rotation={[-Math.PI / 2, 0, 0]} position={[x, QUAY_Y + 0.04, 0]}><planeGeometry args={[0.6, 280]} /><meshStandardMaterial color="#e8b71c" /></mesh>)}
    {Array.from({ length: 30 }, (_, i) => <mesh key={i} position={[0.35, QUAY_Y - 0.6, -145 + i * 10]} castShadow><boxGeometry args={[0.7, 1.6, 2.2]} /><meshStandardMaterial color="#1b1c20" roughness={0.9} /></mesh>)}
    {Array.from({ length: 30 }, (_, i) => <mesh key={`b${i}`} position={[-1.2, QUAY_Y + 0.4, -145 + i * 10 + 5]} castShadow><cylinderGeometry args={[0.35, 0.45, 0.8, 12]} /><meshStandardMaterial color="#2b2d31" metalness={0.5} /></mesh>)}
    {/* container ship moored alongside the quay, with mooring lines */}
    <group position={[11, 0, 0]} rotation={[0, -Math.PI / 2, 0]} scale={2.2}><Ship cargo={[]} status={status} onHover={() => {}} hovered={null} /></group>
    {[-46, 46].map(z => <mesh key={z} position={[3, QUAY_Y + 1.4, z]} rotation={[0, 0, 0.35]}><boxGeometry args={[8, 0.08, 0.08]} /><meshStandardMaterial color="#e8e1cf" /></mesh>)}
    {/* ship-to-shore cranes working the ship */}
    {[-34, 0, 34].map((z, i) => <STSCrane key={z} z={z} phase={i * 0.31} color={i === 1 ? "#1e5aa8" : "#c0392b"} />)}
    {/* container yard + gantry cranes */}
    <Yard />
    <RTG x={-49} z0={-56} z1={-20} phase={0} />
    <RTG x={-81} z0={-14} z1={24} phase={2} />
    <RTG x={-49} z0={28} z1={60} phase={4} />
    {/* terminal trucks shuttling boxes between the cranes and the yard */}
    {[["#f4f5f7", "#2d5b8a"], ["#e8b71c", "#8b3a2b"], ["#f4f5f7", "#3d6b4f"], ["#c0392b", "#7a7f86"]].map(([paint, box], i) =>
      <group key={i} position={[0, QUAY_Y, 0]}><Rig track={apron} offset={(i / 4) * apron.L} speed={6} paint={paint} box={box} lane={0} /></group>)}
    {/* terminal office with the port name, truck gate */}
    <group position={[-150, QUAY_Y, -90]}>
      <mesh position={[0, 9, 0]} castShadow receiveShadow><boxGeometry args={[30, 18, 16]} /><meshStandardMaterial map={tx.curtain} metalness={0.6} roughness={0.15} /></mesh>
      <mesh position={[0, 18.3, 0]}><boxGeometry args={[30.4, 0.6, 16.4]} /><meshStandardMaterial color="#3a3f47" /></mesh>
      <mesh position={[0, 15.5, 8.05]}><planeGeometry args={[24, 3.6]} /><meshStandardMaterial map={tx.sign} roughness={0.4} /></mesh>
    </group>
    <group position={[-150, QUAY_Y, 60]}>
      {Array.from({ length: 6 }, (_, i) => <mesh key={i} position={[0, 4, -15 + i * 6]} castShadow><boxGeometry args={[10, 0.4, 4]} /><meshStandardMaterial color="#e3e6ea" /></mesh>)}
      {Array.from({ length: 6 }, (_, i) => <mesh key={`g${i}`} position={[0, 2, -15 + i * 6]}><boxGeometry args={[0.4, 4, 0.4]} /><meshStandardMaterial color="#7e848c" /></mesh>)}
    </group>
    {[[-30, -120], [-30, -40], [-30, 40], [-30, 120], [-110, -80], [-110, 80]].map(([x, z], i) => <LightMast key={i} position={[x, QUAY_Y, z]} />)}
    {/* breakwater and lighthouse at the harbour entrance */}
    <mesh position={[150, 1.2, -60]} rotation={[0, 0.5, 0]} castShadow receiveShadow><boxGeometry args={[8, 3.6, 260]} /><meshStandardMaterial color="#8a8780" roughness={1} /></mesh>
    <Lighthouse position={[208, 2.5, 50]} />
    <Post bloom={0.18} />
    <OrbitControls autoRotate autoRotateSpeed={0.22} enablePan={false} minDistance={60} maxDistance={340} maxPolarAngle={Math.PI * 0.45} target={[-20, 8, 0]} />
  </Canvas>;
}
