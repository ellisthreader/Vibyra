---
title: Clear DBS Workspace Misrouting Incident Report
date: 2026-06-29
tags:
  - incident-report
  - vibyra
  - codex
  - workspace-routing
status: open
---

# Clear DBS Workspace Misrouting Incident Report

## Summary

The `C:\Users\Ellis\Desktop\clear dbs` workspace repeatedly opened as an almost empty folder because it started as a placeholder created after a failed repository lookup, then Vibyra desktop project discovery treated that placeholder as a valid project. The original placeholder contained only `README.txt`, whose text said no GitHub repository named or matching `clear dbs` was found under the authenticated GitHub account `ellisthreader` on 2026-06-27.

On 2026-06-29, the actual project source was found locally at `/home/ellis/Desktop/RelayClarity`, whose git remote is `https://github.com/ellisthreader/test-zoom-project.git`. That source was copied into `C:\Users\Ellis\Desktop\clear dbs`, so the immediate workspace now contains real files, but the underlying selection/discovery behavior still needs a product fix to prevent recurrence.

## Evidence

- Placeholder path: `C:\Users\Ellis\Desktop\clear dbs`.
- Placeholder file: `README.txt`, created and last modified on 2026-06-27 21:25:34.
- Placeholder content: no GitHub repository named or matching `clear dbs` was found under account `ellisthreader`; it asked for the exact repo URL/name.
- Before repair, `clear dbs` had no `.git`, no `.agents`, no `.codex`, no source folders, and was not a git repo.
- Real local source was found at `/home/ellis/Desktop/RelayClarity`.
- Real source remote: `origin https://github.com/ellisthreader/test-zoom-project.git`.
- Vibyra desktop project discovery code is in `C:\Users\Ellis\Desktop\vibyra\desktop\lib\projectDiscovery.mjs`.
- The discovery test fixture in `projectDiscovery.test.mjs` explicitly creates a top-level folder named `clear dbs` containing only `README.txt` and asserts that it is discoverable as a project.
- `projectSearch.mjs` can also add arbitrary folder-name matches as project results without requiring `.git`, `package.json`, or another project marker.

## Root Cause

The root cause is not that the source files randomly disappeared. The local system selected or created the wrong folder.

The most likely chain is:

1. A request or workflow tried to open or clone a project named `clear dbs`.
2. GitHub lookup failed because the actual repo is named `test-zoom-project`, not `clear dbs`.
3. A placeholder folder was created at `C:\Users\Ellis\Desktop\clear dbs` with only `README.txt` explaining the failed lookup.
4. Vibyra desktop discovery later treated that top-level Desktop folder as a valid project even though it had no project markers.
5. Codex was launched with `cwd=C:\Users\Ellis\Desktop\clear dbs`, so it correctly saw only the placeholder file.

This is a project routing/discovery problem, not a codebase loss problem.

## Contributing Factors

### Loose plain-folder discovery

`projectDiscovery.mjs` allows top-level folders under common containers such as Desktop, Documents, Downloads, Code, Projects, and Work to be discovered without project markers. The relevant behavior is that `scanChildren()` calls `maybeAddProject(childPath, ..., includePlainChildren && depth === 0)` for top-level children of these roots.

This means a folder can be treated as a project if it is merely a top-level Desktop folder, even if it contains only a note.

### Test coverage locks in the bad behavior

`projectDiscovery.test.mjs` includes a test called `top-level folders in project container roots are discoverable without markers`. The fixture is specifically:

```js
const plainProject = join(root, "clear dbs");
await mkdir(plainProject, { recursive: true });
await writeFile(join(plainProject, "README.txt"), "plain desktop project");
```

The test then asserts this folder is discovered. That makes the exact failure mode intentional behavior today.

### Search promotes folder-name matches

`projectSearch.mjs` searches folder names up to depth 5 and calls `projectFromPath(path)` when the folder name matches. It does not require markers before converting a matching folder into a project. A query for `clear dbs` can therefore promote the placeholder folder into search results.

### Project IDs encode paths

`projectInfo.mjs` creates project IDs by base64url-encoding the absolute path. Once the bad path is discovered, it can behave like a stable project identity. If a UI or agent request carries that ID or path, later operations resolve back to the same placeholder.

### Naming mismatch

The human-facing/project request name was `clear dbs`, but the actual local/repo identity is `test zoom project` / `test-zoom-project`. That mismatch makes fuzzy project search likely to pick the placeholder rather than the real repo unless there is a stronger project identity mapping.

## Current State After Repair

- `C:\Users\Ellis\Desktop\clear dbs` now contains copied source from `/home/ellis/Desktop/RelayClarity`.
- The copied workspace has git metadata pointing at `https://github.com/ellisthreader/test-zoom-project.git`.
- Dependencies were installed in `clear dbs` with `npm install`.
- `npm run build` passes after the repair.
- The local app was started on `http://localhost:5180/` because ports 5173 and 5174 were already occupied.
- The original placeholder `README.txt` still exists in the repaired folder as an untracked file and should be removed once the team is confident it is no longer needed.

## Risk

This can happen again whenever a placeholder or non-project folder exists as a top-level folder under Desktop/Documents/etc. The discovery layer may show it as a project, search may rank it for a matching name, and the agent can be launched in that folder with no source files.

The highest-risk symptoms are:

- Workspace contains only `README.txt` or a small note file.
- `git status` says `fatal: not a git repository`.
- The folder name is project-like but the repo remote/name is different.
- A failed clone/search note is left inside a top-level Desktop folder.

## Recommended Fixes

### 1. Stop treating arbitrary top-level folders as projects by default

Change `projectDiscovery.mjs` so plain folders are not auto-discovered from Desktop/Documents/Downloads unless explicitly selected by the user. Project markers such as `.git`, `package.json`, `index.html`, `composer.json`, `pyproject.toml`, etc. should be required for automatic discovery.

Suggested behavior:

- Automatic discovery: require markers.
- Explicit browse/select: allow plain folders.
- Search result for plain folder: label as `Folder`, not `Project`, and require explicit confirmation before using as a coding workspace.

### 2. Add placeholder-folder rejection

If a folder contains only `README.txt` and the README text says a GitHub repository was not found, do not treat it as a project. Show a recovery action instead: `Add repo URL`, `Clone exact repo`, or `Choose existing local folder`.

### 3. Require marker validation in `projectSearch.mjs`

Before `addFolderMatch()` returns a `projectFromPath()`, verify that the folder has project markers unless it was explicitly user-selected. This prevents name-only matches from turning notes/placeholders into agent workspaces.

### 4. Improve repo-name aliasing

Store an alias mapping between the display/customer name and the actual source repo/path:

- Display/customer: `ClearDBS`
- Local folder: `/home/ellis/Desktop/RelayClarity`
- GitHub repo: `ellisthreader/test-zoom-project`

When the user asks for ClearDBS, route to the known source path instead of searching for a folder literally named `clear dbs`.

### 5. Add an agent preflight guard

Before Codex starts work in a selected folder, check:

- Is this a git repo?
- Does it contain project markers?
- Does it contain more than a placeholder README?
- Does the requested project name conflict with the git remote/repo identity?

If the check fails, stop and ask for repo/path confirmation instead of proceeding inside the placeholder.

### 6. Clean up the repaired workspace

After committing or backing up current work, remove accidental placeholder/generated artifacts from `clear dbs` if they are not wanted:

- `README.txt` from the failed repo lookup.
- `dist/` if build output should not be kept.
- `node_modules/` if the workspace should stay lightweight.
- `.tools/` if it is not part of the intended repo copy.

Do this only after confirming the repaired folder is the intended permanent workspace.

## Suggested Regression Tests

Add or update tests in Vibyra desktop:

1. A top-level Desktop folder containing only `README.txt` with failed-repo text is not auto-discovered.
2. A top-level Desktop folder containing only arbitrary notes is not auto-discovered as a coding project.
3. Explicitly selected plain folders still work.
4. Search for a plain folder name returns a folder result that requires confirmation, not an immediate project object.
5. A known alias `ClearDBS -> test-zoom-project` resolves to the real repo path before fuzzy folder search.

## Immediate Operator Checklist

- [x] Confirmed `clear dbs` was originally a placeholder, not a git repo.
- [x] Found real project at `/home/ellis/Desktop/RelayClarity`.
- [x] Copied real source into `C:\Users\Ellis\Desktop\clear dbs`.
- [x] Installed dependencies in the repaired workspace.
- [x] Verified `npm run build` passes.
- [ ] Patch Vibyra project discovery/search so this cannot recur.
- [ ] Decide whether `clear dbs` should remain as a permanent copy or whether work should move back to `test zoom project`.
- [ ] Remove the stale placeholder `README.txt` once no longer needed.

## Conclusion

The repeated empty-workspace issue is caused by permissive local project discovery and search accepting a failed-clone placeholder as a valid project. The files were not lost; the agent was routed to the wrong folder. The durable fix belongs in Vibyra desktop project discovery/search: require real project markers for automatic discovery, reject known failed-repo placeholders, and maintain explicit aliases from customer/project names to actual repo paths.
