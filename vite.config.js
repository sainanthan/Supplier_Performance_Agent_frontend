import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// 127.0.0.1 (not localhost): Node may resolve localhost to IPv6 while uvicorn listens on IPv4.
const proxy = { "/api": "http://127.0.0.1:8000" };

export default defineConfig({
  plugins: [react()],
  server: { proxy },
  // `npm run app` (build + preview): the bundled, compressed app. Pages open several times faster than with `npm run dev`,
  // which serves the 3D / map libraries as hundreds of separate modules (the browser's 6 connections queue behind them).
  preview: { port: 5173, strictPort: true, proxy },
  // MapLibre 6 is ESM-only and loads its web worker relative to its own module; pre-bundling would break that URL.
  // The heavy 3D / map libraries are pre-bundled up front, so the dev server does not discover them on first use.
  optimizeDeps: {
    exclude: ["maplibre-gl"],
    include: ["three", "@react-three/fiber", "@react-three/drei", "@react-three/postprocessing", "@deck.gl/core", "@deck.gl/layers",
      "@deck.gl/react", "@deck.gl/mesh-layers", "@deck.gl/mapbox", "@deck.gl/extensions", "recharts", "framer-motion"],
  },
  build: { chunkSizeWarningLimit: 1500 },
});
