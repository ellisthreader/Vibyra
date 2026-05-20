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

test("desktop preview skips source-only Vite entries in non-build roots", async () => {
  for (const entry of ["web/index.html", "app/index.html"]) {
    const { project, cleanup } = await makeProject(`vibyra-preview-source-${entry.replace(/[^a-z0-9]+/gi, "-")}`);
    try {
      await mkdir(join(project.path, dirname(entry), "src"), { recursive: true });
      await writeFile(join(project.path, entry), '<!doctype html><html><body><script type="module" src="/src/main.tsx"></script></body></html>');
      await writeFile(join(project.path, dirname(entry), "src", "main.tsx"), "console.log('source only');");

      const response = await requestPreview(project);
      assert.equal(response.status, 404);
      assert.match(response.body, /No runnable preview found/);
      assert.doesNotMatch(response.body, /main\.tsx/);
    } finally {
      await cleanup();
    }
  }
});

test("desktop preview rewrites nested page absolute assets to the build root", async () => {
  const { project, cleanup } = await makeProject("vibyra-preview-nested-page-");
  try {
    await mkdir(join(project.path, "dist", "pages", "about"), { recursive: true });
    await mkdir(join(project.path, "dist", "assets"), { recursive: true });
    await writeFile(join(project.path, "dist", "index.html"), "<!doctype html><html><body>home</body></html>");
    await writeFile(join(project.path, "dist", "pages", "about", "index.html"), '<!doctype html><html><body><script src="/assets/app.js"></script><script src="./local.js"></script></body></html>');
    await writeFile(join(project.path, "dist", "assets", "app.js"), 'console.log("mount root");');
    await writeFile(join(project.path, "dist", "pages", "about", "local.js"), 'console.log("document root");');

    const response = await requestPreview(project, "dist/pages/about/index.html");
    const base = `/preview/project/${encodeURIComponent(project.id)}/${encodeURIComponent(TOKEN)}/`;
    assert.equal(response.status, 200);
    assert.match(response.body, new RegExp(`${escapeRegExp(base)}dist/assets/app\\.js`));
    assert.match(response.body, new RegExp(`${escapeRegExp(base)}dist/pages/about/local\\.js`));
  } finally {
    await cleanup();
  }
});

test("desktop preview resolves existing folder ids without cached project state", async () => {
  const { project, cleanup } = await makeProject("vibyra-preview-encoded-");
  try {
    await mkdir(join(project.path, "assets"), { recursive: true });
    await writeFile(join(project.path, "index.html"), '<!doctype html><html><body><script src="/assets/app.js"></script></body></html>');
    await writeFile(join(project.path, "assets", "app.js"), 'console.log("encoded id");');

    const response = await requestPreview(project, "", { cacheProject: false });
    assert.equal(response.status, 200);
    assert.match(response.body, /assets\/app\.js/);
  } finally {
    await cleanup();
  }
});

test("desktop preview blocks project traversal and returns placeholder images for missing image assets", async () => {
  const { project, cleanup } = await makeProject("vibyra-preview-safety-");
  try {
    await writeFile(join(project.path, "index.html"), "<!doctype html><html><body>safe</body></html>");

    const traversal = await requestPreview(project, "..%2Foutside.txt");
    assert.equal(traversal.status, 404);
    assert.match(traversal.body, /Preview file missing/);

    for (const extension of ["png", "avif", "ico"]) {
      const image = await requestPreview(project, `missing/sprite.${extension}`);
      assert.equal(image.status, 200);
      assert.equal(image.headers["Content-Type"], "image/svg+xml; charset=utf-8");
      assert.match(image.body, /Image asset not included/);
    }
  } finally {
    await cleanup();
  }
});

test("desktop preview serves static game exports with 3D, media, and WASM assets", async () => {
  const { project, cleanup } = await makeProject("vibyra-preview-static-game-");
  const previousProjects = appState.cachedProjects;
  try {
    await mkdir(join(project.path, "game", "assets"), { recursive: true });
    await mkdir(join(project.path, "game", "models"), { recursive: true });
    await mkdir(join(project.path, "game", "audio"), { recursive: true });
    await mkdir(join(project.path, "game", "textures"), { recursive: true });
    await mkdir(join(project.path, "game", "video"), { recursive: true });
    await writeFile(join(project.path, "game", "index.html"), [
      "<!doctype html><html><head>",
      "<link rel=\"preload\" href=\"/models/level.glb\" as=\"fetch\">",
      "</head><body><canvas id=\"game\"></canvas>",
      "<script type=\"module\" src=\"/assets/game.js\"></script>",
      "</body></html>"
    ].join(""));
    await writeFile(join(project.path, "game", "assets", "game.js"), [
      "const model = \"/models/level.glb\";",
      "const texture = \"/textures/sky.webp\";",
      "const wasm = \"/assets/engine.wasm\";"
    ].join("\n"));
    await writeFile(join(project.path, "game", "models", "level.glb"), "glb");
    await writeFile(join(project.path, "game", "models", "scene.gltf"), "{}");
    await writeFile(join(project.path, "game", "audio", "theme.mp3"), "mp3");
    await writeFile(join(project.path, "game", "assets", "engine.wasm"), "wasm");
    await writeFile(join(project.path, "game", "textures", "sky.webp"), "webp");
    await writeFile(join(project.path, "game", "video", "intro.webm"), "webm");

    const response = await requestPreview(project);
    const base = `/preview/project/${encodeURIComponent(project.id)}/${encodeURIComponent(TOKEN)}/`;
    assert.equal(response.status, 200);
    assert.match(response.body, new RegExp(`${escapeRegExp(base)}game/assets/game\\.js`));
    assert.match(response.body, new RegExp(`${escapeRegExp(base)}game/models/level\\.glb`));

    assert.equal((await requestPreview(project, "game/models/level.glb")).headers["Content-Type"], "model/gltf-binary");
    assert.equal((await requestPreview(project, "game/models/scene.gltf")).headers["Content-Type"], "model/gltf+json; charset=utf-8");
    assert.equal((await requestPreview(project, "game/audio/theme.mp3")).headers["Content-Type"], "audio/mpeg");
    assert.equal((await requestPreview(project, "game/video/intro.webm")).headers["Content-Type"], "video/webm");
    assert.equal((await requestPreview(project, "game/assets/engine.wasm")).headers["Content-Type"], "application/wasm");

    appState.cachedProjects = [project];
    const referer = `http://vibyra.test${base}game/assets/game.js`;
    const runtimeModel = await requestPreviewRefererAsset("/models/level.glb", referer);
    assert.equal(runtimeModel.status, 200);
    assert.equal(runtimeModel.headers["Content-Type"], "model/gltf-binary");
    assert.equal(runtimeModel.body, "glb");
  } finally {
    appState.cachedProjects = previousProjects;
    await cleanup();
  }
});

test("desktop preview returns no runnable preview for Lua-only app folders", async () => {
  const { project, cleanup } = await makeProject("vibyra-preview-lua-only-");
  try {
    await writeFile(join(project.path, "main.lua"), "function love.draw() love.graphics.print(\"hello\") end");
    await writeFile(join(project.path, "conf.lua"), "function love.conf(t) t.window.title = \"Game\" end");

    const response = await requestPreview(project);
    assert.equal(response.status, 404);
    assert.match(response.body, /No runnable preview found/);
    assert.doesNotMatch(response.body, /love\.draw|main\.lua/);
  } finally {
    await cleanup();
  }
});

test("desktop preview serves important asset MIME types", async () => {
  const { project, cleanup } = await makeProject("vibyra-preview-mime-");
  try {
    await writeFile(join(project.path, "index.html"), "<!doctype html><html><body>mime</body></html>");
    await writeFile(join(project.path, "module.wasm"), "wasm");
    await writeFile(join(project.path, "favicon.ico"), "ico");
    await writeFile(join(project.path, "site.webmanifest"), "{}");
    await writeFile(join(project.path, "app.js.map"), "{}");

    assert.equal((await requestPreview(project, "module.wasm")).headers["Content-Type"], "application/wasm");
    assert.equal((await requestPreview(project, "favicon.ico")).headers["Content-Type"], "image/x-icon");
    assert.equal((await requestPreview(project, "site.webmanifest")).headers["Content-Type"], "application/manifest+json; charset=utf-8");
    assert.equal((await requestPreview(project, "app.js.map")).headers["Content-Type"], "application/json; charset=utf-8");
  } finally {
    await cleanup();
  }
});
