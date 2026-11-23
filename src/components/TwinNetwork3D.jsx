import { useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { BufferAttribute, BufferGeometry, Color } from "three";
import { Label } from "./Constellation3D";
import { fmt, pct, token } from "../util";

/* 3D Digital Twin of the inbound supply network.
   Layers (guide §9.4 depth ramp): suppliers = depth-1 (purple) -> materials = depth-2 (blue) -> plants = depth-3 (orange).
   Particles flow along the busiest supply lanes at a speed proportional to volume.
   After a simulation, materials are recoloured by stockout probability and affected suppliers turn depth-0 (red). */

function layout(net) {
  const sup = net.nodes.filter(n => n.kind === "supplier");
  const mat = net.nodes.filter(n => n.kind === "material");
  const pl = net.nodes.filter(n => n.kind === "plant");
  const pos = {};
  sup.forEach((n, i) => {                       // evenly spaced curved column on the left
    const f = sup.length > 1 ? i / (sup.length - 1) - 0.5 : 0;
    pos[n.id] = [-7 + Math.abs(f) * 1.2, f * 9, Math.cos(f * Math.PI) * 1.8 - 1];
  });
  mat.forEach((n, i) => {                       // 6 x 3 lattice in the middle
    const c = i % 6, r = Math.floor(i / 6);
    pos[n.id] = [-0.5 + (r - 1) * 1.1, (c - 2.5) * 1.35, (r - 1) * 1.8];
  });
  pl.forEach((n, i) => { pos[n.id] = [6.5, (i - (pl.length - 1) / 2) * 3.6, 0]; });
  return { sup, mat, pl, pos };
}

function Flows({ edges, pos, color }) {
  const ref = useRef();
  const lanes = useMemo(() => {
    const top = [...edges].sort((a, b) => b.w - a.w).slice(0, 140);
    const out = [];
    top.forEach(e => {
      const n = 1 + Math.round(e.w * 3);
      for (let k = 0; k < n; k++) out.push({ a: pos[e.source], b: pos[e.target], t: Math.random(), v: 0.08 + e.w * 0.25 });
    });
    return out;
  }, [edges, pos]);
  const geom = useMemo(() => {
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(new Float32Array(lanes.length * 3), 3));
    return g;
  }, [lanes]);
  useFrame((_, dt) => {
    const arr = geom.attributes.position.array;
    lanes.forEach((l, i) => {
      l.t = (l.t + dt * l.v) % 1;
      const t = l.t, lift = Math.sin(Math.PI * t) * 0.6;
      arr[i * 3] = l.a[0] + (l.b[0] - l.a[0]) * t;
      arr[i * 3 + 1] = l.a[1] + (l.b[1] - l.a[1]) * t + lift * 0.2;
      arr[i * 3 + 2] = l.a[2] + (l.b[2] - l.a[2]) * t + lift;
    });
    geom.attributes.position.needsUpdate = true;
  });
  return (
    <points ref={ref} geometry={geom}>
      <pointsMaterial color={color} size={0.11} sizeAttenuation transparent opacity={0.9} depthWrite={false} />
    </points>
  );
}

function Edges({ edges, pos, color, highlight }) {
  const geom = useMemo(() => {
    const p = [], c = [];
    const base = new Color(color), hi = new Color(highlight);
    edges.forEach(e => {
      const a = pos[e.source], b = pos[e.target];
      if (!a || !b) return;
      p.push(...a, ...b);
      const col = e.hot ? hi : base;
      const k = e.hot ? 1 : 0.25 + e.w * 0.75;
      c.push(col.r * k, col.g * k, col.b * k, col.r * k, col.g * k, col.b * k);
    });
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(new Float32Array(p), 3));
    g.setAttribute("color", new BufferAttribute(new Float32Array(c), 3));
    return g;
  }, [edges, pos, color, highlight]);
  return (
    <lineSegments geometry={geom}>
      <lineBasicMaterial vertexColors transparent opacity={0.55} depthWrite={false} />
    </lineSegments>
  );
}

function Node({ n, p, size, color, label, labelColor, onHover, onClick, pulse }) {
  const ref = useRef();
  useFrame(st => {
    if (!ref.current) return;
    const k = pulse ? 1 + Math.sin(st.clock.elapsedTime * 4) * 0.12 : 1;
    ref.current.scale.setScalar(k);
  });
  return (
    <group position={p}>
      <mesh ref={ref}
        onPointerOver={e => { e.stopPropagation(); onHover(n, e.nativeEvent); document.body.style.cursor = "pointer"; }}
        onPointerMove={e => onHover(n, e.nativeEvent)}
        onPointerOut={() => { onHover(null); document.body.style.cursor = "auto"; }}
        onClick={e => { e.stopPropagation(); onClick?.(n); }}>
        {n.kind === "material" ? <boxGeometry args={[size * 1.5, size * 1.5, size * 1.5]} />
          : n.kind === "plant" ? <cylinderGeometry args={[size, size, size * 1.4, 32]} />
            : <sphereGeometry args={[size, 32, 32]} />}
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.35} roughness={0.35} metalness={0.2} />
      </mesh>
      <Label text={label} color={labelColor} position={[0, size + 0.4, 0]} scale={1.35} />
    </group>
  );
}

function Scene({ net, theme, result, selected, onSelect, onHover }) {
  const group = useRef();
  const C = useMemo(() => ({
    sup: token("--depth-1"), mat: token("--depth-2"), plant: token("--depth-3"), hot: token("--depth-0"),
    ok: token("--depth-4"), warn: token("--brand-orange"), edge: token("--sky"), flow: token("--brand-purple"),
    label: token("--text-secondary"),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [theme]);
  const { sup, mat, pl, pos } = useMemo(() => layout(net), [net]);
  const affected = new Set(result?.summary?.affected_suppliers || []);
  const matRisk = useMemo(() => {
    const m = {};
    (result?.materials || []).forEach(r => { m[r.material_id] = Math.max(m[r.material_id] || 0, r.stockout_prob_pct); });
    return m;
  }, [result]);
  const maxQty = Math.max(...net.edges.filter(e => e.kind === "supply").map(e => e.qty), 1);
  const supplyEdges = net.edges.filter(e => e.kind === "supply").map(e => ({
    ...e, w: e.qty / maxQty, hot: affected.has(e.source) || selected === e.source,
  }));
  const consumeEdges = net.edges.filter(e => e.kind === "consume").map(e => ({ ...e, w: 0.6, hot: (matRisk[e.source] || 0) >= 50 }));
  const supSpend = Object.fromEntries(sup.map(s => [s.id, supplyEdges.filter(e => e.source === s.id).reduce((a, e) => a + e.qty, 0)]));
  const maxSpend = Math.max(...Object.values(supSpend), 1);
  const riskColor = p => (p >= 50 ? C.hot : p >= 20 ? C.warn : C.ok);

  useFrame((_, dt) => { if (group.current) group.current.rotation.y = Math.sin(performance.now() / 9000) * 0.25; });

  return (
    <>
      <ambientLight intensity={0.75} />
      <directionalLight position={[4, 8, 6]} intensity={1.3} />
      <group ref={group}>
        <Edges edges={supplyEdges} pos={pos} color={C.edge} highlight={C.hot} />
        <Edges edges={consumeEdges} pos={pos} color={C.mat} highlight={C.hot} />
        <Flows edges={supplyEdges} pos={pos} color={C.flow} />
        {sup.map(n => (
          <Node key={n.id} n={n} p={pos[n.id]} size={0.22 + 0.25 * Math.sqrt(supSpend[n.id] / maxSpend)}
            color={affected.has(n.id) ? C.hot : C.sup} label={n.id} labelColor={C.label}
            pulse={affected.has(n.id) || selected === n.id} onHover={onHover} onClick={onSelect} />
        ))}
        {mat.map(n => (
          <Node key={n.id} n={n} p={pos[n.id]} size={0.17}
            color={result ? riskColor(matRisk[n.id] || 0) : C.mat} label={n.id.replace("MAT-", "")} labelColor={C.label}
            pulse={(matRisk[n.id] || 0) >= 50} onHover={onHover} />
        ))}
        {pl.map(n => (
          <Node key={n.id} n={n} p={pos[n.id]} size={0.55} color={C.plant} label={n.id} labelColor={C.label} onHover={onHover} />
        ))}
      </group>
      <OrbitControls enablePan={false} minDistance={7} maxDistance={22} />
    </>
  );
}

export default function TwinNetwork3D({ net, theme, result, selected, onSelect }) {
  const [tip, setTip] = useState(null);
  const wrap = useRef();
  if (!net?.nodes?.length) return <div className="skeleton" style={{ position: "absolute", inset: 0 }} />;
  const onHover = (n, ev) => {
    if (!n) return setTip(null);
    const r = wrap.current?.getBoundingClientRect();
    setTip({ n, x: ev.clientX - (r?.left || 0), y: ev.clientY - (r?.top || 0) });
  };
  const risk = id => (result?.materials || []).filter(m => m.material_id === id);
  const n = tip?.n;
  return (
    <div ref={wrap} style={{ position: "absolute", inset: 0 }}>
      <Canvas camera={{ position: [0, 2.5, 14], fov: 50 }} dpr={[1, 2]} gl={{ alpha: true, antialias: true }}>
        <Scene net={net} theme={theme} result={result} selected={selected} onSelect={onSelect} onHover={onHover} />
      </Canvas>
      {n && (
        <div className="node-tip" style={{ left: Math.min(tip.x + 16, (wrap.current?.clientWidth || 600) - 260), top: tip.y + 12 }}>
          <b>{n.label}</b>
          {n.kind === "supplier" && <>{n.country} · tier {n.risk_tier}<br />Grade {n.grade} · score {fmt(n.score)} · OTIF {pct(n.otif_pct)}<br /><span className="muted">Click to set as scenario scope</span></>}
          {n.kind === "material" && <>{n.category} · min cover {fmt(n.min_days_cover)} days
            {risk(n.id).map(r => <div key={r.plant_id}>{r.plant_id}: stockout {pct(r.stockout_prob_pct)} (base {pct(r.baseline_stockout_prob_pct)})</div>)}</>}
          {n.kind === "plant" && <>~{fmt(n.daily_units, 0)} units/day per component</>}
        </div>
      )}
    </div>
  );
}
