import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "../..");
const token = "vibyra-publish-integration-token";

test("local bridge bundles a browsed full-stack app and Laravel accepts the publish payload", { timeout: 120_000 }, async () => {
  const workspace = await mkdtemp(join(tmpdir(), "vibyra-publish-integration-"));
  const projectPath = join(workspace, "Desktop", "ReactLaravelSmoke");
  const payloadPath = join(workspace, "publish-payload.json");
  const port = await availablePort();
  await createLaravelFixture(projectPath);

  const bridge = spawn(process.execPath, ["desktop/local-app.mjs"], {
    cwd: repoRoot,
    env: {
      ...process.env,
      HOME: workspace,
      VIBYRA_AGENT_PORT: String(port),
      VIBYRA_AGENT_TOKEN: token,
      VIBYRA_PAIR_CODE: "SMOKE1",
      VIBYRA_SKIP_DESKTOP_WINDOW: "1"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let bridgeOutput = "";
  bridge.stdout.on("data", (chunk) => { bridgeOutput += chunk; });
  bridge.stderr.on("data", (chunk) => { bridgeOutput += chunk; });

  try {
    await waitForBridge(port, bridge);
    const browse = await bridgeJson(port, `/desktop/browse?path=${encodeURIComponent(projectPath)}`);
    assert.equal(browse.current.path, projectPath);
    assert.ok(browse.current.id);

    const projectId = browse.current.id;
    const review = await bridgeJson(port, `/files/review-bundle?projectId=${encodeURIComponent(projectId)}`);
    const hostedDemo = await bridgeJson(port, `/files/publish-demo-bundle?projectId=${encodeURIComponent(projectId)}`);
    const runtimeBundle = await bridgeJson(port, `/files/publish-runtime-bundle?projectId=${encodeURIComponent(projectId)}`);

    assert.equal(review.truncated, false);
    assert.ok(review.files.some((file) => file.path === "composer.json"));
    assert.ok(review.files.some((file) => file.path === "routes/web.php"));
    assert.equal(review.files.some((file) => /(^|\/)\.env(?:\.|$)/i.test(file.path)), false);

    assert.equal(hostedDemo.ok, true, hostedDemo.reason);
    assert.equal(hostedDemo.metadata.kind, "laravel-vite-static-shell");
    assert.ok(hostedDemo.files.some((file) => file.path === "index.html"));
    assert.ok(hostedDemo.files.some((file) => file.path === "build/assets/app.js"));

    assert.equal(runtimeBundle.ok, true, runtimeBundle.reason);
    assert.equal(runtimeBundle.platform, "laravel");
    assert.equal(runtimeBundle.metadata.runtimeDirectory, ".");
    assert.ok(runtimeBundle.files.some((file) => file.path === "composer.json"));
    assert.ok(runtimeBundle.files.some((file) => file.path === "public/build/manifest.json"));
    assert.ok(runtimeBundle.files.some((file) => file.path === "public/build/assets/app.js"));
    assert.equal(runtimeBundle.files.some((file) => /(^|\/)\.env(?:\.|$)/i.test(file.path)), false);

    const missingId = Buffer.from(join(workspace, "missing-project")).toString("base64url");
    const missingDemo = await bridgeJson(port, `/files/publish-demo-bundle?projectId=${encodeURIComponent(missingId)}`);
    assert.equal(missingDemo.ok, false);
    assert.equal(missingDemo.code, "project_not_found");
    assert.match(missingDemo.reason, /Reopen the app folder from Browse PC/i);

    const missingRuntime = await bridgeResponse(port, `/files/publish-runtime-bundle?projectId=${encodeURIComponent(missingId)}`);
    assert.equal(missingRuntime.status, 500);
    assert.equal(missingRuntime.body.error, "Project not found");

    await writeFile(payloadPath, JSON.stringify({
      projectId,
      title: "React Laravel Bridge Smoke",
      description: "Local integration proof for a React and Laravel full-stack publish.",
      stack: "React + Laravel",
      visibility: "public",
      previewHtml: "",
      sourceFiles: review.files,
      sourceReview: { totalFiles: review.totalFiles, truncated: review.truncated },
      runtimeBundle
    }));

    const backend = await run("php", [
      "artisan", "test", "--filter=PublishBridgeIntegrationTest"
    ], {
      cwd: join(repoRoot, "backend"),
      env: { ...process.env, VIBYRA_PUBLISH_SMOKE_PAYLOAD: payloadPath }
    });
    assert.equal(backend.code, 0, backend.output);
    assert.match(backend.output, /1 passed/i);

    const realProject = "/home/ellis/Desktop/ReactLaravel";
    if (existsSync(realProject)) {
      const real = await verifyReadOnlyProject(port, realProject);
      assert.equal(real.runtime.ok, true, real.runtime.reason);
      assert.equal(real.runtime.platform, "laravel");
      assert.ok(real.runtime.files.some((file) => file.path === "public/build/manifest.json"));
      assert.equal(real.runtime.files.some((file) => /(^|\/)\.env(?:\.|$)/i.test(file.path)), false);
      assert.equal(real.review.files.some((file) => /(^|\/)\.env(?:\.|$)/i.test(file.path)), false);
    }
  } finally {
    bridge.kill("SIGTERM");
    await Promise.race([
      new Promise((done) => bridge.once("exit", done)),
      new Promise((done) => setTimeout(done, 2_000))
    ]);
    await rm(workspace, { recursive: true, force: true });
  }

  assert.match(bridgeOutput, /Vibyra Desktop is running/);
});

async function verifyReadOnlyProject(port, projectPath) {
  const browse = await bridgeJson(port, `/desktop/browse?path=${encodeURIComponent(projectPath)}`);
  const projectId = browse.current.id;
  const [review, runtime] = await Promise.all([
    bridgeJson(port, `/files/review-bundle?projectId=${encodeURIComponent(projectId)}`),
    bridgeJson(port, `/files/publish-runtime-bundle?projectId=${encodeURIComponent(projectId)}`)
  ]);
  return { review, runtime };
}

async function createLaravelFixture(projectPath) {
  await Promise.all([
    mkdir(join(projectPath, "app", "Http", "Controllers"), { recursive: true }),
    mkdir(join(projectPath, "bootstrap", "cache"), { recursive: true }),
    mkdir(join(projectPath, "config"), { recursive: true }),
    mkdir(join(projectPath, "public", "build", "assets"), { recursive: true }),
    mkdir(join(projectPath, "resources", "views"), { recursive: true }),
    mkdir(join(projectPath, "routes"), { recursive: true })
  ]);
  const files = {
    ".env": "APP_KEY=base64:must-not-be-published\n",
    "artisan": "#!/usr/bin/env php\n<?php\n",
    "composer.json": JSON.stringify({ require: { "laravel/framework": "^13.0" } }),
    "package.json": JSON.stringify({
      scripts: { build: "vite build" },
      dependencies: { react: "^19.0.0" },
      devDependencies: { "laravel-vite-plugin": "^3.0.0", vite: "^8.0.0" }
    }),
    "bootstrap/app.php": "<?php return [];\n",
    "bootstrap/cache/.gitignore": "*\n!.gitignore\n",
    "config/app.php": "<?php return ['name' => 'Smoke'];\n",
    "public/index.php": "<?php echo 'runtime';\n",
    "public/build/manifest.json": JSON.stringify({
      "resources/js/app.tsx": {
        file: "assets/app.js",
        src: "resources/js/app.tsx",
        isEntry: true,
        css: ["assets/app.css"]
      },
      "resources/js/Pages/Home.tsx": {
        file: "assets/home.js",
        src: "resources/js/Pages/Home.tsx"
      }
    }),
    "public/build/assets/app.js": "document.body.dataset.frontend = 'ready';\n",
    "public/build/assets/app.css": "body{font-family:sans-serif}\n",
    "resources/views/app.blade.php": "<div id=\"app\"></div>\n",
    "routes/web.php": "<?php\nuse Illuminate\\Support\\Facades\\Route;\nRoute::get('/', fn () => view('app'));\n"
  };
  await Promise.all(Object.entries(files).map(async ([path, body]) => {
    const destination = join(projectPath, path);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, body);
  }));
}

async function bridgeJson(port, path) {
  const response = await bridgeResponse(port, path);
  assert.equal(response.status, 200, JSON.stringify(response.body));
  return response.body;
}

async function bridgeResponse(port, path) {
  const response = await fetch(`http://127.0.0.1:${port}${path}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return { status: response.status, body: await response.json() };
}

async function waitForBridge(port, child) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`Desktop bridge exited with ${child.exitCode}`);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`);
      if (response.ok) return;
    } catch {
    }
    await new Promise((done) => setTimeout(done, 100));
  }
  throw new Error("Desktop bridge did not become ready");
}

async function availablePort() {
  const server = createServer();
  await new Promise((resolveReady, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveReady);
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  await new Promise((done) => server.close(done));
  return port;
}

function run(command, args, options) {
  return new Promise((resolveRun) => {
    const child = spawn(command, args, { ...options, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.stderr.on("data", (chunk) => { output += chunk; });
    child.once("exit", (code) => resolveRun({ code, output }));
  });
}
