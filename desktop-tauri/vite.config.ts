import { appendFileSync } from "node:fs";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Tauri expects a fixed dev port and no auto-open browser.
export default defineConfig({
  plugins: [react(), { name: "dbglog", configureServer(server) { server.middlewares.use("/__log", (req, res) => { let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => { appendFileSync("/private/tmp/claude-501/-Users-ellis-Desktop-Vibyra/a54e87a3-81c5-42ca-927f-ae51fd839b06/scratchpad/webview.log", new Date().toISOString() + " " + b + "\n"); res.statusCode = 204; res.end(); }); }); } }],
  clearScreen: false,
  server: {
    // Pinned to IPv4, and matched by `devUrl` in `tauri.conf.json`. Left as
    // `localhost`, Vite binds whatever the resolver puts first — on this Mac
    // that is `::1` alone, and the webview asking for 127.0.0.1 is refused, so
    // the window opens on nothing while the terminal says everything is ready.
    host: "127.0.0.1",
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
  },
});
