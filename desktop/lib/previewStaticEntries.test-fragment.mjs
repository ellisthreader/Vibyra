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

test("desktop preview serves nested build assets from the entry root", async () => {
  const { project, cleanup } = await makeProject("vibyra-preview-nested-");
  try {
    await mkdir(join(project.path, "dist", "assets"), { recursive: true });
    await writeFile(join(project.path, "dist", "index.html"), [
      "<!doctype html><html><head>",
      '<link href="./style.css?v=1#sheet" rel="stylesheet">',
      "</head><body>",
      '<script src="/assets/app.js?v=2"></script>',
      "</body></html>"
    ].join(""));
    await writeFile(join(project.path, "dist", "style.css"), [
      '@import "/reset.css";',
      'body { background-image: url("/assets/bg.png?v=3#hero"); color: red; }',
      ".icon { background: url('./assets/icon.svg'); }",
      ".external { background: url('//cdn.example.com/image.png'); }"
    ].join("\n"));
    await writeFile(join(project.path, "dist", "reset.css"), "html { min-height: 100%; }");
    await writeFile(join(project.path, "dist", "assets", "bg.png"), "png");
    await writeFile(join(project.path, "dist", "assets", "icon.svg"), "<svg></svg>");
    await writeFile(join(project.path, "dist", "assets", "app.js"), 'console.log("nested asset");');

    const response = await requestPreview(project);
    const base = `/preview/project/${encodeURIComponent(project.id)}/${encodeURIComponent(TOKEN)}/`;
    assert.equal(response.status, 200);
    assert.match(response.body, new RegExp(`${escapeRegExp(base)}dist/assets/app\\.js\\?v=2`));
    assert.match(response.body, new RegExp(`${escapeRegExp(base)}dist/style\\.css\\?v=1#sheet`));

    const asset = await requestPreview(project, "dist/assets/app.js?v=2");
    assert.equal(asset.status, 200);
    assert.equal(asset.body, 'console.log("nested asset");');

    const css = await requestPreview(project, "dist/style.css?v=1");
    assert.equal(css.status, 200);
    assert.match(css.body, new RegExp(`@import "${escapeRegExp(base)}dist/reset\\.css"`));
    assert.match(css.body, new RegExp(`url\\("${escapeRegExp(base)}dist/assets/bg\\.png\\?v=3#hero"\\)`));
    assert.match(css.body, /url\('\.\/assets\/icon\.svg'\)/);
    assert.match(css.body, /url\('\/\/cdn\.example\.com\/image\.png'\)/);
  } finally {
    await cleanup();
  }
});

for (const entry of STATIC_PREVIEW_ENTRIES.filter((item) => item !== "index.html")) {
  test(`desktop preview mounts ${entry} as its static root`, async () => {
    const { project, cleanup } = await makeProject(`vibyra-preview-${entry.replace(/[^a-z0-9]+/gi, "-")}`);
    try {
      const entryDir = dirname(entry);
      await mkdir(join(project.path, entryDir, "assets"), { recursive: true });
      await writeFile(join(project.path, entry), '<!doctype html><html><body><script src="/assets/app.js"></script></body></html>');
      await writeFile(join(project.path, entryDir, "assets", "app.js"), `console.log(${JSON.stringify(entry)});`);

      const response = await requestPreview(project);
      const base = `/preview/project/${encodeURIComponent(project.id)}/${encodeURIComponent(TOKEN)}/`;
      assert.equal(response.status, 200);
      assert.match(response.body, new RegExp(`${escapeRegExp(base)}${escapeRegExp(entryDir)}/assets/app\\.js`));

      const asset = await requestPreview(project, `${entryDir}/assets/app.js`);
      assert.equal(asset.status, 200);
      assert.equal(asset.body, `console.log(${JSON.stringify(entry)});`);
    } finally {
      await cleanup();
    }
  });
}

test("desktop preview keeps root entry absolute assets at the project root", async () => {
  const { project, cleanup } = await makeProject("vibyra-preview-root-");
  try {
    await mkdir(join(project.path, "assets"), { recursive: true });
    await writeFile(join(project.path, "index.html"), '<!doctype html><html><body><script src="/assets/app.js"></script></body></html>');
    await writeFile(join(project.path, "assets", "app.js"), 'console.log("root asset");');

    const response = await requestPreview(project);
    const base = `/preview/project/${encodeURIComponent(project.id)}/${encodeURIComponent(TOKEN)}/`;
    assert.equal(response.status, 200);
    assert.match(response.body, new RegExp(`${escapeRegExp(base)}assets/app\\.js`));

    const asset = await requestPreview(project, "assets/app.js");
    assert.equal(asset.status, 200);
    assert.equal(asset.body, 'console.log("root asset");');
  } finally {
    await cleanup();
  }
});
