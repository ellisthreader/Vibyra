const STATIC_PREVIEW_ENTRIES = [
  "index.html",
  "dist/index.html",
  "build/index.html",
  "public/index.html",
  "web/index.html",
  "out/index.html",
  ".output/public/index.html",
  "www/index.html",
  "app/index.html",
  "client/dist/index.html",
  "frontend/dist/index.html",
  "apps/web/dist/index.html",
  "packages/web/dist/index.html",
  "storybook-static/index.html",
  "docs/index.html",
  "game/index.html",
  "demo/index.html"
];

const PREVIEW_HINTS = {
  "laravel-inertia-react": ["Laravel/Inertia apps need PHP and Vite running before the real app can be streamed.", "php artisan serve --host 0.0.0.0", "npm run dev -- --host 0.0.0.0"],
  laravel: ["Laravel backends need the PHP app server running before dynamic pages can be streamed.", "php artisan serve --host 0.0.0.0"],
  "next-tailwind": ["Next.js apps can be previewed from a running dev server or exported static build.", "npm run dev -- --hostname 0.0.0.0", "npm run build"],
  "react-tailwind": ["React/Vite apps preview from a static entry or Vite dev server.", "npm run dev -- --host 0.0.0.0", "npm run build"],
  "react-node": ["React service apps preview from the web client; backend APIs may also need to run.", "npm run dev -- --host 0.0.0.0"],
  "vue-vite": ["Vue/Vite apps preview from a static entry or Vite dev server.", "npm run dev -- --host 0.0.0.0", "npm run build"],
  angular: ["Angular apps preview from the Angular dev server or a browser build.", "npm start -- --host 0.0.0.0", "npm run build"],
  nuxt: ["Nuxt apps preview from a running Nuxt server or generated static output.", "npm run dev -- --host 0.0.0.0", "npm run generate"],
  sveltekit: ["SvelteKit apps preview from the dev server or static adapter output.", "npm run dev -- --host 0.0.0.0", "npm run build"],
  astro: ["Astro sites preview from generated HTML or the Astro dev server.", "npm run dev -- --host 0.0.0.0", "npm run build"],
  remix: ["Remix apps need their Node server running unless exported as static files.", "npm run dev -- --host 0.0.0.0"],
  gatsby: ["Gatsby sites preview from public HTML or the Gatsby dev server.", "npm run develop -- --host 0.0.0.0", "npm run build"],
  "expo-react-native": ["Native Expo apps do not expose a browser page by default; use an Expo web build or generated preview.", "npx expo start --web --host lan"],
  "react-native-cli": ["React Native projects need a web target or generated browser preview for phone WebView testing.", "npm run web"],
  django: ["Django apps need the Python web server running before dynamic pages can be streamed.", "python manage.py runserver 0.0.0.0:8000"],
  phaser: ["Phaser games preview from an HTML entry or Vite/dev server.", "npm run dev -- --host 0.0.0.0"],
  three: ["Three.js projects preview from an HTML entry or Vite/dev server.", "npm run dev -- --host 0.0.0.0"],
  flutter: ["Flutter projects need a web build for phone WebView preview.", "flutter run -d web-server --web-hostname 0.0.0.0"],
  tauri: ["Tauri apps preview from their web frontend; the desktop shell itself is not phone-renderable.", "npm run dev -- --host 0.0.0.0"],
  godot: ["Godot projects need an HTML5 export before phone preview can stream the game.", "Export HTML5 from Godot"],
  unity: ["Unity projects need a WebGL build before phone preview can stream the game.", "Build WebGL from Unity"]
};

export { STATIC_PREVIEW_ENTRIES };

export function analyzedProjectPreviewHtml(project) {
  const brief = project.detectedBrief ?? project.brief ?? {};
  const frameworkId = brief.frameworkId || "";
  const hint = PREVIEW_HINTS[frameworkId] ?? genericHint(project);
  const evidence = project.analysis?.techEvidence?.length ? project.analysis.techEvidence : project.analysis?.evidence ?? [];
  const commands = hint.slice(1).filter(Boolean);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(project.name)} preview</title>
    <style>
      :root { color-scheme: dark; --bg: #080A12; --panel: #111522; --line: #283044; --text: #F5F1FF; --muted: #B9B4C8; --accent: #8B5CF6; --ok: #62D49B; }
      * { box-sizing: border-box; }
      body { margin: 0; min-height: 100vh; background: radial-gradient(circle at 20% 0%, rgba(139,92,246,.18), transparent 34%), var(--bg); color: var(--text); font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      main { margin: 0 auto; max-width: 780px; padding: 28px 18px 36px; }
      .status { align-items: center; color: var(--ok); display: flex; font-size: 13px; font-weight: 800; gap: 8px; letter-spacing: .03em; text-transform: uppercase; }
      .dot { background: var(--ok); border-radius: 99px; height: 9px; width: 9px; }
      h1 { font-size: clamp(31px, 8vw, 54px); line-height: 1; margin: 18px 0 12px; overflow-wrap: anywhere; }
      p { color: var(--muted); font-size: 16px; font-weight: 650; line-height: 1.55; margin: 0; }
      section { border: 1px solid var(--line); border-radius: 16px; background: rgba(17,21,34,.88); margin-top: 18px; padding: 18px; }
      h2 { font-size: 15px; margin: 0 0 10px; }
      .stack { color: #DED6FF; font-size: 18px; font-weight: 850; margin-top: 8px; }
      ul { color: var(--muted); margin: 12px 0 0; padding-left: 20px; }
      li { margin: 7px 0; }
      code { background: #070A12; border: 1px solid rgba(255,255,255,.08); border-radius: 8px; color: #E9E2FF; display: block; font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 13px; line-height: 1.45; margin-top: 8px; overflow-x: auto; padding: 10px; white-space: pre; }
      .chips { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
      .chip { border: 1px solid rgba(139,92,246,.38); border-radius: 999px; color: #D9CCFF; font-size: 12px; font-weight: 800; padding: 7px 10px; }
    </style>
  </head>
  <body>
    <main>
      <div class="status"><span class="dot"></span> Project analyzed</div>
      <h1>${escapeHtml(project.name)}</h1>
      <p>${escapeHtml(project.analysis?.summary || "Vibyra can open this project on your phone. A built browser entry was not found yet, so this analyzed preview is shown immediately.")}</p>
      <section>
        <h2>Detected stack</h2>
        <div class="stack">${escapeHtml(project.stack || brief.frameworkLabel || "Project")}</div>
        <p>${escapeHtml(hint[0])}</p>
        ${commands.length ? `<ul>${commands.map((command) => `<li><code>${escapeHtml(command)}</code></li>`).join("")}</ul>` : ""}
      </section>
      <section>
        <h2>Preview readiness</h2>
        <p>When this project has a browser entry such as <strong>index.html</strong>, <strong>dist/index.html</strong>, <strong>build/index.html</strong>, <strong>out/index.html</strong>, or an exported game/site build, Vibyra will stream it directly here.</p>
        ${evidence.length ? `<div class="chips">${evidence.slice(0, 8).map((item) => `<span class="chip">${escapeHtml(String(item))}</span>`).join("")}</div>` : ""}
      </section>
    </main>
  </body>
</html>`;
}

function genericHint(project) {
  const evidence = new Set((project.analysis?.techEvidence ?? []).map((item) => String(item).toLowerCase()));
  if (evidence.has("vite") || evidence.has("react")) return PREVIEW_HINTS["react-tailwind"];
  if (evidence.has("php") || evidence.has("composer.json")) return ["This project may need its framework server running before dynamic pages can be streamed."];
  return ["This project does not expose a static browser entry yet. Vibyra is showing an analyzed phone-viewable project preview immediately."];
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
