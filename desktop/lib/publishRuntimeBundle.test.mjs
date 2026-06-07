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
    assert.equal(result.startCommand, "mkdir -p bootstrap/cache storage/framework/cache/data storage/framework/sessions storage/framework/views && touch /tmp/vibyra-demo.sqlite && php artisan serve --host=0.0.0.0 --port=${PORT}");
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
