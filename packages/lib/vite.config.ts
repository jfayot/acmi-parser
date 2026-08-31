import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import dts from "vite-plugin-dts";

export default defineConfig({
  plugins: [dts({ outDirs: "./dist/types" })],
  test: {
    include: ["test/**/*.test.ts"],
  },
  build: {
    lib: {
      entry: "./src/index.ts",
      name: "acmi-parser",
      fileName: "acmi-parser",
      formats: ["es", "cjs"],
    },
    rollupOptions: {
      external: ["http", "https", "url", "zlib"],
      output: {
        exports: "named",
      },
    },
  },
  resolve: {
    alias: {
      "@math3d": fileURLToPath(
        new URL("./src/math3d/index.ts", import.meta.url),
      ),
    },
  },
});
