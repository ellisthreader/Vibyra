import { fileURLToPath } from "node:url";

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const entry = (file: string) => fileURLToPath(new URL(file, import.meta.url));

// Tauri expects a fixed dev port and no auto-open browser.
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
  build: {
    target: "es2022",
    outDir: "dist",
    sourcemap: false,
    rollupOptions: {
      // Two pages, not one. `boot.html` is the splash the host shows while the
      // app entry is still being parsed, so it shares no module with it on
      // purpose — see `src/boot/`.
      input: {
        main: entry("index.html"),
        boot: entry("boot.html"),
      },
    },
  },
});
