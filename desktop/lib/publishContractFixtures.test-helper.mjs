import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

export async function makePublishContractFixture(name, files) {
  const path = await mkdtemp(join(tmpdir(), `vibyra-publish-contract-${name}-`));
  for (const [relativePath, body] of Object.entries(files)) {
    await mkdir(dirname(join(path, relativePath)), { recursive: true });
    await writeFile(join(path, relativePath), body);
  }
  return {
    project: {
      id: Buffer.from(path).toString("base64url"),
      name,
      path,
      stack: "Contract fixture",
      updated: "Now",
      source: "desktop",
      analysis: { summary: `${name} publish contract fixture` }
    },
    cleanup: () => rm(path, { force: true, recursive: true })
  };
}

export const publishContractFixtures = {
  nestedReactLaravel: {
    "frontend/dist/index.html": "<div id=\"root\"></div><script type=\"module\" src=\"/assets/app.js\"></script>",
    "frontend/dist/assets/app.js": "document.querySelector('#root').textContent = 'React frontend';",
    "frontend/package.json": JSON.stringify({
      scripts: { build: "vite build" },
      dependencies: { react: "latest", vite: "latest" }
    }),
    "backend/composer.json": JSON.stringify({ require: { "laravel/framework": "^13.0" } }),
    "backend/package.json": JSON.stringify({ devDependencies: { "laravel-vite-plugin": "latest" } }),
    "backend/artisan": "#!/usr/bin/env php\n<?php",
    "backend/bootstrap/app.php": "<?php return [];",
    "backend/config/app.php": "<?php return [];",
    "backend/public/index.php": "<?php",
    "backend/public/build/manifest.json": JSON.stringify({
      "resources/js/app.tsx": { file: "assets/app.js", isEntry: true }
    }),
    "backend/public/build/assets/app.js": "document.body.dataset.backend = 'laravel';",
    "backend/resources/views/app.blade.php": "<div id=\"app\"></div>",
    "backend/routes/web.php": "<?php\nRoute::get('/', fn () => view('app'));",
    "backend/.env": "APP_KEY=secret"
  },
  frontendReact: {
    "dist/index.html": "<div id=\"root\"></div><script type=\"module\" src=\"/assets/app.js\"></script>",
    "dist/assets/app.js": "document.querySelector('#root').textContent = 'React only';",
    "package.json": JSON.stringify({
      scripts: { build: "vite build" },
      dependencies: { react: "latest", vite: "latest" }
    })
  },
  laravelInertia: {
    "composer.json": JSON.stringify({ require: { "laravel/framework": "^13.0" } }),
    "package.json": JSON.stringify({
      dependencies: { "@inertiajs/react": "latest", react: "latest" },
      devDependencies: { "laravel-vite-plugin": "latest", vite: "latest" }
    }),
    "artisan": "#!/usr/bin/env php\n<?php",
    "bootstrap/app.php": "<?php return [];",
    "config/app.php": "<?php return [];",
    "public/index.php": "<?php",
    "public/build/manifest.json": JSON.stringify({
      "resources/js/app.tsx": {
        file: "assets/app.js",
        isEntry: true,
        dynamicImports: ["resources/js/Pages/Home.tsx"]
      },
      "resources/js/Pages/Home.tsx": { file: "assets/Home.js" }
    }),
    "public/build/assets/app.js": "import('./Home.js');",
    "public/build/assets/Home.js": "export default function Home() {}",
    "resources/views/app.blade.php": "<div id=\"app\"></div>",
    "routes/web.php": "<?php\nRoute::get('/', fn () => view('app'));"
  },
  nodeFullStack: {
    "package.json": JSON.stringify({
      scripts: { start: "node server.js" },
      dependencies: { express: "latest" }
    }),
    "server.js": "import express from 'express';\nexpress().listen(process.env.PORT);",
    "dist/index.html": "<main>Node full stack</main><script src=\"/assets/app.js\"></script>",
    "dist/assets/app.js": "fetch('/api/health');",
    ".env": "API_KEY=secret"
  },
  pythonFullStack: {
    "requirements.txt": "fastapi==0.115.0\nuvicorn==0.34.0\n",
    "backend/__init__.py": "",
    "backend/app/__init__.py": "",
    "backend/app/main.py": "from fastapi import FastAPI\napp = FastAPI()\n",
    "frontend/dist/index.html": "<main>Python full stack</main><script src=\"/assets/app.js\"></script>",
    "frontend/dist/assets/app.js": "fetch('/api/health');",
    "frontend/src/main.tsx": "source should not deploy"
  },
  failedBuild: {
    "package.json": JSON.stringify({ scripts: { build: "node build.mjs" } }),
    "index.html": "<div id=\"root\"></div><script type=\"module\" src=\"/src/main.jsx\"></script>",
    "build.mjs": "throw new Error('Contract build failed: missing browser dependency');"
  },
  unsafeNode: {
    "package.json": JSON.stringify({
      scripts: { start: "node server.js" },
      dependencies: { express: "latest" }
    }),
    "server.js": "import express from 'express';\nexpress().listen(process.env.PORT);",
    ".env": "TOKEN=secret",
    "credentials/private-key.pem": "secret",
    "secrets/config.json": "{\"password\":\"secret\"}"
  }
};
