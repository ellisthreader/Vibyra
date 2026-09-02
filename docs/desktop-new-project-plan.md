# New project flow — research and implementation plan

**Status: built.** Phases 0–4 are implemented; Phase 5 is not started. What
changed against the plan is recorded in Part 9 at the end.

Goal: the `＋` in the bottom-left corner should open a proper front door.
Two ways in — **start something new** or **open a folder you already have** —
and when you start something new, Vibyra asks what kind of thing it is, which
stack you want, and then actually scaffolds it with the official tooling.
Every question is skippable; skipping all of them still gets you a project.

---

# Part 1 — What exists today

Everything below is current behaviour, verified in the source.

| Piece | File | What it does |
| --- | --- | --- |
| The `＋` tile | `desktop-tauri/src/components/layout/ProjectStrip.tsx:78` | `data-tip="New project"` → `pickAndCreate()` |
| Home "New project" card | `desktop-tauri/src/components/home/HomeView.tsx` | same call |
| Home empty state | `HomeView.tsx` "Add your first project" | same call |
| Launch bar | `HomeLaunchBar.tsx` | typing a `/` or `~` path calls `create(path)` |
| Palette | `layout/paletteLaunchEntries.ts` | a "Start" group entry |
| The action | `state/projectStore.ts` `pickAndCreate` | native folder dialog → `create(root)` |
| The write | `projectStore.ts` `create` | dedupes by root, assigns colour, persists, activates |

So there is exactly **one** way to make a project: point at a folder that
already exists. `create()` never touches the filesystem — it only registers a
folder Vibyra now watches.

## 1.1 What's wrong with it

1. **Six entry points, one behaviour.** Every "new project" affordance opens
   the same OS folder dialog. There is no way to *start* anything.
2. **The empty-folder case is hostile.** To start fresh you must leave Vibyra,
   make a folder in a file manager, come back, and point at it.
3. **The scaffold step is invisible work.** Today you open the folder, open a
   terminal, remember whether it is `npm create vite@latest` or
   `npx create-next-app`, and paste it. Vibyra already knows how to run
   processes and already detects these frameworks afterwards
   (`vibyra-core/src/preview/detect.rs`) — it just refuses to help before.
4. **No memory of intent.** A project is `{id, name, root, colour}`. Nothing
   records that it is an Expo app, so nothing downstream can be smarter.

---

# Part 2 — The flow we are building

Five screens, one dialog, one visual language (`modal-backdrop` / `modal`,
`useModalFocus`, `btn` / `btn--primary` — same as `ProjectConfigurationDialog`).

```
                    ┌──────────────────────────────┐
   ＋ / Home card ──►│  0. Start a project          │
                    │  • Start something new       │
                    │  • Open a folder I have      │
                    │  • Clone from GitHub (ph. 5) │
                    └──────┬───────────────┬───────┘
                           │               └────────► native folder picker
                           ▼                          (today's behaviour, unchanged)
                    ┌──────────────────────────────┐
                    │  1. What are you making?     │  ← 9 tiles, "Skip" available
                    │  Website · Web app · Mobile  │
                    │  Desktop · Game · Backend    │
                    │  Library/CLI · AI app · Empty│
                    └──────────────┬───────────────┘
                                   ▼
                    ┌──────────────────────────────┐
                    │  2. Which stack?             │  ← filtered by kind, "Skip"
                    │  e.g. Mobile → Expo, RN CLI, │     missing-toolchain rows
                    │  Flutter, Ionic, Capacitor   │     are visible but disabled
                    └──────────────┬───────────────┘
                                   ▼
                    ┌──────────────────────────────┐
                    │  3. Options                  │  ← TypeScript, package
                    │  (only what this stack has)  │     manager, git init,
                    └──────────────┬───────────────┘     install deps
                                   ▼
                    ┌──────────────────────────────┐
                    │  4. Name and place           │  ← name → slug → resolved
                    │  ~/Projects/my-app           │     path, live validation
                    └──────────────┬───────────────┘
                                   ▼
                    ┌──────────────────────────────┐
                    │  5. Review → Create          │  ← shows the exact command
                    │     streamed log, cancel     │     it is about to run
                    └──────────────────────────────┘
                                   ▼
                        project registered, activated,
                        notification, terminal offered
```

## 2.1 The skip contract

"Skippable" has to mean something precise or it becomes three different
behaviours:

- **Skip on step 1 (kind)** → jumps to step 4. You get an empty folder.
- **Skip on step 2 (stack)** → jumps to step 4. You get an empty folder; the
  kind is still remembered on the project so later features can use it.
- **Skip on step 3 (options)** → every option keeps its default and you go to
  step 4.
- **Step 4 is not skippable** — a project needs a folder. It is pre-filled
  (`~/Projects/untitled-1`, deduped) so *Enter* is enough.
- **Escape / backdrop click** at any point cancels the whole thing and writes
  nothing. During a running scaffold, Escape asks first.

There is always a **Back** and the dialog remembers what you picked, so
wandering back to change the stack does not reset your name.

---

# Part 3 — The template catalog

Declarative, in the spirit of `vibyra-core/src/agents/catalog.rs`: adding a
stack is one entry, nothing else to wire up.

## 3.1 Shape

```ts
export interface ProjectTemplate {
  id: string;                    // "expo", "next", stable, persisted
  kind: ProjectKind;             // "mobile" | "website" | …
  name: string;                  // "Expo (React Native)"
  blurb: string;                 // one line, shown under the name
  requires: ToolId[];            // ["node", "npm"] — preflighted before Create
  /** argv, never a shell string. `{{name}}` / `{{dir}}` are the only tokens. */
  command: { program: string; args: string[] } | null;   // null = folder only
  options: TemplateOption[];     // typescript | packageManager | git | install
  docs: string;                  // URL shown when a tool is missing
  interactive: false;            // asserted by test — see 3.3
}
```

`command: null` covers the honest cases: an empty project, or an engine we
cannot install for you.

## 3.2 Initial content (v1)

| Kind | Stacks |
| --- | --- |
| **Website** | Next.js · Astro · SvelteKit · Nuxt · Vite + React · Vite + Vue · Angular · Plain HTML/CSS/JS |
| **Web app** | Next.js · Laravel · Django · Rails · NestJS |
| **Mobile app** | Expo · React Native CLI · Flutter · Ionic · Capacitor |
| **Desktop app** | Tauri · Electron |
| **Game** | Phaser · Three.js (Vite) · Bevy (Rust) · LÖVE · Godot (folder + project file) |
| **Backend / API** | FastAPI · Express · NestJS · Go module · Axum (Rust) · Laravel API |
| **Library / CLI** | TypeScript package · Python (uv) · Rust (cargo) · Go module |
| **AI app** | Claude Agent SDK starter (TS) · Claude Agent SDK starter (Python) · MCP server |
| **Empty** | Just a folder |

Unity and Unreal are deliberately **out**: their project creation is not a CLI
we can drive, and pretending otherwise would create broken folders.

When the AI-app templates are built, load the `claude-api` skill first and take
the package names and model ids from it — do not write them from memory.

## 3.3 The single biggest correctness risk: interactive scaffolders

`npx create-next-app` and friends ask questions when they are not given
flags. Our runner has **no TTY**, so a template whose argv is not fully
non-interactive hangs forever and looks like a freeze.

Three defences, all required:

1. Every entry declares complete non-interactive argv (`--yes`, `--ts`,
   `--template …`, `--no-git`, `--skip-install` where we install ourselves).
2. A test asserts every entry carries `interactive: false` **and** that its
   args contain at least one of the known non-interactive flags.
3. A **stall guard** in the runner: no output for 90 s → stop waiting, offer
   *"This is asking for input. Open it in a terminal?"*, which hands the exact
   command to a `shell` pane in the destination folder.

Every command in the catalog must be run once, for real, in a scratch
directory before it ships. That is a checklist item in Phase 3, not a hope.

---

# Part 4 — Architecture

## 4.1 Frontend (`desktop-tauri/src/`)

All files ≤200 lines (`npm run lines`), one component per file.

```
lib/projectTemplateTypes.ts     types above, no data
lib/projectTemplates.ts         the catalog (split per-kind if it grows)
lib/projectTemplateCommand.ts   selections → argv. Pure. Unit-tested.
lib/projectDestination.ts       name → slug → resolved path, validation. Pure.
state/projectCreateStore.ts     wizard state machine: step, picks, run status
ipc/scaffold.ts                 typed wrapper over the two Rust commands
components/projects/new/
  NewProjectDialog.tsx          shell: header, step router, footer, focus trap
  StartChoiceStep.tsx           new / open existing / (clone)
  KindStep.tsx                  the 9 tiles
  StackStep.tsx                 stacks for the kind, with preflight state
  OptionsStep.tsx               only the options this template declares
  DestinationStep.tsx           name + parent folder + resolved path
  ReviewStep.tsx                summary + the literal command
  ScaffoldRunView.tsx           progress, last line, log disclosure, cancel
styles/project-new.css          new sheet, imported from main.tsx
```

`projectStore.pickAndCreate` stays exactly as it is — the "open a folder"
branch calls it. The six entry points listed in Part 1 all switch to opening
the dialog instead, so there is one front door and one code path behind it.

## 4.2 Rust (`src-tauri/`)

```
crates/vibyra-core/src/scaffold/
  mod.rs         public surface
  plan.rs        validate destination + resolve argv (traversal, non-empty dir)
  preflight.rs   tool presence, reusing agents::catalog::program_in_path
  run.rs         spawn, stream stdout+stderr as lines, exit code, cancel
  tests.rs       plan/preflight/argv tests
src/commands/scaffold.rs   #[tauri::command] scaffold_preflight / scaffold_run
                           + registration in commands/registry.rs
```

Two traps that will bite if ignored:

- **Environment.** The child must go through
  `launch_env::sanitize_command(&mut cmd)` like every other spawned process.
  Without it, an AppImage launch hands `npx` and `python3` a poisoned
  `LD_LIBRARY_PATH` / `PYTHONHOME` and they fail in ways that look like the
  template being broken (see the README's *Process environment* section).
- **Windows.** Node-shipped CLIs are `npm.cmd`, not `npm`, and `Command`
  without a shell will not find them. Resolve the program through a
  `#[cfg(windows)]` helper, and keep any cfg-only `use` **inside** that
  function — a Linux clippy run cannot see a Windows-only build break.

## 4.3 IPC contract

```ts
// preflight: which of these tools are on PATH right now?
scaffoldPreflight(tools: ToolId[]): Promise<Record<ToolId, boolean>>

// run: streams lines, resolves with the exit code
scaffoldRun(request: {
  dir: string;            // absolute, must not exist or must be empty
  program: string;
  args: string[];
  gitInit: boolean;
}, onLine: (line: string) => void): Promise<{ code: number | null }>

scaffoldCancel(runId: string): Promise<void>
```

Output is bounded the way preview logs are (`preview/process.rs` keeps 160
lines, truncates at 1000 chars) — a noisy installer must not grow the renderer
heap.

## 4.4 Persistence

`ProjectSpec` gains two optional fields, frontend (`src/types.ts`) and Rust
(`vibyra-core/src/settings.rs`). The Rust struct already carries
`#[serde(default, rename_all = "camelCase")]`, so old `settings.json` files
keep loading:

```ts
templateId?: string;   // "expo"
createdMs?: number;    // when Vibyra made it, vs. when it was first opened
```

Nothing in v1 reads them back. They are there so the next feature — preview
defaults, agent prompt context, "start the dev server" — does not need a
migration.

---

# Part 5 — Rules and edge cases

| Situation | Behaviour |
| --- | --- |
| Destination exists and is non-empty | Blocked at step 4 with the reason. No overwrite, ever. |
| Destination exists and is empty | Allowed; we scaffold into it. |
| Parent not writable / missing | Blocked at step 4, before anything runs. |
| Name with spaces or punctuation | Slugged live; the resolved path is shown so there is no surprise. |
| Required tool missing | Stack row stays visible but disabled, with what is missing and a docs link. We never install toolchains. |
| Scaffold fails (non-zero exit) | Project is **not** registered. Log stays on screen with *Retry*, *Open the folder anyway*, *Cancel*. Partial folder is left alone — never auto-deleted. |
| Scaffold cancelled | Child killed, folder left as-is, nothing registered, one line saying where the leftovers are. |
| Scaffold stalls 90 s with no output | Handoff to a `shell` pane in that folder with the command pre-typed. |
| Success | Register → activate → `notificationStore.push({kind:"project", tier:"done"})` → offer to open a terminal. |
| Folder already a Vibyra project | Existing dedupe in `create()` wins: it activates instead of duplicating. |

---

# Part 6 — Phases

Each phase is shippable and leaves the app in a working state.

**Phase 0 — contract (no UI).**
Types, catalog data, `projectTemplateCommand`, `projectDestination`, and their
tests. Nothing rendered. This is where the argv are decided and reviewed.

**Phase 1 — the front door.**
`NewProjectDialog` + `StartChoiceStep`. "Open a folder I have" calls the
existing `pickAndCreate`; "Start something new" is disabled with a "coming
next" note or hidden behind the remaining steps as they land. All six entry
points repointed. *Ship-able on its own: the corner button now explains
itself.*

**Phase 2 — the questions.**
Kind → Stack → Options → Destination → Review, ending in **create the folder
and register it** — no scaffolding yet. Skip works end to end. At this point
"start a new empty project without leaving Vibyra" is solved.

**Phase 3 — the scaffolder.**
Rust `scaffold` module, the two commands, `ScaffoldRunView`, preflight,
cancel, stall guard, failure handling. **Includes running every catalog
command for real in a scratch directory and recording the result.**

**Phase 4 — after the build.**
Post-create offers: open a terminal in the folder, `git init`, and — since
`preview_inspect` already recognises what we just made — "start the dev
server". Palette entry "Start a new project…". Home empty-state copy.

**Phase 5 — nice to have, not blocking.**
Clone from GitHub (the integration already exists). A bounded scan of
`~/Projects`, `~/code`, `~/dev`, `~/Desktop` for git repos as one-click
suggestions on the "open a folder" branch (depth 2, cap 200, skip
`node_modules`). Custom templates in settings, which the catalog shape already
allows.

---

# Part 7 — Verification

Per-phase, before calling anything done:

```bash
cd desktop-tauri
npm run verify     # lines + knip + tests + tsc/build + fmt + clippy + rust test
```

New tests:

| Test | Asserts |
| --- | --- |
| `tests/projectTemplates.test.mjs` | ids unique; every kind has ≥1 stack; every stack has `command` or is explicitly folder-only; every command carries a non-interactive flag; every `requires` names a known tool |
| `tests/projectTemplateCommand.test.mjs` | selections → argv, including package manager and TypeScript switches; `{{name}}`/`{{dir}}` substitution; no shell metacharacters survive |
| `tests/projectDestination.test.mjs` | slugging, dedupe (`untitled-1`, `untitled-2`), `~` expansion, rejection of traversal |
| `tests/projectCreateFlow.test.mjs` | the state machine: skip from each step lands on Destination; Back preserves picks; cancel writes nothing |
| `scaffold/tests.rs` | non-empty-dir rejection, path traversal rejection, argv resolution, preflight against a fake PATH |

Manual pass, on the installed AppImage rather than `npm run app:dev` — the
environment difference is exactly what breaks scaffolders:

1. Expo template end to end, then `preview` starts it.
2. A template whose tool is missing (Flutter, if not installed) — row disabled,
   never spawns.
3. Cancel mid-`npm install` — child dies, nothing registered.
4. Skip everything — empty folder, project appears, terminal opens in it.

---

# Part 8 — Decisions worth making before Phase 0

1. **Default parent folder.** `~/Projects` (created on demand) or the last
   parent used? Recommendation: last-used, falling back to `~/Projects`.
2. **Do we install dependencies?** Most scaffolders install by default and it
   is the slow part. Recommendation: yes by default, with a checkbox to skip,
   because "it opened and `npm run dev` works" is the promise.
3. **Catalog size at launch.** The v1 table is ~35 entries and every one needs
   a real run to verify. Trimming to the top 3 per kind (~20) halves Phase 3
   without weakening the feature.


---

# Part 9 — What was built, and where it differs

Implemented in one pass: the dialog, the catalog, the Rust scaffolder, and the
post-create handoff. Five deliberate departures from the plan above:

1. **No TypeScript or package-manager option.** Encoding a per-template
   language switch made every catalog entry a special case, and package
   managers differ in argument syntax (`npm create x -- --flag` versus
   `pnpm create x --flag`), which is exactly how a wrong flag ships. The
   catalog is TypeScript-first instead, and the options step carries three
   uniform toggles: install dependencies, start a git repository, open a
   terminal when it is done. Package manager is a clean follow-up.
2. **Steps, not one command.** A template is a list of steps, each with its own
   working directory (`parent` or `project`) and phase (`create` or `install`).
   That is what lets `cargo new` + `cargo add bevy`, a venv + `pip install`,
   and `create-next-app --skip-install` + `npm install` all be data.
3. **Seeds.** Templates may write a handful of small files instead of running
   anything, which is what makes Plain HTML, LÖVE, Godot, Express, FastAPI and
   the TypeScript package real entries rather than empty folders. Seed paths
   are validated in Rust — a path with a `..` component is refused.
4. **`{{venv}}` resolves in Rust.** Only that side knows a virtual environment
   puts its binaries in `bin` on Unix and `Scripts` on Windows. `{{name}}` and
   `{{Name}}` still resolve in TypeScript, where they are unit-tested.
5. **`Other…` on the stack step.** A shortlist filtered by kind is wrong for
   somebody, so the last row of every stack list swaps it for the whole
   catalog, searchable, each row labelled with the kind it is filed under.
   It reuses the command palette's matcher rather than a second one. Browsing
   is a *view* of question two — same step, same title, same rail — and picking
   a stack filed elsewhere relabels the review line rather than printing
   "Making: Game / With: Next.js" (`kindForTemplate`).
6. **Failure offers the folder, not a retry.** A second run into a folder the
   first run half-filled would only be refused for finding files there, so the
   failure screen offers *Open the folder anyway*; *Try again* appears only
   when nothing ran.

## Files

| Layer | Files |
| --- | --- |
| Catalog | `lib/projectTemplateTypes.ts`, `projectTemplateKinds.ts`, `projectTemplateHelpers.ts`, `projectTemplateSeeds.ts`, `projectTemplateSeedsAi.ts`, `projectTemplatesWeb.ts`, `projectTemplatesBackend.ts`, `projectTemplatesApps.ts`, `projectTemplatesCode.ts`, `projectTemplates.ts` |
| Logic | `lib/projectDestination.ts`, `projectTemplateCommand.ts`, `projectCreateFlow.ts`, `projectStackSearch.ts`, `projectCreateRun.ts` |
| State | `state/projectCreateStore.ts` |
| UI | `components/projects/new/` (10 files), `styles/project-new*.css` (5 sheets) |
| IPC | `ipc/scaffold.ts`, `src-tauri/src/commands/scaffold.rs` |
| Rust | `vibyra-core/src/scaffold/{mod,plan,preflight,run,tests}.rs` |

## Catalog verification

Every template's commands were run for real in a scratch directory on Linux.
Verified working: next, vite-react, vite-vue, astro, sveltekit, angular, nest,
laravel, express, axum, expo, react-native, tauri, electron, phaser, threejs,
bevy, rust-cli, ts-library, claude-node, django, fastapi, claude-python.
Seeded projects were run, not just written: Express serves, the TypeScript
package compiles to `dist/`.

**Not verified**, because the toolchain is absent on this machine: `rails`,
`go-module`, `flutter`. Preflight disables those rows for anyone in the same
position, so the untested path is also unreachable — but re-run them on a
machine that has Ruby, Go and Flutter before treating them as proven.

**Not verified**: the dialog in a running window. The workspace mounts only
behind the account gate, and signing in is the user's to do.
