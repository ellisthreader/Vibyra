const EXTRA_PROFILES = [
  {
    id: "parcel",
    label: "Parcel",
    packages: ["parcel"],
    scripts: ["dev", "start", "serve"],
    pattern: /^parcel(?:\s+(?:serve\s+)?)?[^;&|<>`]*$/i,
    args: ["--host", "0.0.0.0"],
    portArg: "--port",
    defaultPorts: [1234, 1235, 1236]
  },
  {
    id: "gatsby",
    label: "Gatsby",
    packages: ["gatsby"],
    scripts: ["develop", "dev", "start"],
    pattern: /^gatsby\s+develop(?:\s|$)/i,
    args: ["--host", "0.0.0.0"],
    portArg: "--port",
    defaultPorts: [8000, 8001, 8002],
    markers: [/\bid=["']___gatsby["']/i, /\/page-data\//i]
  },
  {
    id: "docusaurus",
    label: "Docusaurus",
    packages: ["@docusaurus/core"],
    scripts: ["start", "dev"],
    pattern: /^docusaurus\s+start(?:\s|$)/i,
    args: ["--host", "0.0.0.0"],
    portArg: "--port",
    defaultPorts: [3000, 3001, 3002],
    markers: [/\b__docusaurus\b/i, /\/assets\/js\/runtime~main/i]
  },
  {
    id: "ember",
    label: "Ember",
    packages: ["ember-cli"],
    scripts: ["start", "serve"],
    pattern: /^ember\s+serve(?:\s|$)/i,
    args: ["--host", "0.0.0.0"],
    portArg: "--port",
    defaultPorts: [4200, 4201, 4202],
    markers: [/\bember-application\b/i, /\/assets\/vendor\.js/i]
  },
  {
    id: "webpack",
    label: "Webpack",
    packages: ["webpack-dev-server"],
    scripts: ["dev", "start", "serve"],
    pattern: /^(?:webpack\s+serve|webpack-dev-server)(?:\s|$)/i,
    args: ["--host", "0.0.0.0"],
    portArg: "--port",
    defaultPorts: [8080, 8081, 8082]
  },
  {
    id: "vinxi",
    label: "Vinxi",
    packages: ["vinxi"],
    scripts: ["dev", "start"],
    pattern: /^vinxi\s+dev(?:\s|$)/i,
    args: ["--host", "0.0.0.0"],
    portArg: "--port",
    defaultPorts: [3000, 3001, 3002]
  }
];

export function extraPreviewFrameworkProfile(packageText) {
  const parsed = parsePackage(packageText);
  const scripts = parsed?.scripts && typeof parsed.scripts === "object" ? parsed.scripts : {};
  const deps = { ...(parsed?.dependencies || {}), ...(parsed?.devDependencies || {}) };
  for (const profile of EXTRA_PROFILES) {
    if (!profile.packages.some((name) => Object.hasOwn(deps, name))) continue;
    const scriptName = profile.scripts.find((name) => safeMatch(String(scripts[name] || ""), profile.pattern));
    if (!scriptName) continue;
    return { ...profile, scriptName, command: `npm run ${scriptName} -- ${profile.args.join(" ")}` };
  }
  return genericProjectScript(parsed, scripts);
}

function safeMatch(script, pattern) {
  const value = script.trim().replace(/\.cmd\b/gi, "");
  return Boolean(value) && !/[;&|<>`]|[$][(]/.test(value) && pattern.test(value);
}

function genericProjectScript(parsed, scripts) {
  if (!parsed) return null;
  const aliases = Object.keys(scripts).filter((name) => /^(?:web[:.-].+|.+[:.-]web)$/i.test(name));
  for (const scriptName of [...new Set(["web", "dev", "start", "serve", "preview", "develop", ...aliases])]) {
    const script = String(scripts[scriptName] || "").trim();
    if (!isRunnableProjectScript(script)) continue;
    return {
      id: "project-script",
      label: "Project web script",
      scripts: [scriptName],
      scriptName,
      args: [],
      command: `npm run ${scriptName}`,
      defaultPorts: [3000, 5173, 8080, 8000, 4200, 4321, 1234, 1313],
      reuseExisting: false,
      scanDefaultPorts: true
    };
  }
  return null;
}

function isRunnableProjectScript(script) {
  if (!script || /[;&|<>`]|[$][(]/.test(script)) return false;
  if (/\b(?:build|test|lint|electron|tauri|expo|react-native|capacitor|cordova)\b/i.test(script)) return false;
  return /(?:^|\s)(?:dev|serve|server|start|web|preview|node|nodemon|tsx|ts-node)(?:\s|$|[.:/-])/i.test(script);
}

function parsePackage(text) {
  try { return JSON.parse(String(text || "{}")); } catch { return null; }
}
