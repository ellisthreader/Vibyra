import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { appState, TOKEN } from "./state.mjs";
import { serveProjectPreview } from "./preview.mjs";
import { STATIC_PREVIEW_ENTRIES } from "./previewResolver.mjs";

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

test("desktop preview skips source-only Vite root entries", async () => {
  const { project, cleanup } = await makeProject("vibyra-preview-source-");
  try {
    await mkdir(join(project.path, "src"), { recursive: true });
    await writeFile(join(project.path, "index.html"), '<!doctype html><html><body><script data-entry="app" type="module" src="/src/custom-entry.tsx"></script></body></html>');
    await writeFile(join(project.path, "src", "custom-entry.tsx"), "console.log('source only');");

    const response = await requestPreview(project);
    assert.equal(response.status, 200);
    assert.match(response.body, /Project analyzed/);
    assert.doesNotMatch(response.body, /custom-entry/);
  } finally {
    await cleanup();
  }
});

test("desktop preview skips source-only Vite entries in non-build roots", async () => {
  for (const entry of ["web/index.html", "app/index.html"]) {
    const { project, cleanup } = await makeProject(`vibyra-preview-source-${entry.replace(/[^a-z0-9]+/gi, "-")}`);
    try {
      await mkdir(join(project.path, dirname(entry), "src"), { recursive: true });
      await writeFile(join(project.path, entry), '<!doctype html><html><body><script type="module" src="/src/main.tsx"></script></body></html>');
      await writeFile(join(project.path, dirname(entry), "src", "main.tsx"), "console.log('source only');");

      const response = await requestPreview(project);
      assert.equal(response.status, 200);
      assert.match(response.body, /Project analyzed/);
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

async function makeProject(prefix) {
  const path = await mkdtemp(join(tmpdir(), prefix));
  const project = {
    id: Buffer.from(path).toString("base64url"),
    name: prefix.replace(/-$/, ""),
    path,
    stack: "Node / React",
    updated: "Now",
    source: "desktop",
    analysis: { summary: "Test project" }
  };
  return { project, cleanup: () => rm(path, { recursive: true, force: true }) };
}

async function requestPreview(project, path = "", { cacheProject = true } = {}) {
  const previousProjects = appState.cachedProjects;
  appState.cachedProjects = cacheProject ? [project] : [];
  try {
    const url = new URL(`/preview/project/${encodeURIComponent(project.id)}/${encodeURIComponent(TOKEN)}/${path}`, "http://vibyra.test");
    const response = { status: 0, headers: {}, body: "" };
    const res = {
      writeHead(status, headers) {
        response.status = status;
        response.headers = headers;
      },
      end(body) {
        response.body = Buffer.isBuffer(body) ? body.toString("utf8") : String(body ?? "");
      }
    };
    await serveProjectPreview(res, url);
    return response;
  } finally {
    appState.cachedProjects = previousProjects;
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
