import { useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Line, MeshDistortMaterial, OrbitControls, Sparkles } from "@react-three/drei";
import { CanvasTexture, SRGBColorSpace } from "three";
import { fmt, inr, pct, token } from "../util";

/* Supplier Risk Orbit
   - distance from the core = composite score (weaker suppliers orbit closer to the red risk core)
   - height = OTIF %, size = spend, colour = grade                                                  */

const GRADE_TOKEN = { A: "--chart-c4", B: "--brand-blue", C: "--brand-orange", D: "--depth-0" };

// Text label drawn to a canvas texture: always faces the camera, no font download, no extra React roots.
export function Label({ text, color, position, scale = 1, fixed = false, anchor = [0.5, 0.5], spriteRef }) {
  // The canvas is sized to the text (min 256 px wide), so long labels are never clipped; the sprite keeps
  // the same text height and grows in width with the aspect ratio.
  const { tex, aspect } = useMemo(() => {
    const font = "700 34px Inter, system-ui, sans-serif";
    const m = document.createElement("canvas").getContext("2d"); m.font = font;
    const w = Math.max(256, Math.ceil(m.measureText(text).width + 24));
    const c = document.createElement("canvas"); c.width = w; c.height = 64;
    const g = c.getContext("2d");
    g.font = font; g.textAlign = "center"; g.textBaseline = "middle";
    g.fillStyle = color; g.fillText(text, w / 2, 34);
    const t = new CanvasTexture(c); t.colorSpace = SRGBColorSpace; t.anisotropy = 4;
    return { tex: t, aspect: w / 256 };
  }, [text, color]);
  return (
    // fixed = constant on-screen size (map-style labels that do not grow when zooming in)
    <sprite ref={spriteRef} position={position} scale={fixed ? [0.11 * scale * aspect, 0.0275 * scale, 1] : [1.0 * scale * aspect, 0.25 * scale, 1]} raycast={() => null} renderOrder={fixed ? 10 : 0} center={anchor}>
      <spriteMaterial map={tex} transparent depthWrite={false} depthTest={!fixed} sizeAttenuation={!fixed} />
    </sprite>
  );
}

// Labels are canvas sprites (no extra React roots); the hover tooltip is one DOM overlay outside the canvas.
function Node({ s, pos, size, color, labelColor, onSelect, hovered, onHover }) {
  const ref = useRef();
  const isHover = hovered === s.supplier_id;
  useFrame((st) => {
    if (!ref.current) return;
    const t = st.clock.elapsedTime;
    ref.current.position.y = pos[1] + Math.sin(t * 1.2 + pos[0]) * 0.08;
    const k = isHover ? 1.35 : 1;
    ref.current.scale.lerp({ x: k, y: k, z: k }, 0.15);
  });
  return (
    <group>
      <Line points={[[0, 0, 0], pos]} color={color} lineWidth={isHover ? 2 : 0.8} transparent opacity={isHover ? 0.9 : 0.28} dashed dashSize={0.18} gapSize={0.12} />
      <group ref={ref} position={pos}>
        <mesh
          onPointerOver={(e) => { e.stopPropagation(); onHover(s, e.nativeEvent); document.body.style.cursor = "pointer"; }}
          onPointerMove={(e) => onHover(s, e.nativeEvent)}
          onPointerOut={() => { onHover(null); document.body.style.cursor = "auto"; }}
          onClick={(e) => { e.stopPropagation(); onSelect?.(s.supplier_id); }}>
          <sphereGeometry args={[size, 48, 48]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={isHover ? 0.9 : 0.45} roughness={0.25} metalness={0.35} />
        </mesh>
        <mesh scale={1.45} raycast={() => null}>
          <sphereGeometry args={[size, 24, 24]} />
          <meshBasicMaterial color={color} transparent opacity={isHover ? 0.22 : 0.1} depthWrite={false} />
        </mesh>
        <Label text={s.supplier_id} color={labelColor} position={[0, size + 0.3, 0]} />
      </group>
    </group>
  );
}

function Rings({ color }) {
  return [2.2, 3.4, 4.6].map((r, i) => (
    <mesh key={r} rotation={[Math.PI / 2, 0, 0]}>
      <torusGeometry args={[r, 0.008 + i * 0.002, 8, 160]} />
      <meshBasicMaterial color={color} transparent opacity={0.35 - i * 0.07} />
    </mesh>
  ));
}

function Scene({ suppliers, onSelect, theme, hovered, onHover }) {
  const group = useRef();
  const colors = useMemo(() => ({
    core: token("--depth-0"), label: token("--text-secondary"), ring: token("--brand-purple"), spark: token("--brand-blue"),
    grade: Object.fromEntries(Object.entries(GRADE_TOKEN).map(([g, t]) => [g, token(t)])),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [theme]);

  const nodes = useMemo(() => {
    const maxSpend = Math.max(...suppliers.map((s) => s.spend_inr || 1));
    const scores = suppliers.map((s) => s.composite_score);
    const lo = Math.min(...scores), hi = Math.max(...scores);
    return suppliers.map((s, i) => {
      const a = (i / suppliers.length) * Math.PI * 2;
      const norm = hi > lo ? (s.composite_score - lo) / (hi - lo) : 0.5;
      const r = 2.2 + norm * 2.4;
      const y = ((s.otif_pct ?? 50) - 25) / 22;
      return { s, pos: [Math.cos(a) * r, y, Math.sin(a) * r], size: 0.18 + 0.32 * Math.sqrt((s.spend_inr || 0) / maxSpend) };
    });
  }, [suppliers]);

  useFrame((_, dt) => { if (group.current && !hovered) group.current.rotation.y += dt * 0.08; });

  return (
    <>
      <ambientLight intensity={0.6} />
      <pointLight position={[0, 0, 0]} intensity={30} color={colors.core} distance={9} />
      <directionalLight position={[5, 8, 5]} intensity={1.2} />
      <group ref={group}>
        <mesh>
          <icosahedronGeometry args={[0.75, 8]} />
          <MeshDistortMaterial color={colors.core} emissive={colors.core} emissiveIntensity={0.6} distort={0.35} speed={2} roughness={0.2} />
        </mesh>
        <Rings color={colors.ring} />
        {nodes.map((n) => (
          <Node key={n.s.supplier_id} {...n} color={colors.grade[n.s.grade]} labelColor={colors.label} onSelect={onSelect} hovered={hovered} onHover={onHover} />
        ))}
        <Sparkles count={70} scale={11} size={2.2} speed={0.25} color={colors.spark} opacity={0.5} />
      </group>
      <OrbitControls enablePan={false} minDistance={5} maxDistance={14} maxPolarAngle={Math.PI / 1.9} />
    </>
  );
}

export default function Constellation3D({ suppliers, onSelect, theme }) {
  const [tip, setTip] = useState(null);        // {s, x, y}
  const wrap = useRef();
  if (!suppliers?.length) return <div className="skeleton" style={{ height: "100%" }} />;
  const onHover = (s, ev) => {
    if (!s) return setTip(null);
    const r = wrap.current?.getBoundingClientRect();
    setTip({ s, x: ev.clientX - (r?.left || 0), y: ev.clientY - (r?.top || 0) });
  };
  return (
    <div ref={wrap} style={{ position: "absolute", inset: 0 }}>
      <Canvas camera={{ position: [0, 4.2, 8.6], fov: 50 }} dpr={[1, 2]} gl={{ alpha: true, antialias: true }}>
        <Scene suppliers={suppliers} onSelect={onSelect} theme={theme} hovered={tip?.s.supplier_id} onHover={onHover} />
      </Canvas>
      {tip && (
        <div className="node-tip" style={{ position: "absolute", left: tip.x + 16, top: tip.y + 12 }}>
          <b>{tip.s.supplier_name}</b>
          Grade {tip.s.grade} · score {fmt(tip.s.composite_score)}<br />
          OTIF {pct(tip.s.otif_pct)} · PPM {fmt(tip.s.incoming_ppm, 0)}<br />
          Spend {inr(tip.s.spend_inr)} · risk #{tip.s.risk_rank}<br />
          <span className="muted">Click for drill-down</span>
        </div>
      )}
    </div>
  );
}
