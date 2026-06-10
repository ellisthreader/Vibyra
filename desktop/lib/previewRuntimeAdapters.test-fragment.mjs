import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import test from "node:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { previewFrameworkProfile } from "./previewFrameworkProfiles.mjs";
import { previewUnavailableReason } from "./previewDetection.mjs";
import { startProjectDevServer } from "./previewDevServer.mjs";
import { runtimePreviewContext, runtimePreviewLaunch } from "./previewRuntimeAdapters.mjs";
import { findFreePort, killTrackedPreview, makeFakeNpm, makeProject } from "./previewTestHelpers.mjs";

test("preview profiles cover additional frameworks and guarded project scripts", () => {
  const parcel = previewFrameworkProfile(JSON.stringify({
    scripts: { dev: "parcel src/index.html" },
    devDependencies: { parcel: "latest" }
  }));
  assert.equal(parcel.id, "parcel");
  assert.equal(parcel.scriptName, "dev");

  const custom = previewFrameworkProfile(JSON.stringify({
    scripts: { start: "node server.js" }
  }));
  assert.equal(custom.id, "project-script");
  assert.equal(custom.command, "npm run start");

  const aliasedVite = previewFrameworkProfile(JSON.stringify({
    scripts: { "web:dev": "vite" },
    devDependencies: { vite: "latest" }
  }));
  assert.equal(aliasedVite.id, "vite");
  assert.equal(aliasedVite.scriptName, "web:dev");

  assert.equal(previewFrameworkProfile(JSON.stringify({
    scripts: { start: "electron ." }
  })), null);
  assert.equal(previewFrameworkProfile(JSON.stringify({
    scripts: { dev: "node server.js && rm -rf output" }
  })), null);
});

test("runtime preview detection covers Python, Flutter, Rails, Hugo, and PHP roots", async () => {
  const cases = [
    ["django", { "manage.py": "", "requirements.txt": "Django==5.0" }],
    ["fastapi", { "backend/app/main.py": "from fastapi import FastAPI\napp = FastAPI()", "backend/requirements.txt": "fastapi\nuvicorn" }],
    ["flask", { "app.py": "from flask import Flask\napp = Flask(__name__)", "requirements.txt": "flask" }],
    ["flutter-web", { "pubspec.yaml": "name: sample\ndependencies:\n  flutter:\n    sdk: flutter\n" }],
    ["rails", { Gemfile: "gem 'rails'\n" }],
    ["hugo", { "hugo.toml": "baseURL = '/'\n" }],
    ["php", { "public/index.php": "<?php echo 'ready';" }]
  ];
  for (const [expected, files] of cases) {
    const root = await mkdtemp(join(tmpdir(), `vibyra-runtime-${expected}-`));
    try {
      for (const [name, body] of Object.entries(files)) {
        await mkdir(join(root, name, ".."), { recursive: true });
        await writeFile(join(root, name), body);
      }
      const context = await runtimePreviewContext(root);
      assert.equal(context?.profile.id, expected);
      assert.ok(runtimePreviewLaunch(context, 4567)?.command.includes("4567"));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }
});

test("preview detection explains package-only and non-web Python projects", async () => {
  const packageRoot = await mkdtemp(join(tmpdir(), "vibyra-preview-package-only-"));
  const pythonRoot = await mkdtemp(join(tmpdir(), "vibyra-preview-python-cli-"));
  try {
    await writeFile(join(packageRoot, "package.json"), JSON.stringify({ name: "placeholder" }));
    assert.match(await previewUnavailableReason({ path: packageRoot }), /package\.json.*no runnable scripts/i);
    await mkdir(join(pythonRoot, "assistant"), { recursive: true });
    await writeFile(join(pythonRoot, "assistant", "requirements.txt"), "openai\nsounddevice\n");
    assert.match(await previewUnavailableReason({ path: pythonRoot }), /Python project.*not a supported.*browser server/i);
  } finally {
    await rm(packageRoot, { recursive: true, force: true });
    await rm(pythonRoot, { recursive: true, force: true });
  }
});

test("approved Django preview starts the selected project runtime", async () => {
  const { project, cleanup } = await makeProject("vibyra-preview-django-");
  const bin = await mkdtemp(join(tmpdir(), "vibyra-fake-python-"));
  const executable = join(bin, process.platform === "win32" ? "python.cmd" : "python3");
  const port = await findFreePort();
  try {
    await writeFile(join(project.path, "manage.py"), "");
    await writeFile(join(project.path, "requirements.txt"), "Django==5.0\n");
    await writeFile(executable, [
      "#!/usr/bin/env node",
      "const { createServer } = await import('node:http');",
      "const target = process.argv.at(-1);",
      "const port = Number(target.split(':').at(-1));",
      "createServer((_req, res) => {",
      "  res.writeHead(200, { 'Content-Type': 'text/html' });",
      "  res.end('<!doctype html><html><body>Django preview</body></html>');",
      "}).listen(port, '0.0.0.0');",
      "setInterval(() => {}, 1000);"
    ].join("\n"));
    await chmod(executable, 0o755);

    const result = await startProjectDevServer(project, "127.0.0.1:4317", {
      env: { PATH: `${bin}:${process.env.PATH ?? ""}` },
      port,
      timeoutMs: 6000
    });
    assert.equal(result.framework, "Django");
    assert.equal(result.command, `${process.platform === "win32" ? "python" : "python3"} manage.py runserver 0.0.0.0:${port}`);
    assert.equal(result.url, `http://127.0.0.1:${port}`);
  } finally {
    killTrackedPreview(project.id);
    await rm(bin, { recursive: true, force: true });
    await cleanup();
  }
});

test("approved custom Node web script starts without framework-specific metadata", async () => {
  const { project, cleanup } = await makeProject("vibyra-preview-custom-node-");
  const fakeNpm = await makeFakeNpm();
  const port = await findFreePort();
  try {
    await writeFile(join(project.path, "package.json"), JSON.stringify({
      scripts: { start: "node server.js" }
    }));
    const result = await startProjectDevServer(project, "127.0.0.1:4317", {
      env: {
        PATH: `${fakeNpm.bin}:${process.env.PATH ?? ""}`,
        VIBYRA_FAKE_PREVIEW_HTML: "<!doctype html><html><body>Custom Node preview</body></html>",
        VIBYRA_FAKE_PREVIEW_PORT: String(port)
      },
      timeoutMs: 6000
    });
    assert.equal(result.framework, "Project web script");
    assert.equal(result.command, "npm run start");
    assert.equal(result.url, `http://127.0.0.1:${port}`);
  } finally {
    killTrackedPreview(project.id);
    await fakeNpm.cleanup();
    await cleanup();
  }
});
