import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cesiumEngine } from "vite-plugin-cesium-engine";

export default defineConfig(({ mode }) => ({
  base: mode === "pages" ? "/acmi-parser/" : "/",
  plugins: [react(), cesiumEngine()],
}));
