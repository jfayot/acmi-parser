import { defineConfig } from "vite";
import dts from "vite-plugin-dts";

export default defineConfig({
  plugins: [dts({ rollupTypes: true, outDir: "./dist/types" })],
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
});
