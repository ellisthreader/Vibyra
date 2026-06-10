export function expoPreviewProfile(packageText) {
  const pkg = parsePackage(packageText);
  if (!pkg || !hasExpo(pkg)) return null;
  const scripts = pkg.scripts && typeof pkg.scripts === "object" ? pkg.scripts : {};
  for (const scriptName of ["web", "start", "dev"]) {
    const script = String(scripts[scriptName] || "").trim();
    if (!safeExpoScript(script)) continue;
    const includesWeb = /(?:^|\s)--web(?:\s|$)/.test(script);
    return {
      id: "expo-web",
      label: "Expo web",
      scriptName,
      args: [...(includesWeb ? [] : ["--web"]), "--host", "lan"],
      portArg: "--port",
      defaultPorts: [8081, 8082, 8083, 8084, 8085, 8086, 8087, 8088, 8089, 8090],
      markers: [/id=["']expo-reset["']/i, /node_modules\/expo\/AppEntry\.bundle/i],
      command: `npm run ${scriptName} -- ${includesWeb ? "" : "--web "}` + "--host lan"
    };
  }
  return null;
}

export function expoProjectTitles(appText, packageText) {
  const values = [];
  try {
    const app = JSON.parse(String(appText || "{}"));
    values.push(app?.expo?.name, app?.expo?.slug, app?.name, app?.displayName);
  } catch {}
  const pkg = parsePackage(packageText);
  values.push(pkg?.displayName, pkg?.name);
  return Array.from(new Set(values.map(normalizeTitle).filter(Boolean)));
}

export function expoHtmlMatchesProject(html, titles) {
  const title = normalizeTitle(String(html || "").match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]);
  return Boolean(title && titles?.includes(title));
}

function safeExpoScript(script) {
  if (!script || /[;&|<>`]|[$][(]/.test(script)) return false;
  const args = script.split(/\s+/);
  if (args[0] === "npx") args.shift();
  if (args.shift() !== "expo" || args.shift() !== "start") return false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (["--web", "--clear", "--no-dev", "--minify"].includes(arg)) continue;
    if (/^--port=\d+$/.test(arg) || /^--host=(?:lan|localhost|tunnel)$/.test(arg)) continue;
    if (arg === "--port" && /^\d+$/.test(args[index + 1] || "")) { index += 1; continue; }
    if (arg === "--host" && /^(?:lan|localhost|tunnel)$/.test(args[index + 1] || "")) { index += 1; continue; }
    return false;
  }
  return true;
}

function hasExpo(pkg) {
  const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  return Object.prototype.hasOwnProperty.call(deps, "expo");
}

function parsePackage(text) {
  try {
    return JSON.parse(String(text || "{}"));
  } catch {
    return null;
  }
}

function normalizeTitle(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}
