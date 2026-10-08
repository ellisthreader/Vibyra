// A Vite dev server that serves one test fixture at /fixture, with the app's styles, for the render walkthroughs.
import { readFile } from "node:fs/promises";
import { createServer } from "vite";

export async function serveFixture(fixture) {
  const main = await readFile("src/main.tsx", "utf8");
  const styles = [...main.matchAll(/import "(\.\/styles\/[^"]+)"/g)].map((m) => `import "/src/${m[1].slice(2)}";`).join("\n");
  const html = `<!doctype html><meta charset="utf-8"><div id="root"></div><script type="module">${styles}\nimport "${fixture}";</script>`;
  const server = await createServer({
    configFile: "vite.config.ts", logLevel: "error", server: { port: 0, strictPort: false, hmr: false },
    plugins: [{ name: "fixture", configureServer(s) {
      s.middlewares.use("/fixture", async (req, res) => { res.setHeader("Content-Type", "text/html"); res.end(await s.transformIndexHtml(req.url ?? "/", html)); });
    } }],
  });
  await server.listen();
  return { server, url: `http://127.0.0.1:${server.config.server.port ?? server.httpServer.address().port}` };
}
