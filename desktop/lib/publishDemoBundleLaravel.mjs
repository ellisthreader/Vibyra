import { posix, resolve } from "node:path";
import { readFile } from "node:fs/promises";
import { readProjectText } from "./previewStatic.mjs";

export async function laravelViteStaticShellEntry(project) {
  const composer = await readProjectText(project.path, "composer.json");
  const packageText = await readProjectText(project.path, "package.json");
  if (!/laravel\/framework/i.test(composer) || !/laravel-vite-plugin/i.test(packageText)) return null;

  const manifest = await readLaravelManifest(project.path);
  if (!manifest) return null;
  const entryKey = laravelEntryKey(manifest);
  if (!entryKey) return null;

  const entry = manifest[entryKey];
  const pageComponent = laravelStaticShellComponent(manifest) ?? "Welcome";
  return {
    entryPath: "index.html",
    mountDirectory: "",
    virtualEntryHtml: laravelStaticShellHtml({
      appFile: entry.file,
      css: Array.isArray(entry.css) ? entry.css : [],
      pageComponent,
      title: project.name || "Laravel app"
    }),
    requiredPaths: laravelManifestBundlePaths(manifest, entryKey),
    webRootDirectory: "public",
    metadata: {
      kind: "laravel-vite-static-shell",
      limitations: ["static_inertia_shell", "backend_routes_require_runtime"],
      manifestPath: "public/build/manifest.json",
      pageComponent
    }
  };
}

async function readLaravelManifest(projectPath) {
  try {
    const body = await readFile(resolve(projectPath, "public/build/manifest.json"), "utf8");
    const parsed = JSON.parse(body);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function laravelEntryKey(manifest) {
  const entries = Object.entries(manifest).filter(([, value]) => value?.isEntry && value?.file);
  return entries.find(([key]) => /^resources\/js\/app\.(?:jsx?|tsx?)$/i.test(key))?.[0]
    ?? entries.find(([key]) => /^resources\/js\//i.test(key))?.[0]
    ?? entries[0]?.[0]
    ?? "";
}

function laravelStaticShellComponent(manifest) {
  const pages = Object.keys(manifest)
    .map((key) => key.match(/^resources\/js\/Pages\/(.+)\.(?:jsx?|tsx?)$/i)?.[1])
    .filter(Boolean);
  const preferred = ["HomeLanding", "Welcome", "Home", "Index", "Landing", "About"];
  return preferred.find((name) => pages.includes(name)) ?? pages[0] ?? null;
}

function laravelManifestBundlePaths(manifest, entryKey) {
  const paths = new Set();
  const visited = new Set();
  const visit = (key) => {
    if (visited.has(key)) return;
    visited.add(key);
    const record = manifest[key];
    if (!record || typeof record !== "object") return;
    if (record.file) paths.add(posix.join("build", record.file));
    for (const css of record.css ?? []) paths.add(posix.join("build", css));
    for (const asset of record.assets ?? []) paths.add(posix.join("build", asset));
    for (const child of [...(record.imports ?? []), ...(record.dynamicImports ?? [])]) visit(child);
  };
  visit(entryKey);
  return [...paths];
}

function laravelStaticShellHtml({ appFile, css, pageComponent, title }) {
  const page = {
    component: pageComponent,
    props: { auth: { user: null }, errors: {}, flash: {} },
    url: "/",
    version: ""
  };
  const routeMap = {
    home: "/",
    menu: "/menu",
    "menu.items": "/menu/items",
    about: "/about",
    allergens: "/allergens",
    login: "/login",
    register: "/register",
    dashboard: "/dashboard"
  };
  const links = css.map((path) => `<link rel="stylesheet" href="/build/${escapeHtml(path)}">`).join("");
  const routes = JSON.stringify(routeMap);
  return [
    "<!doctype html>",
    "<html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">",
    `<title>${escapeHtml(title)}</title>${links}`,
    "<script>",
    `window.route=function(name){var routes=${routes};return routes[name]||"/";};`,
    `window.route.has=function(name){var routes=${routes};return Object.prototype.hasOwnProperty.call(routes,name);};`,
    "window.route.current=function(){return false;};",
    "</script>",
    "</head><body><div id=\"app\" data-page='",
    escapeAttribute(JSON.stringify(page)),
    `'></div><script type="module" src="/build/${escapeHtml(appFile)}"></script></body></html>`
  ].join("");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/'/g, "&#39;");
}
