import test from "node:test";
import assert from "node:assert/strict";
import { chmod, mkdir, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { appState, TOKEN } from "./state.mjs";
import { previewServerProxyUrl } from "./preview.mjs";
import { startProjectDevServer } from "./previewDevServer.mjs";
import { STATIC_PREVIEW_ENTRIES } from "./previewResolver.mjs";
import { escapeRegExp, findFreePort, killTrackedPreview, makeFakeNpm, makeFakePhp, makeProject, makeRouteServer, makeViteLikeServer, occupyPort, proxyPathFor, requestPreview, requestPreviewProxyPath, requestPreviewRefererAsset, requestPreviewServerProxy, requestPreviewUrlProxy, viteErrorHtml } from "./previewTestHelpers.mjs";

test("approved preview server start supports Next dev scripts", async () => {
  const { project, cleanup } = await makeProject("vibyra-preview-start-next-");
  const fakeNpm = await makeFakeNpm();
  const port = await findFreePort();
  const html = '<!doctype html><html><body><div id="__next"></div><script id="__NEXT_DATA__" type="application/json">{}</script></body></html>';
  try {
    await writeFile(join(project.path, "package.json"), JSON.stringify({
      scripts: { dev: `next dev --port ${port}` },
      dependencies: { next: "latest", react: "latest", "react-dom": "latest" }
    }));

    const result = await startProjectDevServer(project, "127.0.0.1:4317", {
      env: {
        PATH: `${fakeNpm.bin}:${process.env.PATH ?? ""}`,
        VIBYRA_FAKE_OUTPUT_MODE: "next",
        VIBYRA_FAKE_PREVIEW_HTML: html,
        VIBYRA_FAKE_PREVIEW_PORT: String(port)
      },
      timeoutMs: 6000
    });
    assert.equal(result.command, `npm run dev -- --hostname 0.0.0.0 --port ${port}`);
    assert.equal(result.started, true);
    assert.equal(result.url, `http://127.0.0.1:${port}`);
  } finally {
    appState.previewServers[project.id]?.process?.kill();
    delete appState.previewServers[project.id];
    await fakeNpm.cleanup();
    await cleanup();
  }
});

const FRAMEWORK_DEV_SERVER_CASES = [
  {
    label: "SvelteKit",
    packageJson: { scripts: { dev: "svelte-kit dev" }, devDependencies: { "@sveltejs/kit": "latest", vite: "latest" } },
    html: "<!doctype html><html><body><div data-sveltekit-hydrate=\"x\"></div><script>window.__sveltekit = true;</script></body></html>",
    command: (port) => `npm run dev -- --host 0.0.0.0 --port ${port}`
  },
  {
    label: "Astro",
    packageJson: { scripts: { dev: "astro dev" }, devDependencies: { astro: "latest" } },
    html: "<!doctype html><html><body><astro-island uid=\"1\"></astro-island><main data-astro-cid>Astro</main></body></html>",
    command: (port) => `npm run dev -- --host 0.0.0.0 --port ${port}`
  },
  {
    label: "Nuxt",
    packageJson: { scripts: { dev: "nuxi dev" }, dependencies: { nuxt: "latest" } },
    html: "<!doctype html><html><body><div id=\"__nuxt\"></div><script>window.__NUXT__ = {};</script></body></html>",
    command: (port) => `npm run dev -- --host 0.0.0.0 --port ${port}`
  },
  {
    label: "Angular",
    packageJson: { scripts: { start: "ng serve" }, dependencies: { "@angular/core": "latest" }, devDependencies: { "@angular/cli": "latest" } },
    html: "<!doctype html><html><body><app-root ng-version=\"17.0.0\"></app-root></body></html>",
    command: (port) => `npm run start -- --host 0.0.0.0 --port ${port}`
  },
  {
    label: "Vue CLI",
    packageJson: { scripts: { serve: "vue-cli-service serve" }, devDependencies: { "@vue/cli-service": "latest" } },
    html: "<!doctype html><html><body><div id=\"app\"></div><script src=\"/js/app.js\"></script></body></html>",
    command: (port) => `npm run serve -- --host 0.0.0.0 --port ${port}`
  },
  {
    label: "Create React App",
    packageJson: { scripts: { start: "react-scripts start" }, dependencies: { "react-scripts": "latest" } },
    html: "<!doctype html><html><body><div id=\"root\"></div><script src=\"/static/js/main.js\"></script></body></html>",
    command: (port) => `HOST=0.0.0.0 PORT=${port} npm run start`
  },
  {
    label: "Remix Vite",
    packageJson: { scripts: { dev: "remix vite:dev" }, devDependencies: { "@remix-run/dev": "latest", vite: "latest" } },
    html: "<!doctype html><html><body><script>window.__remixContext = {};</script><script src=\"/build/entry.client.js\"></script></body></html>",
    command: (port) => `npm run dev -- --host 0.0.0.0 --port ${port}`
  }
];

for (const scenario of FRAMEWORK_DEV_SERVER_CASES) {
  test(`approved preview server start supports ${scenario.label} dev scripts`, async () => {
    const { project, cleanup } = await makeProject(`vibyra-preview-start-${scenario.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-`);
    const fakeNpm = await makeFakeNpm();
    const port = await findFreePort();
    try {
      await writeFile(join(project.path, "package.json"), JSON.stringify(scenario.packageJson));

      const result = await startProjectDevServer(project, "127.0.0.1:4317", {
        env: {
          PATH: `${fakeNpm.bin}:${process.env.PATH ?? ""}`,
          VIBYRA_FAKE_PREVIEW_HTML: scenario.html,
          VIBYRA_FAKE_PREVIEW_PORT: String(port)
        },
        port,
        timeoutMs: 6000
      });
      assert.equal(result.command, scenario.command(port));
      assert.equal(result.started, true);
      assert.equal(result.url, `http://127.0.0.1:${port}`);
    } finally {
      killTrackedPreview(project.id);
      await fakeNpm.cleanup();
      await cleanup();
    }
  });
}

test("approved preview server start runs Laravel PHP and Vite asset servers", async () => {
  const { project, cleanup } = await makeProject("vibyra-preview-start-laravel-");
  const fakeNpm = await makeFakeNpm();
  const fakePhp = await makeFakePhp();
  const vitePort = await findFreePort();
  const laravelPort = await findFreePort();
  const laravelHtml = "<!doctype html><html><body><div id=\"app\">Laravel app</div></body></html>";
  try {
    await writeFile(join(project.path, "artisan"), "");
    await writeFile(join(project.path, "composer.json"), JSON.stringify({ require: { "laravel/framework": "^13.0" } }));
    await mkdir(join(project.path, "database"), { recursive: true });
    await writeFile(join(project.path, "database", "database.sqlite"), "");
    await writeFile(join(project.path, ".env"), "DB_CONNECTION=mysql\nDB_HOST=mysql\nSESSION_DRIVER=database\n");
    await writeFile(join(project.path, "package.json"), JSON.stringify({
      scripts: { dev: "vite" },
      devDependencies: { vite: "latest", "laravel-vite-plugin": "latest" }
    }));

    const result = await startProjectDevServer(project, "127.0.0.1:4317", {
      env: {
        PATH: `${fakePhp.bin}:${fakeNpm.bin}:${process.env.PATH ?? ""}`,
        VIBYRA_FAKE_LARAVEL_HTML: laravelHtml,
        VIBYRA_FAKE_LARAVEL_REQUIRE_SQLITE_FALLBACK: "1",
        VIBYRA_FAKE_VITE_HTML: "<!doctype html><html><body>Vite assets only</body></html>"
      },
      laravelPort,
      port: vitePort,
      timeoutMs: 6000
    });
    assert.equal(result.command, `php artisan serve --host 0.0.0.0 --port ${laravelPort} + npm run dev -- --host 0.0.0.0 --port ${vitePort}`);
    assert.equal(result.started, true);
    assert.equal(result.url, `http://127.0.0.1:${laravelPort}`);
  } finally {
    killTrackedPreview(project.id);
    await fakePhp.cleanup();
    await fakeNpm.cleanup();
    await cleanup();
  }
});
