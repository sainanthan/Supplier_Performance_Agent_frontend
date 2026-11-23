import { forwardRef, Suspense, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useLoader, useThree } from "@react-three/fiber";
import { Environment, Line, OrbitControls, Stars } from "@react-three/drei";
import { Bloom, EffectComposer, SMAA, ToneMapping, Vignette } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import { Card, foamTexture, Ocean, scenePalette } from "./Network360Scene";
import { containerShipCargo, containerShipHull, corrugatedTexture, PlantCampus, PortTerminal, truckContainer, truckTractor } from "./models3d";
import { CanvasTexture, Color, ExtrudeGeometry, TextureLoader, MOUSE, Object3D, Shape, Spherical, SpriteMaterial, SRGBColorSpace, Vector3 } from "three";
import { feature } from "topojson-client";
import countries50m from "world-atlas/countries-50m.json";
import { Label } from "./Constellation3D";
import { token } from "../util";

/* 3D digital map of the inbound supply network (fully offline: Natural Earth outlines via world-atlas).
   Vehicles are map-style ICON BADGES (ship on sea legs, truck on road legs) coloured by status, always facing the
   camera at a constant screen size. Camera: drag = rotate, right-drag = pan, scroll = zoom, plus an API used by the
   on-map control pad (rotate / tilt / zoom / top / 3D / side / follow). */

// ------------------------------------------------------------------ projection
const LON0 = 104, LAT0 = 18, K = 0.26;
const px = lon => (lon - LON0) * K * 0.96;
const pz = lat => -(lat - LAT0) * K;
const LAND_H = 0.14, SEA_H = 0.035;
const BBOX = { lon: [52, 150], lat: [-12, 48] };

function useCountries() {
  return useMemo(() => {
    const geo = feature(countries50m, countries50m.objects.countries);
    const out = [];
    for (const f of geo.features) {
      const polys = f.geometry?.type === "Polygon" ? [f.geometry.coordinates] : f.geometry?.type === "MultiPolygon" ? f.geometry.coordinates : [];
      const shapes = [], outlines = [];
      for (const poly of polys) {
        const outer = poly[0];
        const lons = outer.map(p => p[0]), lats = outer.map(p => p[1]);
        const [mnLo, mxLo, mnLa, mxLa] = [Math.min(...lons), Math.max(...lons), Math.min(...lats), Math.max(...lats)];
        if (mxLo < BBOX.lon[0] || mnLo > BBOX.lon[1] || mxLa < BBOX.lat[0] || mnLa > BBOX.lat[1]) continue;
        if (mnLo < 20 || mxLo > 179) continue;
        const step = outer.length > 400 ? 2 : 1;
        const pts = outer.filter((_, i) => i % step === 0);
        const shape = new Shape(pts.map(([lo, la]) => ({ x: px(lo), y: -pz(la) })));
        poly.slice(1).forEach(h => shape.holes.push(new Shape(h.map(([lo, la]) => ({ x: px(lo), y: -pz(la) })))));
        shapes.push(shape);
        outlines.push(pts.map(([lo, la]) => [px(lo), LAND_H + 0.002, pz(la)]));
      }
      if (!shapes.length) continue;
      const geom = new ExtrudeGeometry(shapes, { depth: LAND_H, bevelEnabled: false });
      geom.rotateX(-Math.PI / 2);
      out.push({ id: f.id, name: f.properties?.name, geom, outlines });
    }
    return out;
  }, []);
}

function laneTrack(lane) {
  const p = lane.path;
  const chn = lane.sea_end ?? p.findIndex(q => Math.abs(q[0] - 13.10) < 1e-3 && Math.abs(q[1] - 80.30) < 1e-3);
  const pts = p.map(([la, lo], i) => {
    const sea = lane.mode === "SEA" && i >= 1 && i <= chn && chn > 0;
    return { v: new Vector3(px(lo), sea ? SEA_H : LAND_H + 0.01, pz(la)), sea };
  });
  const segSea = pts.slice(0, -1).map((a, i) => lane.mode === "SEA" && i >= 1 && i < chn);
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + pts[i].v.distanceTo(pts[i - 1].v));
  return { pts, segSea, cum, total: cum[cum.length - 1] || 1, chn };
}

export function sampleTrack(tr, p, out) {
  const target = Math.max(0, Math.min(1, p)) * tr.total;
  let i = 1;
  while (i < tr.cum.length - 1 && tr.cum[i] < target) i++;
  const a = tr.pts[i - 1].v, b = tr.pts[i].v;
  const k = (target - tr.cum[i - 1]) / ((tr.cum[i] - tr.cum[i - 1]) || 1);
  out.pos.lerpVectors(a, b, k);
  out.sea = tr.segSea[i - 1];
  out.seg = i - 1;
  return out;
}

// ------------------------------------------------------------------ vehicle icon textures (drawn once per style)
function drawGlyph(g, kind, ink) {
  g.fillStyle = ink; g.strokeStyle = ink; g.lineWidth = 5; g.lineJoin = "round"; g.lineCap = "round";
  if (kind === "ship") {
    g.beginPath(); g.moveTo(-30, 2); g.lineTo(30, 2); g.lineTo(20, 20); g.lineTo(-20, 20); g.closePath(); g.fill();      // hull
    g.fillRect(-14, -12, 11, 12); g.fillRect(-1, -12, 11, 12); g.fillRect(12, -12, 11, 12);                                // containers
    g.fillRect(-26, -24, 9, 24);                                                                                          // bridge
    g.beginPath(); g.moveTo(-30, 30); g.quadraticCurveTo(-15, 24, 0, 30); g.quadraticCurveTo(15, 36, 30, 30); g.stroke(); // wave
  } else {
    g.fillRect(-32, -18, 36, 28);                                                                                          // cargo box
    g.beginPath(); g.moveTo(7, -8); g.lineTo(22, -8); g.lineTo(30, 3); g.lineTo(30, 10); g.lineTo(7, 10); g.closePath(); g.fill(); // cab
    g.beginPath(); g.arc(-20, 16, 7, 0, Math.PI * 2); g.arc(18, 16, 7, 0, Math.PI * 2); g.fill();                         // wheels
  }
}

function iconTexture(kind, fill, ink, ring, selected, count = 0) {
  const S = 128, c = document.createElement("canvas"); c.width = c.height = S;
  const g = c.getContext("2d");
  g.translate(S / 2, S / 2);
  if (selected) { g.beginPath(); g.arc(0, 0, 60, 0, Math.PI * 2); g.fillStyle = ring; g.globalAlpha = 0.35; g.fill(); g.globalAlpha = 1; }
  g.shadowColor = "rgba(0,0,0,.35)"; g.shadowBlur = 8; g.shadowOffsetY = 3;
  g.beginPath(); g.arc(0, 0, 46, 0, Math.PI * 2); g.fillStyle = fill; g.fill();
  g.shadowColor = "transparent";
  g.lineWidth = 6; g.strokeStyle = selected ? ring : ink; g.stroke();
  drawGlyph(g, kind, ink);
  if (count > 1) {                                   // number of PO-line shipments aboard
    const txt = count > 99 ? "99+" : String(count);
    g.beginPath(); g.arc(38, -38, 24, 0, Math.PI * 2); g.fillStyle = ring; g.fill(); g.lineWidth = 4; g.strokeStyle = ink; g.stroke();
    g.fillStyle = ink; g.font = `800 ${txt.length > 2 ? 20 : 26}px Inter, system-ui, sans-serif`; g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText(txt, 38, -36);
  }
  const t = new CanvasTexture(c); t.colorSpace = SRGBColorSpace; t.anisotropy = 4;
  return t;
}

// ------------------------------------------------------------------ static scenery
// Shape coords are (x, y) = ((lon - 104)·K·0.96, (lat - 18)·K); the equirectangular textures want
// u = (lon + 180) / 360, v = (lat + 90) / 180, so a repeat/offset maps them exactly onto every country.
function useEarthTextures() {
  const [day, lights, normal] = useLoader(TextureLoader, ["/env/earth_atmos_2048.jpg", "/env/earth_lights_2048.png", "/env/earth_normal_2048.jpg"]);
  return useMemo(() => {
    for (const t of [day, lights, normal]) {
      t.repeat.set(1 / (K * 0.96 * 360), 1 / (K * 180)); t.offset.set(284 / 360, 108 / 180); t.anisotropy = 8;
    }
    day.colorSpace = SRGBColorSpace; lights.colorSpace = SRGBColorSpace;
    return { day, lights, normal };
  }, [day, lights, normal]);
}
function EarthCountries({ cs, C }) {
  const tex = useEarthTextures();
  const base = useMemo(() => new Color(C.ink).multiplyScalar(C.night ? 0.42 : 1.05), [C]);
  const india = useMemo(() => base.clone().lerp(new Color(C.sel), C.night ? 0.12 : 0.08), [base, C]);
  return cs.map(c => (
    <mesh key={c.id + c.name} geometry={c.geom} castShadow receiveShadow>
      <meshStandardMaterial map={tex.day} normalMap={tex.normal} normalScale={[0.8, 0.8]} color={c.name === "India" ? india : base}
        emissiveMap={tex.lights} emissive={C.windowLit} emissiveIntensity={C.night ? 2.2 : 0} roughness={0.85} metalness={0} />
    </mesh>
  ));
}
function Land({ C, showBorders }) {
  const cs = useCountries();
  return (
    <group>
      <Suspense fallback={null}><Ocean C={C} /></Suspense>
      <Suspense fallback={cs.map(c => <mesh key={c.id + c.name} geometry={c.geom}><meshStandardMaterial color={C.land} /></mesh>)}>
        <EarthCountries cs={cs} C={C} />
      </Suspense>
      {showBorders && cs.flatMap(c => c.outlines.map((o, i) => (
        <Line key={`${c.id}${c.name}${i}`} points={o} color={c.name === "India" ? C.indiaEdge : C.edge} lineWidth={c.name === "India" ? 1.4 : 0.6} transparent opacity={0.8} />
      )))}
    </group>
  );
}

const FlowLine = p => (p.points?.length > 1 ? <FlowLineInner {...p} /> : null);   // a lane leg can be a single point
function FlowLineInner({ points, color, sea, hot, dim }) {
  const ref = useRef();
  useFrame((_, dt) => { if (ref.current?.material) ref.current.material.dashOffset -= dt * (sea ? 0.6 : 0.9); });
  return <Line ref={ref} points={points} color={color} lineWidth={hot ? 3 : sea ? 1.6 : 2.2} dashed dashSize={sea ? 0.25 : 0.12} gapSize={sea ? 0.15 : 0.06}
    transparent opacity={dim ? 0.18 : hot ? 1 : 0.8} />;
}

function SupplierPin({ n, C, hot, dim, onClick, showLabel, plants, health, v2, alerting, reg }) {
  const ring = useRef();
  useFrame(({ clock }) => {
    if (!ring.current) return;
    if (v2 && !alerting) { ring.current.visible = false; return; }
    ring.current.visible = true;
    const t = (clock.elapsedTime * 0.8 + n.lat) % 1;
    ring.current.scale.setScalar(0.6 + t * 1.6);
    ring.current.material.opacity = (dim ? 0.15 : 0.6) * (1 - t);
  });
  const col = hot ? C.late : C.sup;
  const hcol = { HEALTHY: C.ok, WATCH: C.dis, RISK: C.late }[health];
  const hglow = useMemo(() => (hcol ? new Color(hcol).multiplyScalar(C.night ? 2.4 : 1.3) : null), [hcol, C.night]);
  const near = plants.map(p => ({ p, d: Math.hypot(px(p.lon) - px(n.lon), pz(p.lat) - pz(n.lat)) })).filter(x => x.d < 1.4).sort((a, b) => a.d - b.d)[0];
  const off = near ? (() => { const dx = px(n.lon) - px(near.p.lon), dz = pz(n.lat) - pz(near.p.lat), L = Math.hypot(dx, dz) || 1; return [(dx / L) * 0.55, 0.35, (dz / L) * 0.55 + 0.15]; })() : [0, 0.6, 0];
  return (
    <group position={[px(n.lon), LAND_H, pz(n.lat)]} onClick={e => { e.stopPropagation(); onClick?.(n); }}>
      <mesh position={[0, 0.2, 0]}><cylinderGeometry args={[0.016, 0.016, 0.4, 8]} /><meshStandardMaterial color={col} transparent opacity={dim ? 0.3 : 1} /></mesh>
      <mesh position={[0, 0.44, 0]}><sphereGeometry args={[0.08, 20, 20]} /><meshStandardMaterial color={col} emissive={col} emissiveIntensity={0.5} transparent opacity={dim ? 0.3 : 1} /></mesh>
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}><ringGeometry args={[0.12, 0.16, 32]} /><meshBasicMaterial color={hcol || col} transparent /></mesh>
      {hglow && <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]}><ringGeometry args={[0.2, 0.235, 48]} /><meshBasicMaterial color={hglow} toneMapped={false} transparent opacity={dim ? 0.25 : 1} /></mesh>}
      {showLabel && !dim && <Label text={n.id} color={C.label} position={off} fixed spriteRef={reg ? reg(`sup:${n.id}`, alerting ? 60 : health === "RISK" ? 50 : 40) : undefined} />}
    </group>
  );
}

function Plant({ n, C, label, onClick, v2, reg }) {
  const smoke = useRef([]);
  const lights = useRef();
  useFrame(({ clock }) => smoke.current.forEach((m, i) => {
    if (!m) return; const t = (clock.elapsedTime * 0.35 + i * 0.4) % 1;
    m.position.y = 0.62 + t * 0.5; m.position.x = -0.12 + t * 0.12; m.scale.setScalar(0.04 + t * 0.12); m.material.opacity = 0.35 * (1 - t);
  }));
  const city = useMemo(() => { const out = []; let s = n.lat * 1000; const r = () => (s = (s * 16807) % 2147483647) / 2147483647; for (let i = 0; i < 90; i++) { const a = r() * Math.PI * 2, d = 0.22 + r() * 0.5; out.push([Math.cos(a) * d, Math.sin(a) * d * 0.8, 0.012 + r() * 0.045]); } return out; }, [n.lat]);
  useEffect(() => {
    if (!lights.current) return;
    const o = new Object3D();
    city.forEach(([x, z, h], i) => { o.position.set(x, h / 2, z); o.scale.set(0.022, h, 0.022); o.updateMatrix(); lights.current.setMatrixAt(i, o.matrix); });
    lights.current.instanceMatrix.needsUpdate = true;
  }, [city]);
  const tip = useMemo(() => new Color(C.late).multiplyScalar(C.night ? 3 : 1.3), [C]);
  const glow = useMemo(() => new Color(C.plant).multiplyScalar(C.night ? 2.6 : 1.3), [C]);
  const isKA = n.id === "IN-KA-01";
  return (
    <group position={[px(n.lon), LAND_H, pz(n.lat)]} onClick={e => { e.stopPropagation(); onClick?.(n); }}
      onPointerOver={() => (document.body.style.cursor = "pointer")} onPointerOut={() => (document.body.style.cursor = "auto")}>
      {!v2 && <instancedMesh ref={lights} args={[null, null, city.length]}><boxGeometry />
        <meshStandardMaterial color={C.facade} emissive={C.windowLit} emissiveIntensity={C.night ? 0.55 : 0.03} roughness={0.7} /></instancedMesh>}
      <group scale={0.12}><PlantCampus C={C} seed={isKA ? 17 : 11} /></group>
      {!v2 && <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}><ringGeometry args={[0.36, 0.4, 56]} /><meshBasicMaterial color={glow} toneMapped={false} /></mesh>}
      {/* cards: Chennai above-right of its plant, Bengaluru below-left of its plant, so they never overlap on screen */}
      {label && <Card position={[0, 0.5, 0]} title={isKA ? "Bengaluru Plant" : "Chennai Plant"} sub={label.split(" · ").slice(1).join(" · ")}
        dot={C.plantPin} bg={C.card} ink={C.cardInk} muted={C.cardMuted} pin scale={0.03} center={isKA ? [1.05, 1.15] : [-0.05, -0.25]}
        spriteRef={reg ? reg(`plant:${n.id}`, 100) : undefined} />}
    </group>
  );
}

function Port({ n, C, onClick }) {
  return (
    <group position={[px(n.lon), LAND_H, pz(n.lat)]} scale={0.065} onClick={e => { e.stopPropagation(); onClick?.(n); }}
      onPointerOver={() => (document.body.style.cursor = "pointer")} onPointerOut={() => (document.body.style.cursor = "auto")}>
      <PortTerminal C={C} detail={0} />
    </group>
  );
}

// ------------------------------------------------------------------ vehicles: pooled icon sprites
const POOL = 360;
const MAXM = 260;
const OFFMAP_X = px(84.5);                 // east of the South-India view: vessels here are "beyond view"
function Vehicles({ data, tracks, simDayRef, C, selected, onSelect, onHover, followRef, layers, spotlight, onStats, theme, hiddenSup, view }) {
  const countMats = useMemo(() => new Map(), [theme]);   // count-badge sprite materials, created on demand
  const countMat = (kind, st, sel, dim, cnt) => {
    const key = `${kind}|${st}|${sel}|${dim}|${cnt}`;
    let m = countMats.get(key);
    if (!m) {
      const fill = st === "ok" ? C.ok : st === "late" ? C.late : C.dis;
      m = new SpriteMaterial({ map: iconTexture(kind, fill, C.ink, C.sel, sel, cnt), depthTest: false, sizeAttenuation: false, transparent: true, opacity: dim ? 0.22 : 1 });
      countMats.set(key, m);
    }
    return m;
  };
  const sprites = useRef([]);
  const shipM = useRef(), truckM = useRef(), wakeM = useRef(), cargoM = useRef(), boxM = useRef();
  const shipGeo = useMemo(() => containerShipHull(C), [C]), cargoGeo = useMemo(() => containerShipCargo(C), [C]);
  const truckGeo = useMemo(() => truckTractor(C), [C]), boxGeo = useMemo(() => truckContainer(C, C.box2), [C]);
  const corr = useMemo(() => corrugatedTexture(), []);
  const foam = useMemo(() => foamTexture(), []);
  const o3 = useMemo(() => new Object3D(), []);
  const tmp = useMemo(() => ({ pos: new Vector3(), sea: false, seg: 0 }), []);
  const mats = useMemo(() => {
    const m = {};
    for (const kind of ["ship", "truck"]) for (const [st, fill] of [["ok", C.ok], ["late", C.late], ["dis", C.dis]]) for (const sel of [false, true]) {
      const tex = iconTexture(kind, fill, C.ink, C.sel, sel);
      m[`${kind}|${st}|${sel}`] = new SpriteMaterial({ map: tex, depthTest: false, sizeAttenuation: false, transparent: true });
      m[`${kind}|${st}|${sel}|dim`] = new SpriteMaterial({ map: tex, depthTest: false, sizeAttenuation: false, transparent: true, opacity: 0.22 });
    }
    return m;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme]);
  const stats = useRef({ t: 0 });

  useFrame(({ clock }) => {
    const day = simDayRef.current;
    let n = 0, ships = 0, trucks = 0, late = 0, ns = 0, nt = 0, okc = 0, latec = 0, disc = 0, offV = 0, offS = 0, aboard = 0;
    const tt = clock.elapsedTime;
    const list = data.movements || data.shipments;     // v2: consolidated vehicles; v1: one icon per PO line
    for (const s of list) {
      if (day < s.t_depart || day >= s.t_eta || n >= POOL) continue;
      let cnt = 1, mLate = false, mDis = false;
      if (s.m) {                                        // members actually in transit right now
        cnt = 0;
        for (const x of s.m) if (day >= x[0] && day < x[1]) { cnt++; if (day > x[2]) mLate = true; if (x[3]) mDis = true; }
        if (!cnt) continue;
      }
      const tr = tracks[s.lane]; if (!tr) continue;
      const prog = (day - s.t_depart) / Math.max(0.01, s.t_eta - s.t_depart);
      sampleTrack(tr, prog, tmp);
      const kind = tmp.sea ? "ship" : "truck";
      if ((kind === "ship" && !layers.ships) || (kind === "truck" && !layers.trucks)) continue;
      const isLate = s.m ? mLate : day > s.t_promised;
      const st = (s.m ? mDis : s.disrupted) ? "dis" : isLate ? "late" : "ok";
      const isSel = s.id === selected;
      const dim = spotlight && s.supplier_id !== spotlight;
      kind === "ship" ? ships++ : trucks++;
      aboard += cnt;
      // Level of detail (T1): in the South-India view, vessels still in the Bay of Bengal / Malacca are summarised by the
      // "N vessels beyond this view" chip instead of a chain of icons (they stay in every count, they are just not drawn).
      let folded = false;
      if (kind === "ship" && tmp.pos.x > OFFMAP_X) { offV++; offS += cnt; folded = !!data.movements && view === "india" && s.id !== selected; }
      if (isLate) late++;
      if (st === "ok") okc++; else if (st === "late") latec++; else disc++;
      if (folded) continue;
      if (layers[st] === false) continue;                 // status chips filter vehicles
      if (hiddenSup && hiddenSup(s)) continue;               // supplier-health / material filters
      // 3D model, heading along the current route segment
      const a = tr.pts[tmp.seg].v, b = tr.pts[tmp.seg + 1].v, heading = Math.atan2(b.x - a.x, b.z - a.z);
      const k = (isSel ? 1.6 : 1) * (dim ? 0.8 : 1);
      if (kind === "ship" && ns < MAXM) {
        o3.position.set(tmp.pos.x, 0.015 + Math.sin(tt * 1.8 + s.t_po) * 0.006, tmp.pos.z); o3.rotation.set(Math.sin(tt * 1.3 + s.t_eta) * 0.04, heading, Math.sin(tt * 1.1 + s.t_po) * 0.035);
        o3.scale.setScalar(0.42 * k); o3.updateMatrix(); shipM.current.setMatrixAt(ns, o3.matrix); cargoM.current.setMatrixAt(ns, o3.matrix);
        o3.rotation.set(-Math.PI / 2, 0, -heading); o3.position.set(tmp.pos.x - Math.sin(heading) * 0.34 * k, 0.006, tmp.pos.z - Math.cos(heading) * 0.34 * k);
        o3.scale.set(0.14 * k, 0.42 * k, 1); o3.updateMatrix(); wakeM.current.setMatrixAt(ns, o3.matrix); ns++;
      } else if (kind === "truck" && nt < MAXM) {
        o3.position.set(tmp.pos.x, tmp.pos.y - 0.005, tmp.pos.z); o3.rotation.set(0, heading, 0); o3.scale.setScalar(0.5 * k); o3.updateMatrix(); truckM.current.setMatrixAt(nt, o3.matrix); boxM.current.setMatrixAt(nt++, o3.matrix);
      }
      const sp = sprites.current[n++];
      sp.visible = true;
      const bob = kind === "ship" ? Math.sin(clock.elapsedTime * 2 + s.t_po) * 0.01 : 0;
      sp.position.set(tmp.pos.x, tmp.pos.y + 0.34 + bob, tmp.pos.z);
      sp.material = s.m ? countMat(kind, st, isSel, !!dim, cnt) : mats[`${kind}|${st}|${isSel}${dim ? "|dim" : ""}`];
      const base = s.m ? 0.021 : 0.017;                      // small status pin above the 3D model (model stays visible)
      sp.scale.set(isSel ? base * 1.5 : base, isSel ? base * 1.5 : base, 1);
      sp.renderOrder = isSel ? 30 : dim ? 18 : 20;
      sp.userData = { id: s.id, kind, prog, seg: tmp.seg, count: cnt };
      if (isSel && followRef) followRef.current = tmp.pos.clone();
    }
    for (let i = n; i < POOL; i++) {            // park unused icons: hidden, out of view, not pickable
      const sp = sprites.current[i];
      if (sp && sp.visible) { sp.visible = false; sp.position.set(0, -100, 0); sp.userData = {}; }
    }
    if (shipM.current) { shipM.current.count = wakeM.current.count = cargoM.current.count = ns; truckM.current.count = boxM.current.count = nt; for (const m of [shipM, wakeM, truckM, cargoM, boxM]) m.current.instanceMatrix.needsUpdate = true; }
    if (onStats && clock.elapsedTime - stats.current.t > 0.4) { stats.current.t = clock.elapsedTime; onStats({ ships, trucks, late: latec, ok: okc, dis: disc, offmapVessels: offV, offmapShipments: offS, aboard, consolidated: !!data.movements }); }
  });

  return (
    <group>
      <instancedMesh ref={shipM} args={[shipGeo, null, MAXM]} castShadow><meshStandardMaterial vertexColors roughness={0.55} metalness={0.15} /></instancedMesh>
      <instancedMesh ref={wakeM} args={[null, null, MAXM]}><planeGeometry args={[1, 1]} /><meshBasicMaterial map={foam} transparent opacity={0.5} depthWrite={false} /></instancedMesh>
      <instancedMesh ref={cargoM} args={[cargoGeo, null, MAXM]} castShadow><meshStandardMaterial vertexColors map={corr} roughness={0.6} metalness={0.2} /></instancedMesh>
      <instancedMesh ref={truckM} args={[truckGeo, null, MAXM]} castShadow><meshStandardMaterial vertexColors roughness={0.45} metalness={0.3} /></instancedMesh>
      <instancedMesh ref={boxM} args={[boxGeo, null, MAXM]} castShadow><meshStandardMaterial vertexColors map={corr} roughness={0.6} metalness={0.2} /></instancedMesh>
      {Array.from({ length: POOL }).map((_, i) => (
        <sprite key={i} ref={el => (sprites.current[i] = el)} visible={false} position={[0, -100, 0]}
          onClick={e => { e.stopPropagation(); const u = e.object.userData; if (u?.id) onSelect?.(u.id); }}
          onPointerMove={e => { e.stopPropagation(); const u = e.object.userData; onHover?.(u?.id ? { ...u, x: e.nativeEvent.clientX, y: e.nativeEvent.clientY } : null); document.body.style.cursor = "pointer"; }}
          onPointerOut={() => { onHover?.(null); document.body.style.cursor = "auto"; }} />
      ))}
    </group>
  );
}

function DeliveryPulses({ data, simDayRef, C }) {
  if ((data.version || 1) >= 2) return null;   // T1: removed as visual noise (arrivals are listed in the events strip)
  return <DeliveryPulsesV1 data={data} simDayRef={simDayRef} C={C} />;
}
function DeliveryPulsesV1({ data, simDayRef, C }) {
  const meshes = useRef([]);
  const pulses = useRef([]);
  const last = useRef(null);
  const plantPos = useMemo(() => Object.fromEntries(data.nodes.filter(n => n.kind === "plant").map(n => [n.id, new Vector3(px(n.lon), LAND_H + 0.02, pz(n.lat))])), [data]);
  useFrame(({ clock }) => {
    const day = simDayRef.current, t = clock.elapsedTime, prev = last.current;
    if (prev !== null && day > prev && day - prev < 3) {
      for (const s of data.shipments) if (s.t_eta > prev && s.t_eta <= day && pulses.current.length < 16)
        pulses.current.push({ p: plantPos[s.plant_id], t0: t, late: s.t_eta > s.t_promised });
    }
    last.current = day;
    pulses.current = pulses.current.filter(q => t - q.t0 < 1.4);
    meshes.current.forEach((m, i) => {
      const q = pulses.current[i]; if (!m) return;
      if (!q) { m.visible = false; return; }
      const k = (t - q.t0) / 1.4;
      m.visible = true; m.position.copy(q.p); m.scale.setScalar(0.3 + k * 2.2);
      m.material.opacity = 0.8 * (1 - k); m.material.color.set(q.late ? C.late : C.ok);
    });
  });
  return Array.from({ length: 16 }).map((_, i) => (
    <mesh key={i} ref={el => (meshes.current[i] = el)} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
      <ringGeometry args={[0.18, 0.24, 40]} /><meshBasicMaterial transparent depthWrite={false} />
    </mesh>
  ));
}

// ------------------------------------------------------------------ camera rig + imperative control API
const CAMS = {
  asia: { pos: [0.6, 18.5, 14.5], target: [0.6, 0, -0.4] },
  india: { pos: [-5.0, 5.4, 7.6], target: [-6.3, 0, 1.5] },
  malacca: { pos: [-1.6, 5.8, 9.5], target: [-1.6, 0, 3.6] },
};
function CameraRig({ view, follow, followRef, controls, apiRef }) {
  const { camera } = useThree();
  const goal = useRef({ pos: new Vector3(...CAMS.asia.pos), target: new Vector3(...CAMS.asia.target), flying: true });
  const fly = (pos, target) => { goal.current = { pos: pos.clone(), target: target.clone(), flying: true }; };
  useEffect(() => { camera.position.set(14, 26, 30); }, [camera]);
  useEffect(() => { const c = CAMS[view] || CAMS.asia; fly(new Vector3(...c.pos), new Vector3(...c.target)); }, [view]);
  useEffect(() => {                           // any manual drag/zoom cancels the automatic camera
    const ctl = controls.current; if (!ctl) return;
    const stop = () => { goal.current.flying = false; };
    ctl.addEventListener("start", stop);
    return () => ctl.removeEventListener("start", stop);
  }, [controls]);
  useImperativeHandle(apiRef, () => {
    const orbit = fn => {
      const ctl = controls.current; if (!ctl) return;
      const target = ctl.target.clone();
      const sph = new Spherical().setFromVector3(camera.position.clone().sub(target));
      fn(sph);
      sph.phi = Math.max(0.05, Math.min(Math.PI / 2.1, sph.phi));
      sph.radius = Math.max(2, Math.min(34, sph.radius));
      fly(new Vector3().setFromSpherical(sph).add(target), target);
    };
    return {
      rotate: deg => orbit(s => { s.theta += (deg * Math.PI) / 180; }),
      tilt: deg => orbit(s => { s.phi += (deg * Math.PI) / 180; }),
      zoom: f => orbit(s => { s.radius *= f; }),
      top: () => orbit(s => { s.phi = 0.05; s.theta = 0; }),
      perspective: () => orbit(s => { s.phi = 0.85; }),
      side: () => orbit(s => { s.phi = Math.PI / 2.15; s.radius = Math.min(s.radius, 12); }),
      north: () => orbit(s => { s.theta = 0; }),
      preset: name => { const c = CAMS[name] || CAMS.asia; fly(new Vector3(...c.pos), new Vector3(...c.target)); },
    };
  }, [camera, controls]);
  useFrame((_, dt) => {
    const ctl = controls.current; if (!ctl) return;
    if (follow && followRef.current) {
      const p = followRef.current;
      ctl.target.lerp(p, Math.min(1, dt * 3));
      camera.position.lerp(new Vector3(p.x + 1.4, p.y + 2.2, p.z + 2.6), Math.min(1, dt * 2));
    } else if (goal.current.flying) {
      const k = Math.min(1, dt * 2.2);
      camera.position.lerp(goal.current.pos, k);
      ctl.target.lerp(goal.current.target, k);
      if (camera.position.distanceTo(goal.current.pos) < 0.03) goal.current.flying = false;
    }
    ctl.update();
  });
  return null;
}

// T1 lanes: road legs and each lane's own sea leg per lane; the shared Malacca -> entry-port corridor once per entry port.
function LanesV2({ data, tracks, C, aff, spotlight }) {
  const seg = (tr, a, b) => tr.pts.slice(a, b + 1).map(p => [p.v.x, p.v.y + 0.005, p.v.z]);
  const corridors = {};
  const items = data.lanes.map(l => {
    const tr = tracks[l.id];
    const hot = aff.has(l.supplier_id), dim = spotlight && l.supplier_id !== spotlight;
    if (l.mode !== "SEA") return <FlowLine key={l.id} points={seg(tr, 0, tr.pts.length - 1)} color={hot ? C.late : C.road} hot={hot} dim={dim} />;
    if (l.corridor) {                       // T1 shared corridor (T2 real sea routes have none: the lane's own leg is the whole sea route)
      const c = corridors[l.corridor] || (corridors[l.corridor] = { pts: seg(tr, l.shared_from, l.sea_end), hot: false, dim: true });
      c.hot = c.hot || hot; c.dim = c.dim && !!dim;
    }
    return (
      <group key={l.id}>
        <FlowLine points={seg(tr, 0, l.sea_start)} color={hot ? C.late : C.road} hot={hot} dim={dim} />
        <FlowLine points={seg(tr, l.sea_start, l.shared_from)} color={hot ? C.late : C.sea} sea hot={hot} dim={dim} />
        <FlowLine points={seg(tr, l.sea_end, tr.pts.length - 1)} color={hot ? C.late : C.road} hot={hot} dim={dim} />
      </group>);
  });
  return (<>{items}{Object.entries(corridors).map(([k, c]) => <FlowLine key={k} points={c.pts} color={c.hot ? C.late : C.sea} sea hot={c.hot} dim={spotlight ? c.dim : false} />)}</>);
}

function SelectedRoute({ data, selected, tracks, C }) {
  const s = selected && (data.shipments.find(x => x.id === selected) || data.movements?.find(x => x.id === selected));
  if (!s || !tracks[s.lane]) return null;
  const pts = tracks[s.lane].pts.map(p => [p.v.x, p.v.y + 0.03, p.v.z]);
  return <Line points={pts} color={C.sel} lineWidth={5} transparent opacity={0.85} />;
}

// Label de-cluttering (T1): every few frames project the registered label sprites to screen space and hide lower-priority
// labels that overlap a higher-priority one (plants > alerting suppliers > at-risk suppliers > others).
function Declutter({ registry, enabled }) {
  const { camera, size } = useThree();
  const v = useMemo(() => new Vector3(), []);
  const tick = useRef(0);
  useFrame(() => {
    if (!enabled || (tick.current++ % 4)) return;
    const P = camera.projectionMatrix.elements, W = size.width, H = size.height, kept = [];
    const items = [...registry.current.values()].filter(x => x.el?.parent).sort((a, b) => b.priority - a.priority);
    for (const it of items) {
      const el = it.el;
      el.getWorldPosition(v); v.project(camera);
      if (v.z > 1 || Math.abs(v.x) > 1.2 || Math.abs(v.y) > 1.2) { el.visible = true; continue; }
      const w = el.scale.x * P[0] * W / 2, h = el.scale.y * P[5] * H / 2;
      const cx = (v.x + 1) / 2 * W, cy = (1 - v.y) / 2 * H;
      const box = { l: cx - el.center.x * w - 4, t: cy - (1 - el.center.y) * h - 4, r: cx + (1 - el.center.x) * w + 4, b: cy + el.center.y * h + 4 };
      const hit = kept.some(k => box.l < k.r && box.r > k.l && box.t < k.b && box.b > k.t);
      el.visible = !hit;
      if (!hit) kept.push(box);
    }
  });
  return null;
}

function Scene({ data, theme, simDayRef, selected, onSelect, onHover, view, follow, affected, layers, spotlight, plantLabels, onStats, apiRef, health, hidden, hiddenSup, alerting }) {
  const controls = useRef();
  const v2 = (data.version || 1) >= 2;
  const registry = useRef(new Map());
  const regCache = useRef({});
  const reg = v2 ? (key, priority) => (regCache.current[`${key}|${priority}`] ||= el => { if (el) registry.current.set(key, { el, priority }); else registry.current.delete(key); }) : null;
  const followRef = useRef(null);
  const night = theme === "dark";
  const C = useMemo(() => ({
    ...scenePalette(night),
    ocean: token("--bx-wash-6"), grid: token("--sky"),
    land: scenePalette(night).hill, india: scenePalette(night).grass,
    edge: token("--text-muted"), indiaEdge: token("--brand-purple"), sup: token("--depth-1"), plant: token("--depth-3"),
    plant2: token("--brand-navy"), port: token("--text-secondary"), sea: token("--chart-c1"), road: token("--chart-c2"),
    ok: token("--chart-c4"), late: token("--depth-0"), dis: token("--brand-orange"), sel: token("--brand-purple"),
    ink: token("--brand-white"), label: token("--text-primary"), plantLabel: token("--depth-3"),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [theme]);
  const tracks = useMemo(() => Object.fromEntries(data.lanes.map(l => [l.id, laneTrack(l)])), [data]);
  const aff = new Set(affected || []);
  const plants = data.nodes.filter(n => n.kind === "plant");
  return (
    <>
      <color attach="background" args={[C.fog]} />
      <fog attach="fog" args={[C.fog, 26, 60]} />
      <Suspense fallback={null}>
        <Environment files={night ? "/env/dikhololo_night_1k.hdr" : "/env/venice_sunset_1k.hdr"} background={!night} backgroundBlurriness={0.4}
          backgroundIntensity={0.85} environmentIntensity={night ? 0.55 : 0.9} />
      </Suspense>
      {night && <Stars radius={90} depth={40} count={1800} factor={2.6} fade speed={0.3} />}
      <ambientLight intensity={night ? 0.3 : 0.45} />
      <directionalLight position={night ? [-8, 14, 8] : [10, 14, 8]} intensity={night ? 0.8 : 2} color={night ? C.sun : C.lamp} castShadow shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-16} shadow-camera-right={16} shadow-camera-top={12} shadow-camera-bottom={-12} />
      <Land C={C} showBorders={layers.labels} />
      {layers.lanes && v2 && <LanesV2 data={data} tracks={tracks} C={C} aff={aff} spotlight={spotlight} />}
      {layers.lanes && !v2 && data.lanes.map(l => {
        const tr = tracks[l.id];
        const seaPts = [], roadA = [], roadB = [];
        tr.pts.forEach((p, i) => {
          const v = [p.v.x, p.v.y + 0.005, p.v.z];
          if (l.mode !== "SEA") roadA.push(v);
          else if (p.sea) { seaPts.push(v); if (i === 1) roadA.push(v); }
          else (seaPts.length ? roadB : roadA).push(v);
        });
        if (l.mode === "SEA" && seaPts.length) roadB.unshift(seaPts[seaPts.length - 1]);
        const hot = aff.has(l.supplier_id);
        const dim = spotlight && l.supplier_id !== spotlight;
        return (
          <group key={l.id}>
            {seaPts.length > 1 && <FlowLine points={seaPts} color={hot ? C.late : C.sea} sea hot={hot} dim={dim} />}
            {roadA.length > 1 && <FlowLine points={roadA} color={hot ? C.late : C.road} hot={hot} dim={dim} />}
            {roadB.length > 1 && <FlowLine points={roadB} color={C.road} dim={dim} />}
          </group>
        );
      })}
      {data.nodes.filter(n => n.kind === "supplier").map(n => (
        <SupplierPin key={n.id} n={n} C={C} health={health?.[n.id]} hot={aff.has(n.id)} dim={(spotlight && n.id !== spotlight) || (health && hidden?.has(health[n.id]))} showLabel={layers.labels} plants={plants}
          v2={v2} alerting={!!alerting?.has(n.id)} reg={reg}
          onClick={x => onSelect?.({ type: "node", id: x.id })} />))}
      {plants.map(n => <Plant key={n.id} n={n} C={C} v2={v2} reg={reg} label={layers.labels ? plantLabels?.[n.id] : null} onClick={x => onSelect?.({ type: "node", id: x.id })} />)}
      <Declutter registry={registry} enabled={v2} />
      {layers.ports && data.nodes.filter(n => n.kind === "port").map(n => <Port key={n.id} n={n} C={C} onClick={x => onSelect?.({ type: "node", id: x.id })} />)}
      <SelectedRoute data={data} selected={selected} tracks={tracks} C={C} />
      <Vehicles data={data} tracks={tracks} simDayRef={simDayRef} C={C} selected={selected} followRef={followRef} layers={layers}
        spotlight={spotlight} onStats={onStats} theme={theme} hiddenSup={hiddenSup} view={view} onSelect={id => onSelect?.({ type: "shipment", id })} onHover={onHover} />
      <DeliveryPulses data={data} simDayRef={simDayRef} C={C} />
      <OrbitControls ref={controls} makeDefault enableDamping dampingFactor={0.08} enablePan screenSpacePanning={false}
        mouseButtons={{ LEFT: MOUSE.ROTATE, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.PAN }}
        maxPolarAngle={Math.PI / 2.1} minDistance={2} maxDistance={34} />
      <CameraRig view={view} follow={follow} followRef={followRef} controls={controls} apiRef={apiRef} />
      <EffectComposer multisampling={0}>
        <Bloom intensity={night ? 1.25 : 0.3} luminanceThreshold={night ? 0.6 : 0.92} luminanceSmoothing={0.25} mipmapBlur />
        <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
        <SMAA />
        <Vignette eskil={false} offset={0.28} darkness={night ? 0.6 : 0.25} />
      </EffectComposer>
    </>
  );
}

const Map3D = forwardRef(function Map3D({ data, theme, simDayRef, selected, onSelect, view = "asia", follow, affected, layers, spotlight,
  plantLabels, onStats, renderTip, health, hidden, hiddenSup, alerting }, ref) {
  const [tip, setTip] = useState(null);
  const wrap = useRef();
  const r = wrap.current?.getBoundingClientRect();
  return (
    <div ref={wrap} style={{ position: "absolute", inset: 0 }} onContextMenu={e => e.preventDefault()}>
      <Canvas shadows flat dpr={[1, 1.75]} camera={{ fov: 45, near: 0.1, far: 120, position: [14, 26, 30] }} gl={{ antialias: true }}>
        <Scene data={data} theme={theme} simDayRef={simDayRef} selected={selected} onSelect={onSelect} onHover={setTip} view={view}
          follow={follow} affected={affected} layers={layers} spotlight={spotlight} plantLabels={plantLabels} onStats={onStats} apiRef={ref} health={health} hidden={hidden} hiddenSup={hiddenSup} alerting={alerting} />
      </Canvas>
      {tip && r && renderTip && (
        <div className="node-tip map3d-tip" style={{ left: Math.min(tip.x - r.left + 16, r.width - 290), top: Math.min(tip.y - r.top + 14, r.height - 150) }}>
          {renderTip(tip)}
        </div>
      )}
    </div>
  );
});
export default Map3D;
