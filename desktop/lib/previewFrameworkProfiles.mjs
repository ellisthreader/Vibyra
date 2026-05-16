const VITE_PORTS = [5173, 5174, 5175, 5176, 5177, 5178, 5179, 5180, 4173];

const PROFILES = [
  {
    id: "sveltekit",
    label: "SvelteKit",
    packages: ["@sveltejs/kit"],
    scripts: ["dev"],
    pattern: /^(?:vite|svelte-kit)(?:\s+dev)?(?:\s|$)/i,
    args: ["--host", "0.0.0.0"],
    portArg: "--port",
    defaultPorts: VITE_PORTS,
    markers: [/\/_app\/immutable\//i, /\bdata-sveltekit-/i, /\b__sveltekit\b/i]
  },
  {
    id: "vite",
    label: "Vite",
    packages: ["vite"],
    scripts: ["dev"],
    pattern: /^vite(?:\s|$)/i,
    args: ["--host", "0.0.0.0"],
    portArg: "--port",
    defaultPorts: VITE_PORTS,
    viteClient: true
  },
  {
    id: "next",
    label: "Next.js",
    packages: ["next"],
    scripts: ["dev"],
    pattern: /^next(?:\s+dev)?(?:\s|$)/i,
    args: ["--hostname", "0.0.0.0"],
    portArg: "--port",
    defaultPorts: [3000, 3001, 3002, 3003, 3004],
    markers: [/\/_next\//i, /\bid=["']__NEXT_DATA__["']/i, /\bself\.__next_f\b/i]
  },
  {
    id: "astro",
    label: "Astro",
    packages: ["astro"],
    scripts: ["dev"],
    pattern: /^astro(?:\s+dev)?(?:\s|$)/i,
    args: ["--host", "0.0.0.0"],
    portArg: "--port",
    defaultPorts: [4321, 4322, ...VITE_PORTS],
    markers: [/\/_astro\//i, /\bdata-astro-/i, /\bastro-island\b/i]
  },
  {
    id: "nuxt",
    label: "Nuxt",
    packages: ["nuxt", "nuxi"],
    scripts: ["dev"],
    pattern: /^(?:nuxi|nuxt)(?:\s+dev)?(?:\s|$)/i,
    args: ["--host", "0.0.0.0"],
    portArg: "--port",
    defaultPorts: [3000, 3001, 3002, 3003, 3004, ...VITE_PORTS],
    markers: [/\/_nuxt\//i, /\b__NUXT__\b/i, /\bid=["']__nuxt["']/i]
  },
  {
    id: "angular",
    label: "Angular",
    packages: ["@angular/cli", "@angular/core"],
    scripts: ["start", "dev"],
    pattern: /^ng\s+serve(?:\s|$)/i,
    args: ["--host", "0.0.0.0"],
    portArg: "--port",
    defaultPorts: [4200, 4201, 4202, 4203],
    markers: [/\bng-version=["'][^"']+["']/i, /<app-root\b/i]
  },
  {
    id: "vue-cli",
    label: "Vue CLI",
    packages: ["@vue/cli-service"],
    scripts: ["serve", "dev"],
    pattern: /^vue-cli-service\s+serve(?:\s|$)/i,
    args: ["--host", "0.0.0.0"],
    portArg: "--port",
    defaultPorts: [8080, 8081, 8082, ...VITE_PORTS],
    markers: [/\bid=["']app["']/i, /\/js\/app\./i]
  },
  {
    id: "react-scripts",
    label: "Create React App",
    packages: ["react-scripts"],
    scripts: ["start"],
    pattern: /^react-scripts\s+start(?:\s|$)/i,
    args: [],
    portEnv: "PORT",
    env: { HOST: "0.0.0.0" },
    defaultPorts: [3000, 3001, 3002, 3003, 3004],
    markers: [/\bid=["']root["']/i, /\/static\/js\//i]
  },
  {
    id: "remix-vite",
    label: "Remix Vite",
    allPackages: ["@remix-run/dev", "vite"],
    scripts: ["dev"],
    pattern: /^remix\s+vite:dev(?:\s|$)/i,
    args: ["--host", "0.0.0.0"],
    portArg: "--port",
    defaultPorts: VITE_PORTS,
    markers: [/\b__remixContext\b/i, /\b__remixRouteModules\b/i, /\/build\/.*\.js/i]
  }
];

export function previewFrameworkProfile(packageText) {
  const parsed = parsePackage(packageText);
  const scripts = parsed?.scripts && typeof parsed.scripts === "object" ? parsed.scripts : {};
  for (const profile of PROFILES) {
    if (!hasPackageEvidence(parsed, profile)) continue;
    const scriptName = profile.scripts.find((name) => scriptMatchesProfile(String(scripts[name] ?? ""), profile));
    if (!scriptName) continue;
    return { ...profile, scriptName, command: displayCommand(scriptName, profile.args, profile.env) };
  }
  return null;
}

export function devServerPortsFromPackage(packageText, profile) {
  const ports = new Set();
  for (const match of String(packageText ?? "").matchAll(/--port(?:=|\s+)(\d{2,5})/g)) ports.add(Number(match[1]));
  for (const port of profile?.defaultPorts ?? VITE_PORTS) ports.add(port);
  return Array.from(ports).filter((port) => Number.isInteger(port) && port > 0 && port < 65536);
}

export function npmRunArgs(profile, port) {
  const args = [...profile.args, ...portArgs(profile, port)];
  return ["run", profile.scriptName, ...(args.length > 0 ? ["--", ...args] : [])];
}

export function npmRunEnv(profile, port) {
  return { ...(profile.env ?? {}), ...(profile.portEnv && port ? { [profile.portEnv]: String(port) } : {}) };
}

export function previewCommand(profile, port) {
  return displayCommand(profile.scriptName, [...profile.args, ...portArgs(profile, port)], npmRunEnv(profile, port));
}

function displayCommand(scriptName, args, env) {
  const prefix = [env?.HOST ? "HOST=0.0.0.0" : null, env?.PORT ? `PORT=${env.PORT}` : null].filter(Boolean).join(" ");
  return `${prefix ? `${prefix} ` : ""}npm run ${scriptName}${args.length > 0 ? ` -- ${args.join(" ")}` : ""}`;
}

function portArgs(profile, port) {
  return profile.portArg && port ? [profile.portArg, String(port)] : [];
}

function scriptMatchesProfile(script, profile) {
  const normalized = stripEnvAssignments(script.trim().replace(/\.cmd\b/gi, ""));
  return isSimpleScript(normalized) && profile.pattern.test(normalized);
}

function stripEnvAssignments(script) {
  return script.replace(/^(?:[A-Z_][A-Z0-9_]*=\S+\s+)*/i, "");
}

function isSimpleScript(script) {
  return Boolean(script) && !/[;&|<>`]|[$][(]/.test(script);
}

function hasPackageEvidence(parsed, profile) {
  const deps = { ...(parsed?.dependencies ?? {}), ...(parsed?.devDependencies ?? {}) };
  const hasPackage = (name) => Object.prototype.hasOwnProperty.call(deps, name);
  if (profile.allPackages) return profile.allPackages.every(hasPackage);
  return profile.packages.some(hasPackage);
}

function parsePackage(packageText) {
  try {
    return JSON.parse(String(packageText ?? "{}"));
  } catch {
    return null;
  }
}
