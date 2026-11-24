// GPS Tracking > live map of one vehicle: the planned road route (dashed), the truck replaying its latest positions along it
// (the trail grows as it moves), then sitting at its live position with a pulsing ring. Progress to the plant, distance left,
// arrival estimate and an "updated N s ago" counter that ticks every second.
import { useEffect, useMemo, useRef, useState } from "react";
import Map, { Layer, Marker, Source } from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import { setWorkerUrl } from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import { Factory, Flag, Truck } from "lucide-react";
import { cumKm, km } from "./geo";

setWorkerUrl(workerUrl);
const STYLE = "https://tiles.openfreemap.org/styles/positron";       // light basemap so the route stands out (tile coordinates only)
const REPLAY_MS = 4200;


const at = (pts, cum, d) => {                                           // point at distance d along pts
  const k = cum.findIndex(c => c >= d); const i = k === -1 ? pts.length - 1 : Math.max(1, k);
  const f = cum[i] === cum[i - 1] ? 0 : (d - cum[i - 1]) / (cum[i] - cum[i - 1]);
  return [pts[i - 1][0] + f * (pts[i][0] - pts[i - 1][0]), pts[i - 1][1] + f * (pts[i][1] - pts[i - 1][1])];
};
const rad = d => (d * Math.PI) / 180;
const bearing = (a, b) => {
  const y = Math.sin(rad(b[1] - a[1])) * Math.cos(rad(b[0])), x = Math.cos(rad(a[0])) * Math.sin(rad(b[0])) - Math.sin(rad(a[0])) * Math.cos(rad(b[0])) * Math.cos(rad(b[1] - a[1]));
  return (Math.atan2(y, x) * 180) / Math.PI;
};
const line = pts => ({ type: "Feature", geometry: { type: "LineString", coordinates: pts.map(p => [p[1], p[0]]) } });

export default function GpsLiveMap({ track, live }) {
  const pings = useMemo(() => (track?.pings || []).map(p => [p.lat, p.lon]), [track]);
  const route = track?.route;
  const plan = useMemo(() => (route?.path || []), [route]);
  const cum = useMemo(() => cumKm(pings), [pings]);
  const [t, setT] = useState(1);                                        // replay progress 0..1
  const mapRef = useRef(null), raf = useRef(0);
  const vid = track?.vehicle?.vehicle_id;

  // replay the journey whenever another vehicle is shown or new positions arrive
  useEffect(() => {
    if (pings.length < 2) { setT(1); return undefined; }
    const t0 = performance.now(), reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) { setT(1); return undefined; }
    const step = now => { const x = Math.min(1, (now - t0) / REPLAY_MS); setT(1 - (1 - x) ** 3); if (x < 1) raf.current = requestAnimationFrame(step); };
    setT(0); raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, [vid, pings.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // frame the whole route (or the positions) when the vehicle changes
  useEffect(() => {
    const m = mapRef.current; const pts = plan.length ? plan : pings;
    if (!m || !pts.length) return;
    const la = pts.map(p => p[0]), lo = pts.map(p => p[1]);
    m.fitBounds([[Math.min(...lo), Math.min(...la)], [Math.max(...lo), Math.max(...la)]], { padding: { top: 70, bottom: 110, left: 130, right: 130 }, duration: 900 });
  }, [vid, plan.length, pings.length > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  const d = (cum.at(-1) || 0) * t;
  const pos = pings.length ? (pings.length > 1 ? at(pings, cum, d) : pings[0]) : null;
  const trail = pings.length > 1 ? [...pings.slice(0, Math.max(1, cum.findIndex(c => c >= d))), pos] : [];
  const head = pings.length > 1 ? bearing(pings.at(-2), pings.at(-1)) : 0;
  const start = plan[0] || pings[0], end = plan.at(-1);
  const centre = pos || start || [12.97, 79];

  return <div className="gl-map">
    <Map ref={mapRef} mapStyle={STYLE} initialViewState={{ latitude: centre[0], longitude: centre[1], zoom: 7 }} attributionControl={{ compact: true }}
      dragRotate={false} style={{ width: "100%", height: "100%" }}>
      {plan.length > 1 && <Source id="plan" type="geojson" data={line(plan)}>
        <Layer id="plan-casing" type="line" paint={{ "line-color": "#ffffff", "line-width": 7, "line-opacity": 0.9 }} layout={{ "line-cap": "round", "line-join": "round" }} />
        <Layer id="plan-line" type="line" paint={{ "line-color": "#8f98ad", "line-width": 3, "line-dasharray": [2, 1.6] }} layout={{ "line-cap": "round", "line-join": "round" }} />
      </Source>}
      {trail.length > 1 && <Source id="trail" type="geojson" data={line(trail)}>
        <Layer id="trail-glow" type="line" paint={{ "line-color": "#7c4ddb", "line-width": 10, "line-opacity": 0.18, "line-blur": 2 }} layout={{ "line-cap": "round", "line-join": "round" }} />
        <Layer id="trail-line" type="line" paint={{ "line-color": "#6f3dba", "line-width": 4.5 }} layout={{ "line-cap": "round", "line-join": "round" }} />
      </Source>}
      {start && <Marker latitude={start[0]} longitude={start[1]} anchor="bottom">
        <span className="gl-pin from" title={route?.origin?.name || "Start"}><Factory size={13} /><em>{route?.origin?.name || "Start"}</em></span></Marker>}
      {end && <Marker latitude={end[0]} longitude={end[1]} anchor="bottom">
        <span className="gl-pin to" title={route?.dest?.name}><Flag size={13} /><em>{route?.dest?.name || "Destination"}</em></span></Marker>}
      {pos && <Marker latitude={pos[0]} longitude={pos[1]} anchor="center">
        <span className={"gl-truck" + (live ? " live" : "")} style={{ "--hd": `${head}deg` }}><i className="gl-ring" /><i className="gl-head" /><Truck size={15} /></span></Marker>}
    </Map>
    {!pings.length && <div className="gl-empty">No positions on this trip yet. They appear here as soon as the driver starts sharing.</div>}
  </div>;
}
