import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import {
  BoxGeometry, BufferAttribute, CanvasTexture, Color, CylinderGeometry, ExtrudeGeometry, LatheGeometry, Object3D,
  RepeatWrapping, Shape, SRGBColorSpace, Vector2,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/* Detailed procedural 3D models shared by Network 360 and the Network Tracker map.
   No downloads: every model is built from geometry + canvas textures, coloured from the guide palette (scenePalette).
   Units: ship ~1.2 long, truck ~0.62 long, plant campus ~4 x 3, port terminal ~6.5 x 3.5 (callers scale them). */

function rng(seed) { let s = Math.max(1, Math.floor(seed)); return () => (s = (s * 16807) % 2147483647) / 2147483647; }

// ------------------------------------------------------------------ geometry helpers
function colorize(g, color) {
  const c = new Color(color), n = g.attributes.position.count, arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  g.setAttribute("color", new BufferAttribute(arr, 3));
  return g;
}
/** coloured part without UVs (for vertex-coloured merged models) */
function P(geo, color, [x = 0, y = 0, z = 0] = [], rot) {
  let g = geo.index ? geo.toNonIndexed() : geo;
  if (rot) { if (rot[0]) g.rotateX(rot[0]); if (rot[1]) g.rotateY(rot[1]); if (rot[2]) g.rotateZ(rot[2]); }
  g.translate(x, y, z);
  colorize(g, color);
  for (const k of Object.keys(g.attributes)) if (!["position", "normal", "color"].includes(k)) g.deleteAttribute(k);
  return g;
}
/** coloured part that keeps UVs (for textured + tinted parts such as corrugated containers) */
function PU(geo, color, [x = 0, y = 0, z = 0] = []) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.translate(x, y, z);
  colorize(g, color);
  for (const k of Object.keys(g.attributes)) if (!["position", "normal", "color", "uv"].includes(k)) g.deleteAttribute(k);
  return g;
}
const merge = parts => mergeGeometries(parts, false);
const box = (w, h, d) => new BoxGeometry(w, h, d);
const cyl = (rt, rb, h, s = 12) => new CylinderGeometry(rt, rb, h, s);
function wheel(r, w) { const g = cyl(r, r, w, 12); g.rotateZ(Math.PI / 2); return g; }

// ------------------------------------------------------------------ canvas textures
function tex(w, h, draw, repeat = [1, 1]) {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new CanvasTexture(c); t.colorSpace = SRGBColorSpace; t.wrapS = t.wrapT = RepeatWrapping; t.repeat.set(...repeat); t.anisotropy = 4;
  return t;
}
/** greyscale corrugated steel (tinted per container by vertex colour) */
export function corrugatedTexture() {
  return tex(64, 64, (g, w, h) => {
    g.fillStyle = "#e9e9e9"; g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 4) { g.fillStyle = x % 8 ? "#cfcfcf" : "#f7f7f7"; g.fillRect(x, 0, 2, h); }
    g.fillStyle = "#a9a9a9"; g.fillRect(0, 0, w, 3); g.fillRect(0, h - 3, w, 3);
  });
}
function curtainWallTexture(glass, mullion, lit, night, seed) {
  const r = rng(seed);
  return tex(128, 128, (g, w, h) => {
    g.fillStyle = mullion; g.fillRect(0, 0, w, h);
    for (let y = 2; y < h; y += 16) for (let x = 2; x < w; x += 16) {
      g.fillStyle = night && r() > 0.4 ? lit : glass; g.fillRect(x, y, 13, 13);
      if (!night) { g.fillStyle = "rgba(255,255,255,0.18)"; g.fillRect(x, y, 13, 4); }
    }
  });
}
function rollerDoorTexture(wall, door) {
  return tex(128, 64, (g, w, h) => {
    g.fillStyle = wall; g.fillRect(0, 0, w, h);
    for (let x = 6; x < w; x += 30) { g.fillStyle = door; g.fillRect(x, 18, 22, 46); for (let y = 20; y < h; y += 4) { g.fillStyle = "rgba(0,0,0,0.18)"; g.fillRect(x, y, 22, 1); } }
  });
}
function parkingTexture(asphalt, mark) {
  return tex(128, 128, (g, w, h) => {
    g.fillStyle = asphalt; g.fillRect(0, 0, w, h);
    g.fillStyle = mark;
    for (let x = 0; x <= w; x += 16) { g.fillRect(x, 8, 2, 40); g.fillRect(x, 80, 2, 40); }
    g.fillRect(0, 62, w, 2);
  });
}
function apronTexture(concrete, mark) {
  return tex(256, 128, (g, w, h) => {
    g.fillStyle = concrete; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.05})`; g.fillRect(Math.random() * w, Math.random() * h, 3, 3); }
    g.fillStyle = mark;
    for (let y = 20; y < h; y += 34) for (let x = 0; x < w; x += 24) g.fillRect(x, y, 14, 2);
    g.fillRect(0, h - 6, w, 3);
  });
}
function solarTexture(cell, frame) {
  return tex(64, 64, (g, w, h) => {
    g.fillStyle = frame; g.fillRect(0, 0, w, h);
    for (let y = 1; y < h; y += 8) for (let x = 1; x < w; x += 8) { g.fillStyle = cell; g.fillRect(x, y, 7, 7); }
  });
}

// ------------------------------------------------------------------ container ship (hull + superstructure; containers separate)
function hullShape(halfW, aft, fwd, shoulder) {
  const s = new Shape();
  s.moveTo(-halfW * 0.85, aft); s.quadraticCurveTo(-halfW, aft, -halfW, aft + 0.06); s.lineTo(-halfW, shoulder);
  s.quadraticCurveTo(-halfW * 0.92, fwd - 0.06, 0, fwd); s.quadraticCurveTo(halfW * 0.92, fwd - 0.06, halfW, shoulder);
  s.lineTo(halfW, aft + 0.06); s.quadraticCurveTo(halfW, aft, halfW * 0.85, aft); s.closePath();
  return s;
}
export function containerShipHull(C) {
  const parts = [];
  const lower = new ExtrudeGeometry(hullShape(0.16, -0.6, 0.62, 0.3), { depth: 0.07, bevelEnabled: false }); lower.rotateX(-Math.PI / 2); lower.translate(0, -0.05, 0);
  const upper = new ExtrudeGeometry(hullShape(0.17, -0.6, 0.64, 0.3), { depth: 0.1, bevelEnabled: false }); upper.rotateX(-Math.PI / 2); upper.translate(0, 0.02, 0);
  parts.push(P(lower, C.antifoul), P(upper, C.hull));
  parts.push(P(box(0.345, 0.012, 0.95), C.boot, [0, 0.025, -0.02]));                                     // white boot-top line
  parts.push(P(box(0.3, 0.01, 1.0), C.deck, [0, 0.122, 0]));                                             // main deck
  parts.push(P(box(0.3, 0.05, 0.14), C.hull, [0, 0.14, 0.5]));                                           // forecastle
  parts.push(P(box(0.18, 0.012, 0.1), C.boot, [0, 0.168, 0.53]));
  // aft superstructure: 5 decks, window bands, bridge wings, mast, funnel
  for (let d = 0; d < 5; d++) {
    parts.push(P(box(0.25, 0.042, 0.12), C.bridge, [0, 0.15 + d * 0.042, -0.47]));
    parts.push(P(box(0.252, 0.012, 0.122), C.window, [0, 0.16 + d * 0.042, -0.47]));
  }
  parts.push(P(box(0.36, 0.02, 0.06), C.bridge, [0, 0.36, -0.45]));                                    // bridge wings
  parts.push(P(box(0.362, 0.01, 0.062), C.window, [0, 0.35, -0.45]));
  parts.push(P(cyl(0.006, 0.006, 0.14, 6), C.bridge, [0, 0.44, -0.47]));                              // mast
  parts.push(P(box(0.06, 0.006, 0.006), C.bridge, [0, 0.48, -0.47]));
  parts.push(P(box(0.1, 0.12, 0.07), C.funnel, [0, 0.33, -0.55]));                                       // funnel
  parts.push(P(box(0.102, 0.025, 0.072), C.funnelTop, [0, 0.4, -0.55]));
  // hatch coamings between bays
  for (let b = 0; b < 8; b++) parts.push(P(box(0.29, 0.012, 0.004), C.deck, [0, 0.13, -0.33 + b * 0.105]));
  return merge(parts);
}
export function containerShipCargo(C, seed = 7) {
  const r = rng(seed), cols = [C.box1, C.box2, C.box3, C.box4, C.box5, C.box6 || C.box1];
  const parts = [];
  for (let bay = 0; bay < 8; bay++) {
    const tiers = 2 + Math.floor(r() * 3);
    for (let row = 0; row < 4; row++) for (let t = 0; t < tiers - (row === 0 || row === 3 ? 1 : 0); t++)
      parts.push(PU(box(0.064, 0.058, 0.098), cols[Math.floor(r() * cols.length)], [-0.099 + row * 0.066, 0.158 + t * 0.06, -0.33 + bay * 0.105 + 0.052]));
  }
  return merge(parts);
}

// ------------------------------------------------------------------ truck (tractor + container chassis; container separate)
export function truckTractor(C) {
  const parts = [];
  const s = new Shape();                                           // side profile (z forward, y up)
  s.moveTo(0.16, 0.06); s.lineTo(0.315, 0.06); s.lineTo(0.315, 0.15); s.lineTo(0.295, 0.245); s.quadraticCurveTo(0.29, 0.262, 0.27, 0.262);
  s.lineTo(0.175, 0.262); s.lineTo(0.16, 0.25); s.closePath();
  const cab = new ExtrudeGeometry(s, { depth: 0.15, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 1 });
  cab.rotateY(-Math.PI / 2); cab.translate(0.075, 0, 0);
  parts.push(P(cab, C.cabBody));
  const ws = box(0.142, 0.075, 0.004); ws.rotateX(-0.2); parts.push(P(ws, C.window, [0, 0.21, 0.302]));   // windshield
  parts.push(P(box(0.003, 0.05, 0.06), C.window, [0.077, 0.215, 0.24]), P(box(0.003, 0.05, 0.06), C.window, [-0.077, 0.215, 0.24]));
  parts.push(P(box(0.11, 0.06, 0.004), C.grille, [0, 0.1, 0.318]));                                     // grille
  parts.push(P(box(0.158, 0.022, 0.012), C.chrome, [0, 0.065, 0.322]));                                 // bumper
  parts.push(P(box(0.158, 0.012, 0.1), C.cabStripe, [0, 0.15, 0.24]));                                  // livery stripe
  parts.push(P(box(0.02, 0.06, 0.02), C.cabBody, [0.06, 0.29, 0.18]), P(box(0.02, 0.06, 0.02), C.cabBody, [-0.06, 0.29, 0.18])); // exhaust stacks
  parts.push(P(cyl(0.022, 0.022, 0.07, 10), C.chrome, [0.085, 0.07, 0.12], [0, 0, Math.PI / 2]));       // fuel tank
  parts.push(P(box(0.1, 0.02, 0.62), C.chassis, [0, 0.04, -0.01]));                                       // chassis rails
  parts.push(P(box(0.12, 0.012, 0.06), C.chassis, [0, 0.06, 0.1]));                                       // fifth wheel
  for (const [x, z] of [[-0.07, 0.25], [0.07, 0.25], [-0.07, 0.11], [0.07, 0.11], [-0.07, 0.06], [0.07, 0.06],
    [-0.07, -0.17], [0.07, -0.17], [-0.07, -0.23], [0.07, -0.23]]) {
    parts.push(P(wheel(0.034, 0.028), C.tyre, [x, 0.034, z]), P(wheel(0.018, 0.03), C.chrome, [x, 0.034, z]));
  }
  return merge(parts);
}
export function truckContainer(C, color) {
  return merge([PU(box(0.15, 0.15, 0.42), color || C.box1, [0, 0.135, -0.07])]);
}

// ------------------------------------------------------------------ instanced helper
function useInstances(ref, items, place) {
  useEffect(() => {
    if (!ref.current) return;
    const o = new Object3D();
    items.forEach((it, i) => { place(o, it, i); o.updateMatrix(); ref.current.setMatrixAt(i, o.matrix); });
    ref.current.instanceMatrix.needsUpdate = true;
    if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true;
  }, [items]); // eslint-disable-line
}

// ------------------------------------------------------------------ PLANT: modern electronics campus (~4 x 3)
export function PlantCampus({ C, seed = 11, detail = 1 }) {
  const night = C.night;
  const T = useMemo(() => ({
    glass: curtainWallTexture(C.glass, C.mullion, C.windowLit, night, seed),
    glassTall: curtainWallTexture(C.glassDark, C.mullion, C.windowLit, night, seed + 3),
    doors: rollerDoorTexture(C.wallLight, C.door),
    park: parkingTexture(C.asphalt, C.laneMark),
    solar: solarTexture(C.solar, C.mullion),
    corr: corrugatedTexture(),
  }), [C, seed, night]);
  for (const t of [T.glass, T.glassTall]) t.repeat.set(3, 1);
  T.park.repeat.set(2, 1); T.solar.repeat.set(6, 3);
  const steam = useRef([]);
  useFrame(({ clock }) => steam.current.forEach((m, i) => {
    if (!m) return; const t = (clock.elapsedTime * 0.25 + i * 0.5) % 1;
    m.position.y = 0.95 + t * 1.1; m.scale.setScalar(0.18 + t * 0.4); m.material.opacity = 0.45 * (1 - t);
  }));
  const cars = useRef(), trees = useRef(), lamps = useRef(), dockTrucks = useRef(), dockBoxes = useRef();
  const carList = useMemo(() => { const r = rng(seed + 9), out = []; for (let i = 0; i < 26; i++) out.push([-1.75 + (i % 13) * 0.125, i < 13 ? 0.82 : 1.18, Math.floor(r() * 6)]); return out; }, [seed]);
  const treeList = useMemo(() => { const r = rng(seed + 4), out = []; for (let i = 0; i < 36; i++) { const side = i % 4; const t = r(); out.push(side === 0 ? [-1.95 + t * 3.9, -1.42] : side === 1 ? [-1.95 + t * 3.9, 1.45] : side === 2 ? [-1.95, -1.3 + t * 2.6] : [1.95, -1.3 + t * 2.6]); } return out; }, [seed]);
  const lampList = useMemo(() => [[-1.9, 0.62], [-1.1, 0.62], [-0.3, 0.62], [0.5, 0.62], [1.3, 0.62]], []);
  const carCols = useMemo(() => [C.box5, C.box1, C.box3, C.mullion, C.wallLight, C.box4].map(c => new Color(c)), [C]);
  useInstances(cars, carList, (o, [x, z, c], i) => { o.position.set(x, 0.035, z); o.rotation.set(0, 0, 0); o.scale.set(1, 1, 1); cars.current.setColorAt(i, carCols[c]); });
  useInstances(trees, treeList, (o, [x, z], i) => { o.position.set(x, 0.12, z); o.scale.setScalar(0.8 + (i % 3) * 0.2); });
  useInstances(lamps, lampList, (o, [x, z]) => { o.position.set(x, 0.26, z); });
  const docks = useMemo(() => [0, 1, 2].map(i => [1.55, -0.62 + i * 0.32]), []);
  useInstances(dockTrucks, docks, (o, [x, z]) => { o.position.set(x + 0.25, 0, z); o.rotation.set(0, Math.PI / 2, 0); o.scale.setScalar(0.9); });
  useInstances(dockBoxes, docks, (o, [x, z]) => { o.position.set(x + 0.25, 0, z); o.rotation.set(0, Math.PI / 2, 0); o.scale.setScalar(0.9); });
  const tractor = useMemo(() => truckTractor(C), [C]);
  const cont = useMemo(() => truckContainer(C, C.box5), [C]);
  const lampGlow = useMemo(() => new Color(C.lamp).multiplyScalar(night ? 4 : 1.1), [C, night]);
  const tip = useMemo(() => new Color(C.late).multiplyScalar(night ? 3 : 1.2), [C, night]);
  const cooling = useMemo(() => new LatheGeometry([0.24, 0.2, 0.15, 0.13, 0.135, 0.15].map((r, i) => new Vector2(r, i * 0.17)), 24), []);
  return (
    <group>
      {/* site base, internal roads, car park */}
      <mesh position={[0, 0.006, 0]} receiveShadow><boxGeometry args={[4.1, 0.012, 3.0]} /><meshStandardMaterial color={C.concrete} roughness={0.95} /></mesh>
      <mesh position={[-1.0, 0.014, 1.0]} receiveShadow><boxGeometry args={[1.75, 0.004, 0.62]} /><meshStandardMaterial map={T.park} roughness={0.9} /></mesh>
      <mesh position={[0, 0.013, 0.6]} receiveShadow><boxGeometry args={[4.0, 0.004, 0.16]} /><meshStandardMaterial color={C.asphalt} /></mesh>
      <mesh position={[1.45, 0.013, 0]} receiveShadow><boxGeometry args={[0.16, 0.004, 2.8]} /><meshStandardMaterial color={C.asphalt} /></mesh>
      {/* main fab: glass curtain wall + white roof + solar + HVAC */}
      <mesh position={[-0.35, 0.25, -0.45]} castShadow receiveShadow><boxGeometry args={[2.3, 0.5, 1.1]} />
        <meshStandardMaterial map={T.glass} emissiveMap={night ? T.glass : null} emissive={C.windowLit} emissiveIntensity={night ? 0.55 : 0} roughness={0.25} metalness={0.4} /></mesh>
      <mesh position={[-0.35, 0.505, -0.45]} castShadow><boxGeometry args={[2.34, 0.02, 1.14]} /><meshStandardMaterial color={C.roofWhite} roughness={0.6} /></mesh>
      {detail > 0 && [0, 1, 2, 3].map(i => (
        <mesh key={i} position={[-1.1 + i * 0.42, 0.53, -0.62]} rotation={[-0.35, 0, 0]} castShadow><boxGeometry args={[0.38, 0.01, 0.34]} />
          <meshStandardMaterial map={T.solar} roughness={0.25} metalness={0.6} /></mesh>))}
      {detail > 0 && [[-1.2, -0.15], [-0.75, -0.18], [-0.3, -0.15], [0.15, -0.18]].map(([x, z], i) => (
        <mesh key={i} position={[x, 0.55, z]} castShadow><boxGeometry args={[0.16, 0.07, 0.14]} /><meshStandardMaterial color={C.hvac} metalness={0.5} roughness={0.4} /></mesh>))}
      {/* office tower with sign */}
      <mesh position={[0.95, 0.55, -0.85]} castShadow><boxGeometry args={[0.55, 1.1, 0.45]} />
        <meshStandardMaterial map={T.glassTall} emissiveMap={night ? T.glassTall : null} emissive={C.windowLit} emissiveIntensity={night ? 0.7 : 0} roughness={0.15} metalness={0.5} /></mesh>
      <mesh position={[0.95, 1.12, -0.85]}><boxGeometry args={[0.57, 0.03, 0.47]} /><meshStandardMaterial color={C.roofWhite} /></mesh>
      <mesh position={[0.95, 0.98, -0.62]}><boxGeometry args={[0.36, 0.08, 0.01]} /><meshBasicMaterial color={new Color(C.sign).multiplyScalar(night ? 2.2 : 1)} toneMapped={false} /></mesh>
      {/* warehouse with roller doors + trucks at the docks */}
      <mesh position={[1.25, 0.2, -0.3]} castShadow receiveShadow><boxGeometry args={[0.55, 0.4, 1.1]} /><meshStandardMaterial map={T.doors} roughness={0.7} /></mesh>
      <mesh position={[1.25, 0.41, -0.3]}><boxGeometry args={[0.58, 0.02, 1.13]} /><meshStandardMaterial color={C.roof} /></mesh>
      <instancedMesh ref={dockTrucks} args={[tractor, null, docks.length]} castShadow><meshStandardMaterial vertexColors roughness={0.45} metalness={0.25} /></instancedMesh>
      <instancedMesh ref={dockBoxes} args={[cont, null, docks.length]} castShadow><meshStandardMaterial vertexColors map={T.corr} roughness={0.6} metalness={0.2} /></instancedMesh>
      {/* utilities: cooling towers with steam, chimneys, tanks */}
      {[[-1.65, 0.25], [-1.25, 0.3]].map(([x, z], i) => (
        <group key={i} position={[x, 0, z]}>
          <mesh geometry={cooling} castShadow><meshStandardMaterial color={C.tank} roughness={0.8} side={2} /></mesh>
          <mesh ref={el => (steam.current[i] = el)} position={[0, 0.95, 0]}><sphereGeometry args={[1, 12, 12]} /><meshStandardMaterial color={C.steam} transparent depthWrite={false} /></mesh>
        </group>))}
      {[[0.3, 0.2], [0.55, 0.2]].map(([x, z], i) => (
        <group key={i} position={[x, 0, z]}>
          <mesh position={[0, 0.6, 0]} castShadow><cylinderGeometry args={[0.04, 0.065, 1.2, 14]} /><meshStandardMaterial color={C.stack} /></mesh>
          {[0.85, 1.05].map(y => <mesh key={y} position={[0, y, 0]}><cylinderGeometry args={[0.047, 0.05, 0.07, 14]} /><meshStandardMaterial color={C.stackBand} /></mesh>)}
          <mesh position={[0, 1.21, 0]}><cylinderGeometry args={[0.042, 0.042, 0.03, 14]} /><meshBasicMaterial color={tip} toneMapped={false} /></mesh>
        </group>))}
      {[[0.95, 0.25], [1.15, 0.25]].map(([x, z], i) => (
        <group key={i} position={[x, 0, z]}>
          <mesh position={[0, 0.16, 0]} castShadow><cylinderGeometry args={[0.09, 0.09, 0.32, 18]} /><meshStandardMaterial color={C.tank} metalness={0.6} roughness={0.3} /></mesh>
          <mesh position={[0, 0.32, 0]}><sphereGeometry args={[0.09, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2]} /><meshStandardMaterial color={C.tank} metalness={0.6} roughness={0.3} /></mesh>
        </group>))}
      {/* cars, trees, street lamps, fence */}
      <instancedMesh ref={cars} args={[null, null, carList.length]} castShadow><boxGeometry args={[0.06, 0.04, 0.11]} /><meshStandardMaterial roughness={0.35} metalness={0.5} /></instancedMesh>
      <instancedMesh ref={trees} args={[null, null, treeList.length]} castShadow><icosahedronGeometry args={[0.09, 0]} /><meshStandardMaterial color={C.tree1} flatShading roughness={0.9} /></instancedMesh>
      <instancedMesh ref={lamps} args={[null, null, lampList.length]}><sphereGeometry args={[0.025, 8, 8]} /><meshBasicMaterial color={lampGlow} toneMapped={false} /></instancedMesh>
      {[[0, -1.5, 4.1, 0.004], [0, 1.5, 4.1, 0.004], [-2.05, 0, 0.004, 3.0], [2.05, 0, 0.004, 3.0]].map(([x, z, w, d], i) => (
        <mesh key={i} position={[x, 0.05, z]}><boxGeometry args={[w, 0.09, d]} /><meshStandardMaterial color={C.fence} transparent opacity={0.7} /></mesh>))}
    </group>
  );
}

// ------------------------------------------------------------------ PORT: container terminal (~6.5 x 3.5, quay edge at +z)
function stsCrane(C) {
  const parts = [], c = C.crane, w = C.craneWhite;
  for (const x of [-0.22, 0.22]) {                                     // two side frames, each with land + sea leg
    parts.push(P(box(0.05, 1.05, 0.05), c, [x, 0.525, -0.25]), P(box(0.05, 1.05, 0.05), c, [x, 0.525, 0.25]));
    parts.push(P(box(0.04, 0.04, 0.55), c, [x, 0.5, 0]), P(box(0.05, 0.05, 0.55), c, [x, 1.05, 0]));
    const brace = box(0.025, 0.7, 0.025); brace.rotateX(0.62); parts.push(P(brace, c, [x, 0.75, 0]));
    parts.push(P(box(0.07, 0.03, 0.14), C.chassis, [x, 0.015, -0.25]), P(box(0.07, 0.03, 0.14), C.chassis, [x, 0.015, 0.25]));  // bogies
  }
  parts.push(P(box(0.5, 0.05, 0.05), c, [0, 1.05, -0.25]), P(box(0.5, 0.05, 0.05), c, [0, 1.05, 0.25]));
  parts.push(P(box(0.12, 0.06, 2.6), c, [0, 1.12, 0.55]));              // boom: backreach + outreach over the water
  parts.push(P(box(0.04, 0.5, 0.04), c, [0, 1.38, -0.15]));             // apex
  const stay1 = box(0.015, 0.012, 1.1); stay1.rotateX(0.42); parts.push(P(stay1, w, [0, 1.38, 0.35]));
  const stay2 = box(0.015, 0.012, 0.8); stay2.rotateX(-0.55); parts.push(P(stay2, w, [0, 1.38, -0.45]));
  parts.push(P(box(0.24, 0.12, 0.3), w, [0, 1.21, -0.35]));             // machinery house
  parts.push(P(box(0.1, 0.05, 0.08), w, [0, 1.06, 0.9]));               // trolley + cab
  parts.push(P(box(0.006, 0.42, 0.006), C.chassis, [0.03, 0.83, 0.9]), P(box(0.006, 0.42, 0.006), C.chassis, [-0.03, 0.83, 0.9]));
  parts.push(P(box(0.08, 0.02, 0.14), C.box2, [0, 0.61, 0.9]));         // spreader
  return merge(parts);
}
function rtgCrane(C) {
  const parts = [], c = C.rtg;
  for (const [x, z] of [[-0.42, -0.12], [0.42, -0.12], [-0.42, 0.12], [0.42, 0.12]]) parts.push(P(box(0.035, 0.42, 0.035), c, [x, 0.21, z]));
  parts.push(P(box(0.9, 0.04, 0.04), c, [0, 0.43, -0.12]), P(box(0.9, 0.04, 0.04), c, [0, 0.43, 0.12]));
  parts.push(P(box(0.12, 0.06, 0.28), C.craneWhite, [0.1, 0.46, 0]));
  return merge(parts);
}
export function PortTerminal({ C, shipHull, shipCargo, detail = 1 }) {
  const night = C.night;
  const T = useMemo(() => ({ apron: apronTexture(C.concrete, C.apronMark), corr: corrugatedTexture(), doors: rollerDoorTexture(C.wallLight, C.door) }), [C]);
  T.apron.repeat.set(3, 2);
  const sts = useMemo(() => stsCrane(C), [C]), rtg = useMemo(() => rtgCrane(C), [C]);
  const stacks = useRef(), rtgs = useRef(), lamps = useRef();
  const stackList = useMemo(() => {
    const r = rng(5), out = [];
    for (let blk = 0; blk < 4; blk++) for (let row = 0; row < 3; row++) for (let i = 0; i < 9; i++) {
      const h = 1 + Math.floor(r() * 4);
      for (let k = 0; k < h; k++) out.push([-2.7 + blk * 1.25 + i * 0.12, -1.2 + row * 0.22, k, Math.floor(r() * 6)]);
    }
    for (let i = 0; i < 18; i++) out.push([-2.2 + i * 0.26, 0.55 + (i % 2) * 0.16, 0, Math.floor(r() * 6)]);   // boxes staged on the apron
    return out;
  }, []);
  const cols = useMemo(() => [C.box1, C.box2, C.box3, C.box4, C.box5, C.box6 || C.box1].map(c => new Color(c)), [C]);
  useInstances(stacks, stackList, (o, [x, z, k, c], i) => { o.position.set(x, 0.05 + k * 0.08, z); o.rotation.set(0, Math.PI / 2, 0); stacks.current.setColorAt(i, cols[c]); });
  const rtgList = useMemo(() => [[-2.2, -0.98], [-0.95, -0.98], [0.3, -0.98], [1.55, -0.98]], []);
  useInstances(rtgs, rtgList, (o, [x, z]) => { o.position.set(x, 0.02, z); o.rotation.set(0, Math.PI / 2, 0); });
  const lampList = useMemo(() => [[-3.0, 0.2], [-1.0, 0.2], [1.0, 0.2], [3.0, 0.2], [-3.0, -1.6], [3.0, -1.6]], []);
  useInstances(lamps, lampList, (o, [x, z]) => { o.position.set(x, 0.85, z); });
  const glow = useMemo(() => new Color(C.lamp).multiplyScalar(night ? 4 : 1.1), [C, night]);
  return (
    <group>
      <mesh position={[0, -0.03, 0]} receiveShadow castShadow><boxGeometry args={[6.6, 0.1, 3.6]} /><meshStandardMaterial map={T.apron} roughness={0.9} /></mesh>
      <mesh position={[0, 0.025, 1.78]}><boxGeometry args={[6.6, 0.02, 0.05]} /><meshStandardMaterial color={C.quayEdge} /></mesh>
      {[-2.6, -1.3, 0, 1.3, 2.6].map(x => <mesh key={x} position={[x, 0.05, 1.79]}><cylinderGeometry args={[0.025, 0.03, 0.06, 8]} /><meshStandardMaterial color={C.chassis} /></mesh>)}
      {/* container yard */}
      <instancedMesh ref={stacks} args={[null, null, stackList.length]} castShadow receiveShadow><boxGeometry args={[0.2, 0.075, 0.1]} />
        <meshStandardMaterial map={T.corr} roughness={0.6} metalness={0.25} /></instancedMesh>
      <instancedMesh ref={rtgs} args={[rtg, null, rtgList.length]} castShadow><meshStandardMaterial vertexColors roughness={0.5} metalness={0.3} /></instancedMesh>
      {/* ship-to-shore cranes along the quay */}
      {[-2.2, -0.9, 0.4, 1.7].map(x => <mesh key={x} geometry={sts} position={[x, 0.02, 1.35]} castShadow><meshStandardMaterial vertexColors roughness={0.45} metalness={0.35} /></mesh>)}
      {/* sheds */}
      {detail > 0 && [[2.75, -0.9], [2.75, 0.2]].map(([x, z], i) => (
        <group key={i}><mesh position={[x, 0.17, z]} castShadow><boxGeometry args={[0.9, 0.34, 0.8]} /><meshStandardMaterial map={T.doors} roughness={0.7} /></mesh>
          <mesh position={[x, 0.355, z]}><boxGeometry args={[0.94, 0.03, 0.84]} /><meshStandardMaterial color={C.roof} /></mesh></group>))}
      {/* flood-light towers */}
      {lampList.map(([x, z], i) => <mesh key={i} position={[x, 0.42, z]}><cylinderGeometry args={[0.012, 0.018, 0.84, 6]} /><meshStandardMaterial color={C.pole} /></mesh>)}
      <instancedMesh ref={lamps} args={[null, null, lampList.length]}><boxGeometry args={[0.1, 0.03, 0.05]} /><meshBasicMaterial color={glow} toneMapped={false} /></instancedMesh>
      {/* berthed container ship */}
      {shipHull && <group position={[0.2, 0.0, 2.2]} rotation-y={Math.PI / 2} scale={2.4}>
        <mesh geometry={shipHull} castShadow><meshStandardMaterial vertexColors roughness={0.5} metalness={0.2} /></mesh>
        <mesh geometry={shipCargo} castShadow><meshStandardMaterial vertexColors map={T.corr} roughness={0.6} metalness={0.2} /></mesh>
      </group>}
    </group>
  );
}
