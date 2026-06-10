import test from "node:test";
import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appState } from "./state.mjs";
import { buildProjectPublishDemoBundle } from "./publishDemoBundle.mjs";
import { makeProject } from "./previewTestHelpers.mjs";

test("publish demo bundle includes static entry dependencies and binary assets", async () => {
  const { project, cleanup } = await makeProject("vibyra-publish-demo-");
  const previousProjects = appState.cachedProjects;
  appState.cachedProjects = [project];
  try {
    await mkdir(join(project.path, "dist", "assets"), { recursive: true });
    await mkdir(join(project.path, "dist", "models"), { recursive: true });
    await writeFile(join(project.path, "dist", "index.html"), [
      "<!doctype html><html><head>",
      "<link rel=\"stylesheet\" href=\"/assets/app.css\">",
      "</head><body><img src=\"/assets/logo.png\"><script type=\"module\" src=\"./assets/app.js\"></script></body></html>"
    ].join(""));
    await writeFile(join(project.path, "dist", "assets", "app.css"), "body{background:url('/assets/bg.webp')}");
    await writeFile(join(project.path, "dist", "assets", "app.js"), "const model = '/models/level.glb'; import('./chunk.mjs');");
    await writeFile(join(project.path, "dist", "assets", "chunk.mjs"), "export const ready = true;");
    await writeFile(join(project.path, "dist", "assets", "logo.png"), Buffer.from([1, 2, 3]));
    await writeFile(join(project.path, "dist", "assets", "bg.webp"), Buffer.from([4, 5, 6]));
    await writeFile(join(project.path, "dist", "models", "level.glb"), Buffer.from([7, 8, 9]));

    const result = await buildProjectPublishDemoBundle(project.id);
    assert.equal(result.ok, true);
    assert.equal(result.entryPath, "dist/index.html");
    assert.equal(result.mountDirectory, "dist");
    assert.deepEqual(result.files.map((file) => file.path).sort(), [
      "dist/assets/app.css",
      "dist/assets/app.js",
      "dist/assets/bg.webp",
      "dist/assets/chunk.mjs",
      "dist/assets/logo.png",
      "dist/index.html",
      "dist/models/level.glb"
    ]);
    assert.equal(result.files.find((file) => file.path.endsWith("logo.png"))?.encoding, "base64");
    assert.equal(result.metadata.totalFiles, 7);
    assert.equal(result.metadata.truncated, false);
  } finally {
    appState.cachedProjects = previousProjects;
    await cleanup();
  }
});

test("publish demo bundle skips env, credential, and unsafe directory references", async () => {
  const { project, cleanup } = await makeProject("vibyra-publish-safe-");
  const previousProjects = appState.cachedProjects;
  appState.cachedProjects = [project];
  try {
    await mkdir(join(project.path, "node_modules", "bad"), { recursive: true });
    await writeFile(join(project.path, "index.html"), "<script src=\"app.js\"></script><script src=\"/.env\"></script><script src=\"/node_modules/bad/secret.js\"></script>");
    await writeFile(join(project.path, "app.js"), "console.log('ok')");
    await writeFile(join(project.path, ".env"), "SECRET=yes");
    await writeFile(join(project.path, "node_modules", "bad", "secret.js"), "console.log('secret')");

    const result = await buildProjectPublishDemoBundle(project.id);
    assert.equal(result.ok, true);
    assert.deepEqual(result.files.map((file) => file.path).sort(), ["app.js", "index.html"]);
    assert.equal(result.metadata.skipped.some((item) => item.path === ".env" && item.reason === "env_or_credential_file"), true);
    assert.equal(result.metadata.skipped.some((item) => item.path === "node_modules/bad/secret.js"), true);
  } finally {
    appState.cachedProjects = previousProjects;
    await cleanup();
  }
});

test("publish demo bundle rejects source-only Vite entries", async () => {
  const { project, cleanup } = await makeProject("vibyra-publish-source-");
  const previousProjects = appState.cachedProjects;
  appState.cachedProjects = [project];
  try {
    await writeFile(join(project.path, "index.html"), "<div id=\"root\"></div><script type=\"module\" src=\"/src/main.jsx\"></script>");
    const result = await buildProjectPublishDemoBundle(project.id);
    assert.equal(result.ok, false);
    assert.equal(result.code, "missing_build_script");
    assert.match(result.reason, /build script/i);
    assert.deepEqual(result.files, []);
  } finally {
    appState.cachedProjects = previousProjects;
    await cleanup();
  }
});

test("publish demo bundle runs build script when no built entry exists", async () => {
  const { project, cleanup } = await makeProject("vibyra-publish-build-");
  const previousProjects = appState.cachedProjects;
  appState.cachedProjects = [project];
  try {
    await writeFile(join(project.path, "package.json"), JSON.stringify({
      scripts: { build: "node build.mjs" }
    }));
    await writeFile(join(project.path, "index.html"), "<div id=\"root\"></div><script type=\"module\" src=\"/src/main.jsx\"></script>");
    await writeFile(join(project.path, "build.mjs"), [
      "import { mkdir, writeFile } from 'node:fs/promises';",
      "await mkdir('dist/assets', { recursive: true });",
      "await writeFile('dist/index.html', '<!doctype html><html><body><script type=\"module\" src=\"/assets/app.js\"></script></body></html>');",
      "await writeFile('dist/assets/app.js', 'document.body.dataset.ready = \"true\";');"
    ].join("\n"));

    const result = await buildProjectPublishDemoBundle(project.id, { buildTimeoutMs: 15000 });
    assert.equal(result.ok, true);
    assert.equal(result.entryPath, "dist/index.html");
    assert.equal(result.metadata.autoBuild.code, "build_ok");
    assert.deepEqual(result.files.map((file) => file.path).sort(), ["dist/assets/app.js", "dist/index.html"]);
  } finally {
    appState.cachedProjects = previousProjects;
    await cleanup();
  }
});

test("publish demo bundle builds a recognized nested frontend package", async () => {
  const { project, cleanup } = await makeProject("vibyra-publish-nested-build-");
  const previousProjects = appState.cachedProjects;
  appState.cachedProjects = [project];
  try {
    await mkdir(join(project.path, "frontend"), { recursive: true });
    await writeFile(join(project.path, "frontend", "package.json"), JSON.stringify({
      scripts: { build: "node build.mjs" }
    }));
    await writeFile(join(project.path, "frontend", "index.html"), "<div id=\"root\"></div><script type=\"module\" src=\"/src/main.tsx\"></script>");
    await writeFile(join(project.path, "frontend", "build.mjs"), [
      "import { mkdir, writeFile } from 'node:fs/promises';",
      "await mkdir('dist/assets', { recursive: true });",
      "await writeFile('dist/index.html', '<!doctype html><html><body><script type=\"module\" src=\"/assets/app.js\"></script></body></html>');",
      "await writeFile('dist/assets/app.js', 'document.body.dataset.nested = \"true\";');"
    ].join("\n"));

    const result = await buildProjectPublishDemoBundle(project.id, { buildTimeoutMs: 15000 });
    assert.equal(result.ok, true);
    assert.equal(result.entryPath, "frontend/dist/index.html");
    assert.equal(result.metadata.buildDirectory, "frontend");
    assert.equal(result.metadata.autoBuild.cwd, "frontend");
    assert.equal(result.metadata.autoBuild.code, "build_ok");
    assert.deepEqual(result.files.map((file) => file.path).sort(), [
      "frontend/dist/assets/app.js",
      "frontend/dist/index.html"
    ]);
  } finally {
    appState.cachedProjects = previousProjects;
    await cleanup();
  }
});

test("publish demo bundle prefers a nested React frontend over a Laravel root package", async () => {
  const { project, cleanup } = await makeProject("vibyra-publish-full-stack-");
  const previousProjects = appState.cachedProjects;
  appState.cachedProjects = [project];
  try {
    await mkdir(join(project.path, "frontend"), { recursive: true });
    await writeFile(join(project.path, "composer.json"), JSON.stringify({
      require: { "laravel/framework": "^13.0" }
    }));
    await writeFile(join(project.path, "package.json"), JSON.stringify({
      scripts: { build: "node -e \"process.exit(41)\"" }
    }));
    await writeFile(join(project.path, "frontend", "package.json"), JSON.stringify({
      scripts: { build: "node build.mjs" }
    }));
    await writeFile(join(project.path, "frontend", "index.html"), "<div id=\"root\"></div><script type=\"module\" src=\"/src/main.tsx\"></script>");
    await writeFile(join(project.path, "frontend", "build.mjs"), [
      "import { mkdir, writeFile } from 'node:fs/promises';",
      "await mkdir('dist/assets', { recursive: true });",
      "await writeFile('dist/index.html', '<!doctype html><html><body><script type=\"module\" src=\"/assets/app.js\"></script></body></html>');",
      "await writeFile('dist/assets/app.js', 'document.body.dataset.fullStack = \"ready\";');"
    ].join("\n"));

    const result = await buildProjectPublishDemoBundle(project.id, { buildTimeoutMs: 15000 });
    assert.equal(result.ok, true);
    assert.equal(result.metadata.buildDirectory, "frontend");
    assert.equal(result.entryPath, "frontend/dist/index.html");
    assert.deepEqual(result.files.map((file) => file.path).sort(), [
      "frontend/dist/assets/app.js",
      "frontend/dist/index.html"
    ]);
  } finally {
    appState.cachedProjects = previousProjects;
    await cleanup();
  }
});

test("publish demo bundle installs missing dependencies before building", async () => {
  const { project, cleanup } = await makeProject("vibyra-publish-install-");
  const fakeNpm = await makeFakePublishNpm();
  const previousProjects = appState.cachedProjects;
  const previousPath = process.env.PATH;
  appState.cachedProjects = [project];
  process.env.PATH = `${fakeNpm.bin}:${previousPath ?? ""}`;
  try {
    await writeFile(join(project.path, "package.json"), JSON.stringify({
      scripts: { build: "node build.mjs" },
      dependencies: { vite: "latest" }
    }));
    await writeFile(join(project.path, "index.html"), "<div id=\"root\"></div><script type=\"module\" src=\"/src/main.jsx\"></script>");
    await writeFile(join(project.path, "build.mjs"), [
      "import { existsSync } from 'node:fs';",
      "import { mkdir, writeFile } from 'node:fs/promises';",
      "if (!existsSync('node_modules/vite')) throw new Error('dependencies were not installed');",
      "await mkdir('dist/assets', { recursive: true });",
      "await writeFile('dist/index.html', '<!doctype html><html><body><script type=\"module\" src=\"/assets/app.js\"></script></body></html>');",
      "await writeFile('dist/assets/app.js', 'document.body.dataset.installed = \"true\";');"
    ].join("\n"));

    const result = await buildProjectPublishDemoBundle(project.id, { buildTimeoutMs: 15000, installTimeoutMs: 15000 });
    assert.equal(result.ok, true);
    assert.equal(result.metadata.autoInstall.code, "install_ok");
    assert.equal(result.metadata.autoInstall.ignoreScripts, true);
    assert.match(result.metadata.autoInstall.command, /^npm install --ignore-scripts$/);
    assert.equal(result.metadata.autoBuild.code, "build_ok");
    assert.deepEqual(result.files.map((file) => file.path).sort(), ["dist/assets/app.js", "dist/index.html"]);
  } finally {
    process.env.PATH = previousPath;
    appState.cachedProjects = previousProjects;
    await fakeNpm.cleanup();
    await cleanup();
  }
});

test("publish demo bundle reports install failure before build", async () => {
  const { project, cleanup } = await makeProject("vibyra-publish-install-fail-");
  const fakeNpm = await makeFakePublishNpm({ installExitCode: 17 });
  const previousProjects = appState.cachedProjects;
  const previousPath = process.env.PATH;
  appState.cachedProjects = [project];
  process.env.PATH = `${fakeNpm.bin}:${previousPath ?? ""}`;
  try {
    await writeFile(join(project.path, "package.json"), JSON.stringify({
      scripts: { build: "node build.mjs" },
      dependencies: { vite: "latest" }
    }));
    await writeFile(join(project.path, "index.html"), "<div id=\"root\"></div><script type=\"module\" src=\"/src/main.jsx\"></script>");
    await writeFile(join(project.path, "build.mjs"), "throw new Error('build should not run');");

    const result = await buildProjectPublishDemoBundle(project.id, { buildTimeoutMs: 15000, installTimeoutMs: 15000 });
    assert.equal(result.ok, false);
    assert.equal(result.code, "dependency_install_failed");
    assert.match(result.reason, /dependency installation failed/i);
    assert.equal(result.metadata.autoInstall.code, "install_failed");
    assert.equal(result.metadata.autoBuild, undefined);
    assert.equal(result.metadata.warnings.some((warning) => warning.code === "install_failed"), true);
  } finally {
    process.env.PATH = previousPath;
    appState.cachedProjects = previousProjects;
    await fakeNpm.cleanup();
    await cleanup();
  }
});

test("publish demo bundle skips dependency install when node_modules exists", async () => {
  const { project, cleanup } = await makeProject("vibyra-publish-installed-");
  const previousProjects = appState.cachedProjects;
  appState.cachedProjects = [project];
  try {
    await mkdir(join(project.path, "node_modules", "vite"), { recursive: true });
    await writeFile(join(project.path, "package.json"), JSON.stringify({
      scripts: { build: "node build.mjs" },
      dependencies: { vite: "latest" }
    }));
    await writeFile(join(project.path, "index.html"), "<div id=\"root\"></div><script type=\"module\" src=\"/src/main.jsx\"></script>");
    await writeFile(join(project.path, "build.mjs"), [
      "import { mkdir, writeFile } from 'node:fs/promises';",
      "await mkdir('dist', { recursive: true });",
      "await writeFile('dist/index.html', '<!doctype html><html><body>Installed</body></html>');"
    ].join("\n"));

    const result = await buildProjectPublishDemoBundle(project.id, { buildTimeoutMs: 15000, installTimeoutMs: 15000 });
    assert.equal(result.ok, true);
    assert.deepEqual(result.metadata.autoInstall, { skipped: true, reason: "dependencies_present" });
    assert.equal(result.metadata.autoBuild.code, "build_ok");
  } finally {
    appState.cachedProjects = previousProjects;
    await cleanup();
  }
});

test("publish demo bundle returns the frontend build error instead of hiding it", async () => {
  const { project, cleanup } = await makeProject("vibyra-publish-build-fail-");
  const previousProjects = appState.cachedProjects;
  appState.cachedProjects = [project];
  try {
    await writeFile(join(project.path, "package.json"), JSON.stringify({
      scripts: { build: "node build.mjs" }
    }));
    await writeFile(join(project.path, "index.html"), "<div id=\"root\"></div><script type=\"module\" src=\"/src/main.jsx\"></script>");
    await writeFile(join(project.path, "build.mjs"), "throw new Error('Vite could not resolve src/missing.jsx');");

    const result = await buildProjectPublishDemoBundle(project.id, { buildTimeoutMs: 15000 });
    assert.equal(result.ok, false);
    assert.equal(result.code, "frontend_build_failed");
    assert.match(result.reason, /Vite could not resolve src\/missing\.jsx/);
    assert.equal(result.metadata.autoBuild.code, "build_failed");
  } finally {
    appState.cachedProjects = previousProjects;
    await cleanup();
  }
});

test("publish demo bundle reports when a successful build creates no browser output", async () => {
  const { project, cleanup } = await makeProject("vibyra-publish-output-missing-");
  const previousProjects = appState.cachedProjects;
  appState.cachedProjects = [project];
  try {
    await writeFile(join(project.path, "package.json"), JSON.stringify({
      scripts: { build: "node -e \"process.exit(0)\"" }
    }));
    await writeFile(join(project.path, "index.html"), "<div id=\"root\"></div><script type=\"module\" src=\"/src/main.jsx\"></script>");

    const result = await buildProjectPublishDemoBundle(project.id, { buildTimeoutMs: 15000 });
    assert.equal(result.ok, false);
    assert.equal(result.code, "build_output_missing");
    assert.match(result.reason, /did not create a supported static index\.html/i);
    assert.equal(result.metadata.autoBuild.code, "build_ok");
  } finally {
    appState.cachedProjects = previousProjects;
    await cleanup();
  }
});

test("publish demo bundle explains when automatic building is disabled", async () => {
  const { project, cleanup } = await makeProject("vibyra-publish-build-disabled-");
  const previousProjects = appState.cachedProjects;
  appState.cachedProjects = [project];
  try {
    await writeFile(join(project.path, "package.json"), JSON.stringify({
      scripts: { build: "node build.mjs" }
    }));
    await writeFile(join(project.path, "index.html"), "<div id=\"root\"></div><script type=\"module\" src=\"/src/main.jsx\"></script>");

    const result = await buildProjectPublishDemoBundle(project.id, { autoBuild: false });
    assert.equal(result.ok, false);
    assert.equal(result.code, "static_preview_not_built");
    assert.match(result.reason, /enable automatic building/i);
    assert.equal(result.metadata.autoBuild, undefined);
  } finally {
    appState.cachedProjects = previousProjects;
    await cleanup();
  }
});

test("publish demo bundle creates a Laravel Vite Inertia static shell from manifest assets", async () => {
  const { project, cleanup } = await makeProject("vibyra-publish-laravel-vite-");
  const previousProjects = appState.cachedProjects;
  appState.cachedProjects = [project];
  try {
    await mkdir(join(project.path, "public", "build", "assets"), { recursive: true });
    await mkdir(join(project.path, "public", "videos"), { recursive: true });
    await mkdir(join(project.path, "resources", "js", "Pages"), { recursive: true });
    await writeFile(join(project.path, "composer.json"), JSON.stringify({ require: { "laravel/framework": "^13.0" } }));
    await writeFile(join(project.path, "package.json"), JSON.stringify({ devDependencies: { "laravel-vite-plugin": "latest", vite: "latest" } }));
    await writeFile(join(project.path, "public", "build", "manifest.json"), JSON.stringify({
      "resources/js/app.tsx": {
        file: "assets/app-123.js",
        isEntry: true,
        css: ["assets/app-123.css"],
        dynamicImports: ["resources/js/Pages/HomeLanding.tsx"]
      },
      "resources/js/Pages/HomeLanding.tsx": {
        file: "assets/HomeLanding-456.js"
      }
    }));
    await writeFile(join(project.path, "public", "build", "assets", "app-123.js"), "import('./HomeLanding-456.js'); const logo='/videos/logo.mp4';");
    await writeFile(join(project.path, "public", "build", "assets", "app-123.css"), "body{background:url('/videos/logo.mp4')}");
    await writeFile(join(project.path, "public", "build", "assets", "HomeLanding-456.js"), "export default function HomeLanding(){}");
    await writeFile(join(project.path, "public", "videos", "logo.mp4"), Buffer.from([1, 2, 3]));
    await writeFile(join(project.path, "resources", "js", "Pages", "HomeLanding.tsx"), "source should not be bundled");

    const result = await buildProjectPublishDemoBundle(project.id);
    assert.equal(result.ok, true);
    assert.equal(result.entryPath, "index.html");
    assert.equal(result.mountDirectory, "");
    assert.equal(result.metadata.kind, "laravel-vite-static-shell");
    assert.equal(result.metadata.pageComponent, "HomeLanding");
    assert.deepEqual(result.files.map((file) => file.path).sort(), [
      "build/assets/HomeLanding-456.js",
      "build/assets/app-123.css",
      "build/assets/app-123.js",
      "index.html",
      "videos/logo.mp4"
    ]);
    const html = result.files.find((file) => file.path === "index.html")?.body ?? "";
    assert.match(html, /data-page=/);
    assert.match(html, /HomeLanding/);
    assert.match(html, /\/build\/assets\/app-123\.js/);
    assert.equal(result.files.some((file) => file.path.startsWith("resources/")), false);
    assert.equal(result.files.find((file) => file.path === "videos/logo.mp4")?.encoding, "base64");
  } finally {
    appState.cachedProjects = previousProjects;
    await cleanup();
  }
});

test("publish demo bundle keeps Laravel private and backend files out of static shell bundles", async () => {
  const { project, cleanup } = await makeProject("vibyra-publish-laravel-private-");
  const previousProjects = appState.cachedProjects;
  appState.cachedProjects = [project];
  try {
    await mkdir(join(project.path, "public", "build", "assets"), { recursive: true });
    await mkdir(join(project.path, "public", "vendor"), { recursive: true });
    await mkdir(join(project.path, "database"), { recursive: true });
    await writeFile(join(project.path, "composer.json"), JSON.stringify({ require: { "laravel/framework": "^13.0" } }));
    await writeFile(join(project.path, "package.json"), JSON.stringify({ devDependencies: { "laravel-vite-plugin": "latest", vite: "latest" } }));
    await writeFile(join(project.path, ".env"), "APP_KEY=secret");
    await writeFile(join(project.path, "database", "database.sqlite"), "private db");
    await writeFile(join(project.path, "public", "vendor", "secret.js"), "private vendor");
    await writeFile(join(project.path, "public", "build", "manifest.json"), JSON.stringify({
      "resources/js/app.tsx": {
        file: "assets/app.js",
        isEntry: true,
        dynamicImports: ["resources/js/Pages/Welcome.tsx"]
      },
      "resources/js/Pages/Welcome.tsx": {
        file: "assets/Welcome.js"
      }
    }));
    await writeFile(join(project.path, "public", "build", "assets", "app.js"), "import('./Welcome.js'); const env='/.env'; const db='/database/database.sqlite'; const vendor='/vendor/secret.js';");
    await writeFile(join(project.path, "public", "build", "assets", "Welcome.js"), "export default function Welcome(){}");

    const result = await buildProjectPublishDemoBundle(project.id);
    assert.equal(result.ok, true);
    assert.deepEqual(result.files.map((file) => file.path).sort(), [
      "build/assets/Welcome.js",
      "build/assets/app.js",
      "index.html"
    ]);
    assert.equal(result.files.some((file) => file.path.includes(".env") || file.path.includes("database")), false);
    assert.equal(result.metadata.skipped.some((item) => item.path === "vendor/secret.js" && item.reason === "unsafe_or_private_directory"), true);
  } finally {
    appState.cachedProjects = previousProjects;
    await cleanup();
  }
});

test("publish demo bundle fails clearly when required dependencies exceed caps", async () => {
  const { project, cleanup } = await makeProject("vibyra-publish-cap-");
  const previousProjects = appState.cachedProjects;
  appState.cachedProjects = [project];
  try {
    await writeFile(join(project.path, "index.html"), "<script src=\"app.js\"></script>");
    await writeFile(join(project.path, "app.js"), "x".repeat(200));
    const result = await buildProjectPublishDemoBundle(project.id, { limits: { maxTotalBytes: 120 } });
    assert.equal(result.ok, false);
    assert.equal(result.code, "bundle_limit_exceeded");
    assert.match(result.reason, /bundle limit reached/i);
    assert.deepEqual(result.files, []);
  } finally {
    appState.cachedProjects = previousProjects;
    await cleanup();
  }
});

test("publish demo bundle reports the asset and per-file size limit", async () => {
  const { project, cleanup } = await makeProject("vibyra-publish-file-size-");
  const previousProjects = appState.cachedProjects;
  appState.cachedProjects = [project];
  try {
    await writeFile(join(project.path, "index.html"), "<script src=\"app.js\"></script>");
    await writeFile(join(project.path, "app.js"), "x".repeat(200));

    const result = await buildProjectPublishDemoBundle(project.id, { limits: { maxFileBytes: 100 } });
    assert.equal(result.ok, false);
    assert.equal(result.code, "bundle_file_too_large");
    assert.match(result.reason, /app\.js is 200 bytes/);
    assert.match(result.reason, /100 bytes per-file hosting limit/);
  } finally {
    appState.cachedProjects = previousProjects;
    await cleanup();
  }
});

test("publish demo bundle rejects missing required local references", async () => {
  const { project, cleanup } = await makeProject("vibyra-publish-missing-ref-");
  const previousProjects = appState.cachedProjects;
  appState.cachedProjects = [project];
  try {
    await writeFile(join(project.path, "index.html"), "<img src=\"assets/missing.png\">");

    const result = await buildProjectPublishDemoBundle(project.id);
    assert.equal(result.ok, false);
    assert.equal(result.code, "missing_static_reference");
    assert.match(result.reason, /assets\/missing\.png/);
    assert.deepEqual(result.files, []);
    assert.deepEqual(
      result.metadata.skipped.find((item) => item.path === "assets/missing.png"),
      { path: "assets/missing.png", reason: "missing_reference", from: "index.html" }
    );
  } finally {
    appState.cachedProjects = previousProjects;
    await cleanup();
  }
});

test("publish demo bundle returns a structured failure when no project is selected", async () => {
  const result = await buildProjectPublishDemoBundle("");
  assert.equal(result.ok, false);
  assert.equal(result.code, "no_project_selected");
  assert.match(result.reason, /Browse PC/);
  assert.deepEqual(result.files, []);
});

test("publish demo bundle fails and reports optional file cap truncation", async () => {
  const { project, cleanup } = await makeProject("vibyra-publish-file-cap-");
  const previousProjects = appState.cachedProjects;
  appState.cachedProjects = [project];
  try {
    await mkdir(join(project.path, "assets"), { recursive: true });
    await writeFile(join(project.path, "index.html"), "<main>Demo</main>");
    await writeFile(join(project.path, "assets", "a.png"), Buffer.from([1]));
    await writeFile(join(project.path, "assets", "b.png"), Buffer.from([2]));

    const result = await buildProjectPublishDemoBundle(project.id, { limits: { maxFiles: 2 } });
    assert.equal(result.ok, false);
    assert.equal(result.code, "bundle_limit_exceeded");
    assert.equal(result.metadata.truncated, true);
    assert.equal(result.metadata.skipped.some((item) => item.reason === "bundle_limit_reached"), true);
  } finally {
    appState.cachedProjects = previousProjects;
    await cleanup();
  }
});

async function makeFakePublishNpm({ installExitCode = 0 } = {}) {
  const bin = await mkdtemp(join(tmpdir(), "vibyra-fake-publish-npm-"));
  const npmPath = join(bin, "npm");
  await writeFile(npmPath, [
    "#!/usr/bin/env node",
    "import { spawn } from 'node:child_process';",
    "import { mkdir } from 'node:fs/promises';",
    "const args = process.argv.slice(2);",
    "if (args[0] === 'install' || args[0] === 'ci') {",
    `  if (${Number(installExitCode)} !== 0) process.exit(${Number(installExitCode)});`,
    "  await mkdir('node_modules/vite', { recursive: true });",
    "  process.exit(0);",
    "}",
    "if (args[0] === 'run' && args[1] === 'build') {",
    "  const child = spawn(process.execPath, ['build.mjs'], { stdio: 'inherit' });",
    "  child.on('close', (code) => process.exit(code ?? 1));",
    "  child.on('error', () => process.exit(1));",
    "} else {",
    "  process.exit(1);",
    "}"
  ].join("\n"));
  await chmod(npmPath, 0o755);
  return { bin, cleanup: () => rm(bin, { recursive: true, force: true }) };
}
