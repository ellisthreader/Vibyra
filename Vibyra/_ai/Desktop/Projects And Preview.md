# Desktop - Projects And Preview

Read this for project discovery, arbitrary folder browse/search, project ids, and desktop preview behavior.

## Files

- `desktop/lib/projects.mjs`
- `desktop/lib/projectInfo.mjs`
- `desktop/lib/projectAnalysis.mjs`
- `desktop/lib/projectAnalysisMetadata.mjs`
- `desktop/lib/projectBrowse.mjs`
- `desktop/lib/projectCreate.mjs`
- `desktop/lib/preview.mjs`
- `desktop/lib/previewResolver.mjs`

## Discovery And Analysis

`desktop/lib/projects.mjs` scans cwd and common user folders. It recognizes projects by markers such as `package.json`, `.git`, `app.json`, `requirements.txt`, and `pyproject.toml`.

`projectInfo.mjs` is the source of project metadata sent to mobile. `projectAnalysis.mjs` is deterministic and capped; it shallow-scans folders, prioritizes root marker files, skips generated folders, samples small text/config files, and infers framework/purpose. It does not use AI. README/package/HTML descriptions are authoritative for the displayed summary before inferred "looks like" labels, and travel classification requires real flight terms so generic ticket/check-in words do not mislabel business apps.

`GET /desktop/analyze?path=...` returns an analyzed project after the phone selects a folder. Browse PC child rows stay cheap. Desktop still returns `briefRequired: true`; mobile requires user confirmation before saving detected briefs.

## Browse And Search

Manual folder selection uses authenticated `GET /desktop/browse?path=...`, backed by `projectBrowse.mjs`. With no path, it returns common roots. With a path, it returns current folder, parent path, and visible child files/folders; browsed folders are cached as projects.

`/desktop/browse` normalizes an existing file path back to its containing folder before listing. This prevents file-scoped mobile chat context from making Browse PC treat a selected file as the folder root.

Root listing must normalize candidates with `candidates.map((path) => resolve(path))`, not `candidates.map(resolve)`, because `Array.map` passes extra args that make `node:path.resolve` throw.

Authenticated `GET /desktop/search?q=...` finds arbitrary folders as well as marker-based projects. It ranks cached/discovered projects, then shallow-scans common folders for matching directory names and caches matches so `/files?projectId=...` can open them.

Authenticated `GET /desktop/context?projectId=...&q=...` returns VS Code-style prompt context for AI chat. `desktop/lib/projectContext.mjs` scans readable text files under the selected project, skips generated/vendor folders, ranks files by prompt intent and filename/path matches, and returns up to 100 file entries with snippets for the top matches. UI/style prompts strongly prefer frontend roots such as `src/`, `components/`, `screens/`, `styles/`, `frontend/`, `client/`, `web/`, and Laravel `resources/css|js|views`, while backend-only paths are penalized. Mobile uses this before `/api/chat` so questions like colour scheme can pull frontend/theme files even when the loaded mobile file list is backend-only.

## Project IDs

`projectById` never falls back to the first discovered project. It checks `appState.cachedProjects`, then decodes Vibyra base64url path ids for browsed/searched folders.

Desktop `/agents/start` accepts `projectPath` alongside `projectId`; Node and Laravel paths use it as a trusted-home fallback when a newly opened arbitrary folder is not in cached discovery state.

## Preview

`preview.mjs` serves static browser entries from `previewResolver.mjs` (`index.html`, `dist/`, `build/`, `out/`, `.output/public/`, app/client/frontend builds, docs/demo/game exports). If none exists, it returns a phone-viewable analyzed-project fallback instead of a blank/no-entry shell.

Preview entry selection prefers built/browser output (`dist/index.html`, `build/index.html`, `out/index.html`, etc.) before root `index.html`, and skips root Vite/source-only entries that reference `/src/main.jsx`, module source entries, or Vite client scripts. When serving nested built entries, absolute `/assets/...` references are rewritten relative to that entry directory so `dist/index.html` loads `dist/assets/...` instead of project-root `assets/...`.

Preview startup must not silently run framework dev servers. Dynamic stacks such as Laravel, Django, Next, Expo, Flutter, Unity, and Godot show typed readiness guidance until a real browser entry or approved runtime exists.
