export function detectBrief(scan, purpose) {
  const deps = packageDeps(scan);
  const scripts = packageScripts(scan);
  const names = scan.names;
  const kind = purpose?.kindId && purpose?.kindLabel
    ? { id: purpose.kindId, label: purpose.kindLabel }
    : { id: "saas", label: "SaaS product" };

  if (names.has("artisan") && deps.has("@inertiajs/react")) {
    return brief(kind.id, kind.label, "laravel-inertia-react", "Laravel + Inertia React + Tailwind", "Detected Laravel, Inertia React, Vite, and Tailwind.");
  }
  if (names.has("artisan")) return brief("api", "Backend/API", "laravel", "Laravel", "Detected Laravel artisan.");
  if (has(names, "angular.json") || deps.has("@angular/core")) return brief("website", "Website", "angular", "Angular", "Detected Angular workspace markers.");
  if (has(names, "nuxt.config.js", "nuxt.config.mjs", "nuxt.config.ts") || deps.has("nuxt")) return brief("website", "Website", "nuxt", "Nuxt", "Detected Nuxt config or dependency.");
  if (has(names, "svelte.config.js", "svelte.config.mjs", "svelte.config.ts") || deps.has("@sveltejs/kit") || deps.has("svelte")) return brief("website", "Website", "sveltekit", "SvelteKit", "Detected Svelte or SvelteKit.");
  if (has(names, "astro.config.js", "astro.config.mjs", "astro.config.ts") || deps.has("astro")) return brief("website", "Website", "astro", "Astro", "Detected Astro config or dependency.");
  if (has(names, "remix.config.js", "remix.config.mjs") || deps.has("@remix-run/react")) return brief("website", "Website", "remix", "Remix", "Detected Remix config or dependency.");
  if (has(names, "gatsby-config.js", "gatsby-config.mjs", "gatsby-config.ts") || deps.has("gatsby")) return brief("website", "Website", "gatsby", "Gatsby", "Detected Gatsby config or dependency.");
  if (has(names, "next.config.js", "next.config.mjs", "next.config.ts") || deps.has("next") || scripts.includes("next")) {
    return brief("saas", "SaaS product", "next-tailwind", "Next.js + Tailwind", "Detected Next.js from config, dependencies, or scripts.");
  }
  if (deps.has("phaser")) return brief("game", "Game", "phaser", "Phaser", "Detected Phaser dependency.");
  if (deps.has("three")) return brief("game", "Game", "three", "Three.js", "Detected Three.js dependency.");
  if (has(names, "vite.config.js", "vite.config.mjs", "vite.config.ts") || deps.has("vite") || scripts.includes("vite")) {
    if (deps.has("vue")) return brief("website", "Website", "vue-vite", "Vue + Vite", "Detected Vue and Vite.");
    if (hasSaasDeps(deps)) return brief("saas", "SaaS product", "react-node", "React + Node API", "Detected Vite with SaaS service dependencies.");
    return brief("website", "Website", "react-tailwind", "React + Tailwind", "Detected Vite or React browser tooling.");
  }
  if (has(names, "app.json", "app.config.js", "app.config.ts") || deps.has("expo")) {
    return brief("mobile-app", "Phone app", "expo-react-native", "Expo React Native", "Detected Expo app markers.");
  }
  if (deps.has("react-native")) return brief("mobile-app", "Phone app", "react-native-cli", "React Native CLI", "Detected React Native dependency.");
  if (names.has("manage.py")) return brief("api", "Backend/API", "django", "Django", "Detected Django manage.py.");
  if (has(names, "pubspec.yaml")) return brief("mobile-app", "Phone app", "flutter", "Flutter", "Detected Flutter pubspec.");
  if (has(names, "tauri.conf.json") || deps.has("@tauri-apps/api")) return brief("desktop-app", "Desktop app", "tauri", "Tauri", "Detected Tauri app markers.");
  if (has(names, "project.godot")) return brief("game", "Game", "godot", "Godot", "Detected Godot project file.");
  if (has(names, "ProjectSettings")) return brief("game", "Game", "unity", "Unity", "Detected Unity project settings.");
  if (deps.has("react")) return brief("website", "Website", "react-tailwind", "React + Tailwind", "Detected React dependency.");
  if (names.has("index.html")) return brief("website", "Website", "vite-css", "Vite + CSS", "Detected static HTML entry file.");
  return null;
}

export function techEvidence(scan, detectedBrief) {
  const deps = packageDeps(scan);
  const signals = [];
  if (scan.names.has("artisan")) signals.push("artisan");
  if (scan.names.has("composer.json")) signals.push("composer.json");
  if (scan.names.has("package.json")) signals.push("package.json");
  if (deps.has("@inertiajs/react")) signals.push("@inertiajs/react");
  if (deps.has("react")) signals.push("react");
  if (deps.has("vite") || has(scan.names, "vite.config.js", "vite.config.mjs", "vite.config.ts")) signals.push("vite");
  for (const name of ["angular.json", "nuxt.config.ts", "svelte.config.ts", "astro.config.ts", "remix.config.js", "gatsby-config.js", "pubspec.yaml", "project.godot"]) {
    if (scan.names.has(name)) signals.push(name);
  }
  if (deps.has("tailwindcss") || has(scan.names, "tailwind.config.js", "tailwind.config.cjs", "tailwind.config.ts")) signals.push("tailwindcss");
  if (!signals.length && detectedBrief) signals.push(detectedBrief.frameworkLabel);
  return signals.slice(0, 8);
}

function packageDeps(scan) {
  const deps = new Set();
  for (const pkg of scan.packages) {
    for (const group of [pkg.dependencies, pkg.devDependencies]) {
      for (const name of Object.keys(group ?? {})) deps.add(name);
    }
  }
  return deps;
}

function packageScripts(scan) {
  return scan.packages.flatMap((pkg) => Object.values(pkg.scripts ?? {})).join(" ").toLowerCase();
}

function has(names, ...values) {
  return values.some((value) => names.has(value));
}

function hasSaasDeps(deps) {
  return ["@clerk/nextjs", "@supabase/supabase-js", "next-auth", "prisma", "stripe"].some((name) => deps.has(name));
}

function brief(kindId, kindLabel, frameworkId, frameworkLabel, frameworkDescription) {
  return { kindId, kindLabel, frameworkId, frameworkLabel, frameworkDescription };
}
