import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { appState } from "./state.mjs";
import { makeProject } from "./previewTestHelpers.mjs";
import { buildProjectPublishRuntimeBundle } from "./publishRuntimeBundle.mjs";

test("publish runtime bundle includes safe Node server source", async () => {
  const { project, cleanup } = await makeProject("vibyra-runtime-node-");
  const previousProjects = appState.cachedProjects;
  appState.cachedProjects = [project];
  try {
    await mkdir(join(project.path, "src"), { recursive: true });
    await writeFile(join(project.path, "package.json"), JSON.stringify({
      scripts: { build: "tsc", start: "node dist/server.js" },
      dependencies: { express: "latest" }
    }));
    await writeFile(join(project.path, "src", "server.ts"), "import express from 'express';");
    await writeFile(join(project.path, ".env"), "SECRET=yes");
    await writeFile(join(project.path, "private-key.pem"), "secret");

    const result = await buildProjectPublishRuntimeBundle(project.id);
    assert.equal(result.ok, true);
    assert.equal(result.platform, "node");
    assert.equal(result.needsRuntime, true);
    assert.equal(result.buildCommand, "npm run build");
    assert.equal(result.startCommand, "npm run start");
    assert.deepEqual(result.files.map((file) => file.path).sort(), ["package.json", "src/server.ts"]);
    assert.equal(result.metadata.skipped.some((item) => item.path === ".env"), true);
    assert.equal(result.metadata.skipped.some((item) => item.path === "private-key.pem"), true);
  } finally {
    appState.cachedProjects = previousProjects;
    await cleanup();
  }
});

test("publish runtime bundle rejects frontend-only packages", async () => {
  const { project, cleanup } = await makeProject("vibyra-runtime-static-");
  const previousProjects = appState.cachedProjects;
  appState.cachedProjects = [project];
  try {
    await writeFile(join(project.path, "package.json"), JSON.stringify({
      scripts: { build: "vite build" },
      dependencies: { vite: "latest", react: "latest" }
    }));

    const result = await buildProjectPublishRuntimeBundle(project.id);
    assert.equal(result.ok, false);
    assert.equal(result.code, "unsupported_runtime");
    assert.match(result.reason, /frontend-only Node package/i);
    assert.match(result.reason, /folder that contains its backend/i);
  } finally {
    appState.cachedProjects = previousProjects;
    await cleanup();
  }
});

test("publish runtime bundle reports unsupported backend runtimes precisely", async () => {
  const { project, cleanup } = await makeProject("vibyra-runtime-rails-");
  const previousProjects = appState.cachedProjects;
  appState.cachedProjects = [project];
  try {
    await writeFile(join(project.path, "Gemfile"), "gem 'rails', '~> 8.0'\n");

    const result = await buildProjectPublishRuntimeBundle(project.id);
    assert.equal(result.ok, false);
    assert.equal(result.code, "unsupported_runtime");
    assert.match(result.reason, /Ruby\/Rails runtime hosting is not supported/i);
    assert.match(result.reason, /Node servers, Laravel, Django, FastAPI, or Flask/i);
  } finally {
    appState.cachedProjects = previousProjects;
    await cleanup();
  }
});

test("publish runtime bundle rejects detected servers without a start command", async () => {
  const { project, cleanup } = await makeProject("vibyra-runtime-no-start-");
  const previousProjects = appState.cachedProjects;
  appState.cachedProjects = [project];
  try {
    await writeFile(join(project.path, "package.json"), JSON.stringify({
      dependencies: { express: "latest" }
    }));

    const result = await buildProjectPublishRuntimeBundle(project.id);
    assert.equal(result.ok, false);
    assert.equal(result.code, "missing_runtime_start_command");
    assert.match(result.reason, /runnable start command/i);
  } finally {
    appState.cachedProjects = previousProjects;
    await cleanup();
  }
});

test("publish runtime bundle does not invent a missing Next.js start script", async () => {
  const { project, cleanup } = await makeProject("vibyra-runtime-next-no-start-");
  const previousProjects = appState.cachedProjects;
  appState.cachedProjects = [project];
  try {
    await writeFile(join(project.path, "package.json"), JSON.stringify({
      scripts: { build: "next build" },
      dependencies: { next: "latest" }
    }));

    const result = await buildProjectPublishRuntimeBundle(project.id);
    assert.equal(result.ok, false);
    assert.equal(result.code, "missing_runtime_start_command");
  } finally {
    appState.cachedProjects = previousProjects;
    await cleanup();
  }
});

test("publish runtime bundle fails and reports file cap truncation", async () => {
  const { project, cleanup } = await makeProject("vibyra-runtime-file-cap-");
  const previousProjects = appState.cachedProjects;
  appState.cachedProjects = [project];
  try {
    await mkdir(join(project.path, "src"), { recursive: true });
    await writeFile(join(project.path, "package.json"), JSON.stringify({
      scripts: { start: "node src/server.js" },
      dependencies: { express: "latest" }
    }));
    await writeFile(join(project.path, "src", "server.js"), "console.log('server');");

    const result = await buildProjectPublishRuntimeBundle(project.id, { limits: { maxFiles: 1 } });
    assert.equal(result.ok, false);
    assert.equal(result.code, "runtime_bundle_limit_exceeded");
    assert.equal(result.reason, "This project is too large for Vibyra hosting, so we can’t host it. Open a smaller app folder or remove unnecessary files, then try again.");
    assert.equal(result.metadata.truncated, true);
    assert.equal(result.metadata.skipped.some((item) => item.reason === "bundle_limit_reached"), true);
  } finally {
    appState.cachedProjects = previousProjects;
    await cleanup();
  }
});

test("publish runtime bundle discovers a nested backend without bundling the frontend", async () => {
  const { project, cleanup } = await makeProject("vibyra-runtime-nested-");
  const previousProjects = appState.cachedProjects;
  appState.cachedProjects = [project];
  try {
    await mkdir(join(project.path, "frontend"), { recursive: true });
    await mkdir(join(project.path, "backend", "src"), { recursive: true });
    await writeFile(join(project.path, "frontend", "package.json"), JSON.stringify({
      scripts: { build: "vite build" },
      dependencies: { vite: "latest" }
    }));
    await writeFile(join(project.path, "backend", "package.json"), JSON.stringify({
      scripts: { start: "node src/server.js" },
      dependencies: { express: "latest" }
    }));
    await writeFile(join(project.path, "backend", "src", "server.js"), "console.log('api');");

    const result = await buildProjectPublishRuntimeBundle(project.id);
    assert.equal(result.ok, true);
    assert.equal(result.platform, "node");
    assert.equal(result.metadata.runtimeDirectory, "backend");
    assert.deepEqual(result.files.map((file) => file.path).sort(), ["package.json", "src/server.js"]);
  } finally {
    appState.cachedProjects = previousProjects;
    await cleanup();
  }
});

test("publish runtime bundle prefers and rebases nested Laravel under a React parent", async () => {
  const { project, cleanup } = await makeProject("vibyra-runtime-react-laravel-parent-");
  const previousProjects = appState.cachedProjects;
  appState.cachedProjects = [project];
  try {
    await mkdir(join(project.path, "src"), { recursive: true });
    await mkdir(join(project.path, "backend", "app", "Http", "Controllers"), { recursive: true });
    await mkdir(join(project.path, "backend", "bootstrap"), { recursive: true });
    await mkdir(join(project.path, "backend", "config"), { recursive: true });
    await mkdir(join(project.path, "backend", "public", "build", "assets"), { recursive: true });
    await mkdir(join(project.path, "backend", "resources", "views"), { recursive: true });
    await mkdir(join(project.path, "backend", "routes"), { recursive: true });
    await writeFile(join(project.path, "package.json"), JSON.stringify({
      scripts: { start: "npm run dev", dev: "./scripts/start-dev.sh" },
      dependencies: { expo: "latest", react: "latest", "react-native": "latest" }
    }));
    await writeFile(join(project.path, "src", "App.tsx"), "export default function App() {}");
    await writeFile(join(project.path, "backend", "composer.json"), JSON.stringify({
      require: { "laravel/framework": "^13.0" }
    }));
    await writeFile(join(project.path, "backend", "package.json"), JSON.stringify({
      dependencies: { react: "latest" },
      devDependencies: { "laravel-vite-plugin": "latest", vite: "latest" }
    }));
    await writeFile(join(project.path, "backend", "artisan"), "#!/usr/bin/env php\n");
    await writeFile(join(project.path, "backend", "bootstrap", "app.php"), "<?php return [];\n");
    await writeFile(join(project.path, "backend", "config", "app.php"), "<?php return [];\n");
    await writeFile(join(project.path, "backend", "public", "index.php"), "<?php\n");
    await writeFile(join(project.path, "backend", "public", "build", "manifest.json"), JSON.stringify({
      "resources/js/app.tsx": { file: "assets/app.js", isEntry: true }
    }));
    await writeFile(join(project.path, "backend", "public", "build", "assets", "app.js"), "document.body.dataset.live = 'true';");
    await writeFile(join(project.path, "backend", "resources", "views", "app.blade.php"), "<div id=\"app\"></div>");
    await writeFile(join(project.path, "backend", "routes", "web.php"), "<?php\n");

    const result = await buildProjectPublishRuntimeBundle(project.id);
    const paths = result.files.map((file) => file.path).sort();
    assert.equal(result.ok, true);
    assert.equal(result.platform, "laravel");
    assert.equal(result.metadata.runtimeDirectory, "backend");
    assert.equal(paths.includes("composer.json"), true);
    assert.equal(paths.includes("public/build/manifest.json"), true);
    assert.equal(paths.includes("public/build/assets/app.js"), true);
    assert.equal(paths.some((path) => path.startsWith("backend/")), false);
    assert.equal(paths.includes("package.json"), false);
    assert.equal(paths.includes("src/App.tsx"), false);
  } finally {
    appState.cachedProjects = previousProjects;
    await cleanup();
  }
});

test("publish runtime bundle supports a nested FastAPI backend", async () => {
  const { project, cleanup } = await makeProject("vibyra-runtime-python-");
  const previousProjects = appState.cachedProjects;
  appState.cachedProjects = [project];
  try {
    await mkdir(join(project.path, "backend", "app"), { recursive: true });
    await writeFile(join(project.path, "backend", "requirements.txt"), "fastapi==0.115.0\nuvicorn==0.34.0\n");
    await writeFile(join(project.path, "backend", "app", "main.py"), "from fastapi import FastAPI\napp = FastAPI()\n");
    await writeFile(join(project.path, "backend", ".env"), "API_KEY=secret");

    const result = await buildProjectPublishRuntimeBundle(project.id);
    assert.equal(result.ok, true);
    assert.equal(result.platform, "python");
    assert.equal(result.metadata.runtimeDirectory, "backend");
    assert.equal(result.buildCommand, "pip install -r requirements.txt");
    assert.equal(result.startCommand, "python -m uvicorn app.main:app --host 0.0.0.0 --port ${PORT}");
    assert.deepEqual(result.files.map((file) => file.path).sort(), ["app/main.py", "requirements.txt"]);
  } finally {
    appState.cachedProjects = previousProjects;
    await cleanup();
  }
});

test("publish runtime bundle serves a root-manifest FastAPI and built Vite frontend together", async () => {
  const { project, cleanup } = await makeProject("vibyra-runtime-python-fullstack-");
  const previousProjects = appState.cachedProjects;
  appState.cachedProjects = [project];
  try {
    await mkdir(join(project.path, "backend", "app"), { recursive: true });
    await mkdir(join(project.path, "frontend", "dist", "assets"), { recursive: true });
    await mkdir(join(project.path, "frontend", "src"), { recursive: true });
    await mkdir(join(project.path, "frontend", "node_modules", "vite"), { recursive: true });
    await writeFile(join(project.path, "requirements.txt"), "fastapi==0.115.0\nuvicorn==0.34.0\n");
    await writeFile(join(project.path, "backend", "__init__.py"), "");
    await writeFile(join(project.path, "backend", "app", "__init__.py"), "");
    await writeFile(join(project.path, "backend", "app", "main.py"), "from fastapi import FastAPI\napp = FastAPI()\n@app.get('/api/health')\ndef health(): return {'ok': True}\n");
    await writeFile(join(project.path, "backend", "app", "service.py"), "VALUE = 1\n");
    await writeFile(join(project.path, "frontend", "dist", "index.html"), "<script type=\"module\" src=\"/assets/app.js\"></script>");
    await writeFile(join(project.path, "frontend", "dist", "assets", "app.js"), "fetch('/api/health');");
    await writeFile(join(project.path, "frontend", "dist", "assets", "model.wasm"), Buffer.from([1, 2, 3]));
    await writeFile(join(project.path, "frontend", "package.json"), JSON.stringify({ scripts: { build: "vite build" } }));
    await writeFile(join(project.path, "frontend", "src", "main.tsx"), "source should not be bundled");
    await writeFile(join(project.path, "frontend", "node_modules", "vite", "index.js"), "dependency should not be bundled");

    const result = await buildProjectPublishRuntimeBundle(project.id);
    const paths = result.files.map((file) => file.path).sort();
    assert.equal(result.ok, true);
    assert.equal(result.platform, "python");
    assert.equal(result.metadata.runtimeDirectory, ".");
    assert.equal(result.buildCommand, "pip install -r requirements.txt");
    assert.equal(result.startCommand, "python -m uvicorn _vibyra_runtime:app --host 0.0.0.0 --port ${PORT}");
    assert.deepEqual(paths, [
      "_vibyra_runtime.py",
      "backend/__init__.py",
      "backend/app/__init__.py",
      "backend/app/main.py",
      "backend/app/service.py",
      "frontend/dist/assets/app.js",
      "frontend/dist/assets/model.wasm",
      "frontend/dist/index.html",
      "requirements.txt"
    ]);
    assert.equal(paths.some((path) => path.startsWith("frontend/src/")), false);
    assert.equal(paths.includes("frontend/package.json"), false);
    assert.equal(paths.some((path) => path.includes("node_modules")), false);
    const wrapper = result.files.find((file) => file.path === "_vibyra_runtime.py")?.body ?? "";
    assert.match(wrapper, /import_module\("backend\.app\.main"\)\.app/);
    assert.match(wrapper, /app\.mount\("\/".*"frontend\/dist".*html=True/);
  } finally {
    appState.cachedProjects = previousProjects;
    await cleanup();
  }
});

test("publish runtime bundle includes safe Laravel source and built assets", async () => {
  const { project, cleanup } = await makeProject("vibyra-runtime-laravel-");
  const previousProjects = appState.cachedProjects;
  appState.cachedProjects = [project];
  try {
    await mkdir(join(project.path, "app", "Http", "Controllers"), { recursive: true });
    await mkdir(join(project.path, "public", "build", "assets"), { recursive: true });
    await mkdir(join(project.path, "public", "uploads"), { recursive: true });
    await mkdir(join(project.path, "resources", "js"), { recursive: true });
    await mkdir(join(project.path, "resources", "views"), { recursive: true });
    await mkdir(join(project.path, "bootstrap"), { recursive: true });
    await mkdir(join(project.path, "bootstrap", "cache"), { recursive: true });
    await mkdir(join(project.path, "config"), { recursive: true });
    await mkdir(join(project.path, "routes"), { recursive: true });
    await writeFile(join(project.path, "composer.json"), JSON.stringify({ require: { "laravel/framework": "^12.0" } }));
    await writeFile(join(project.path, "package.json"), JSON.stringify({
      engines: { node: ">=22 <25" },
      dependencies: { "laravel-vite-plugin": "latest" }
    }));
    await writeFile(join(project.path, "artisan"), "#!/usr/bin/env php\n<?php echo 'artisan';");
    await writeFile(join(project.path, "bootstrap", "app.php"), "<?php\nreturn [];");
    await writeFile(join(project.path, "bootstrap", "providers.php"), "<?php\nreturn [];");
    await writeFile(join(project.path, "bootstrap", "cache", ".gitignore"), "*\n!.gitignore\n");
    await writeFile(join(project.path, "bootstrap", "cache", "packages.php"), "<?php\nreturn ['dev-provider'];");
    await writeFile(join(project.path, "config", "app.php"), "<?php\nreturn [];");
    await writeFile(join(project.path, "routes", "web.php"), "<?php\nRoute::get('/', fn () => 'Demo');");
    await writeFile(join(project.path, "routes", "console.php"), "<?php\n");
    await writeFile(join(project.path, "app", "Http", "Controllers", "HomeController.php"), "<?php\nclass HomeController {}");
    await writeFile(join(project.path, "public", "index.php"), "<?php\nrequire __DIR__.'/../vendor/autoload.php';");
    await writeFile(join(project.path, "public", "build", "manifest.json"), "{}");
    await writeFile(join(project.path, "public", "build", "assets", "app.js"), "console.log('demo');");
    await writeFile(join(project.path, "public", "uploads", "private.png"), "not bundled");
    await writeFile(join(project.path, "resources", "js", "app.tsx"), "console.log('source should stay local');");
    await writeFile(join(project.path, "resources", "views", "app.blade.php"), "<div id=\"app\"></div>");
    await writeFile(join(project.path, ".env"), "APP_KEY=secret");

    const result = await buildProjectPublishRuntimeBundle(project.id);
    const paths = result.files.map((file) => file.path).sort();
    assert.equal(result.ok, true);
    assert.equal(result.platform, "laravel");
    assert.equal(result.startCommand, "mkdir -p bootstrap/cache storage/framework/cache/data storage/framework/sessions storage/framework/views storage/logs && touch /tmp/vibyra-demo.sqlite && php artisan migrate --force && php artisan serve --host=0.0.0.0 --port=${PORT}");
    assert.equal(paths.includes("composer.json"), true);
    assert.equal(paths.includes("package.json"), false);
    assert.equal(paths.includes("artisan"), true);
    assert.equal(paths.includes("bootstrap/app.php"), true);
    assert.equal(paths.includes("bootstrap/providers.php"), true);
    assert.equal(paths.includes("bootstrap/cache/.gitignore"), true);
    assert.equal(paths.includes("bootstrap/cache/packages.php"), false);
    assert.equal(paths.includes("config/app.php"), true);
    assert.equal(paths.includes("routes/web.php"), true);
    assert.equal(paths.includes("routes/console.php"), true);
    assert.equal(paths.includes("public/index.php"), true);
    assert.equal(paths.includes("public/build/assets/app.js"), true);
    assert.equal(paths.includes("resources/views/app.blade.php"), true);
    assert.equal(paths.includes("resources/js/app.tsx"), false);
    assert.equal(paths.includes("public/uploads/private.png"), false);
    assert.equal(paths.includes(".env"), false);
  } finally {
    appState.cachedProjects = previousProjects;
    await cleanup();
  }
});

test("publish runtime bundle tells Laravel users when the frontend build is missing", async () => {
  const { project, cleanup } = await makeProject("vibyra-runtime-laravel-no-build-");
  const previousProjects = appState.cachedProjects;
  appState.cachedProjects = [project];
  try {
    await mkdir(join(project.path, "bootstrap"), { recursive: true });
    await mkdir(join(project.path, "public"), { recursive: true });
    await writeFile(join(project.path, "composer.json"), JSON.stringify({ require: { "laravel/framework": "^13.0" } }));
    await writeFile(join(project.path, "package.json"), JSON.stringify({ devDependencies: { "laravel-vite-plugin": "latest" } }));
    await writeFile(join(project.path, "artisan"), "#!/usr/bin/env php\n");
    await writeFile(join(project.path, "bootstrap", "app.php"), "<?php return [];\n");
    await writeFile(join(project.path, "public", "index.php"), "<?php\n");

    const result = await buildProjectPublishRuntimeBundle(project.id);
    assert.equal(result.ok, false);
    assert.equal(result.code, "missing_frontend_build");
    assert.equal(
      result.reason,
      "The Laravel frontend has not been built. Run npm run build in the Laravel app folder, then publish again."
    );
  } finally {
    appState.cachedProjects = previousProjects;
    await cleanup();
  }
});

test("publish runtime bundle fails clearly when a required Laravel build asset exceeds its cap", async () => {
  const { project, cleanup } = await makeProject("vibyra-runtime-laravel-asset-cap-");
  const previousProjects = appState.cachedProjects;
  appState.cachedProjects = [project];
  try {
    await mkdir(join(project.path, "bootstrap"), { recursive: true });
    await mkdir(join(project.path, "public", "build", "assets"), { recursive: true });
    await mkdir(join(project.path, "routes"), { recursive: true });
    await writeFile(join(project.path, "composer.json"), JSON.stringify({ require: { "laravel/framework": "^13.0" } }));
    await writeFile(join(project.path, "package.json"), JSON.stringify({ devDependencies: { "laravel-vite-plugin": "latest" } }));
    await writeFile(join(project.path, "artisan"), "#!/usr/bin/env php\n");
    await writeFile(join(project.path, "bootstrap", "app.php"), "<?php return [];\n");
    await writeFile(join(project.path, "public", "index.php"), "<?php\n");
    await writeFile(join(project.path, "public", "build", "manifest.json"), JSON.stringify({
      "resources/js/app.tsx": { file: "assets/app.js", isEntry: true }
    }));
    await writeFile(join(project.path, "public", "build", "assets", "app.js"), "x".repeat(64));
    await writeFile(join(project.path, "routes", "web.php"), "<?php\n");

    const result = await buildProjectPublishRuntimeBundle(project.id, {
      limits: { maxBuildAssetBytes: 32 }
    });
    assert.equal(result.ok, false);
    assert.equal(result.code, "runtime_bundle_limit_exceeded");
    assert.equal(result.reason, "This project is too large for Vibyra hosting, so we can’t host it. Open a smaller app folder or remove unnecessary files, then try again.");
    assert.equal(
      result.metadata.skipped.some((item) => item.path === "public/build/assets/app.js" && item.reason === "file_too_large"),
      true
    );
  } finally {
    appState.cachedProjects = previousProjects;
    await cleanup();
  }
});
