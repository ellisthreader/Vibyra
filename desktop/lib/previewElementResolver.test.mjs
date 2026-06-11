import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import { resolvePreviewElement } from "./previewElementResolver.mjs";
import { makeProject } from "./previewTestHelpers.mjs";
import { appState } from "./state.mjs";

test("Preview element resolution trusts project-contained React source metadata", async () => {
  const { project, cleanup } = await makeProject("preview-element-react-");
  const previousProjects = appState.cachedProjects;
  try {
    await mkdir(join(project.path, "src", "components"), { recursive: true });
    await writeFile(join(project.path, "src", "components", "HeroTitle.tsx"), [
      "export function HeroTitle() {",
      "  return <h1 className=\"hero-title\">Welcome back</h1>;",
      "}"
    ].join("\n"));
    await writeFile(join(project.path, "src", "Other.tsx"), "export const Other = () => <p>Welcome back</p>;");
    appState.cachedProjects = [project];

    const result = await resolvePreviewElement({
      projectId: project.id,
      element: {
        tag: "h1",
        text: "Welcome back",
        classes: ["hero-title"],
        source: {
          framework: "react",
          component: "HeroTitle",
          file: `${project.path}/src/components/HeroTitle.tsx`,
          line: 2,
          column: 10
        }
      }
    });

    assert.equal(result.resolution.confidence, "exact");
    assert.equal(result.resolution.match.path, "src/components/HeroTitle.tsx");
    assert.equal(result.resolution.match.line, 2);
    assert.equal(result.resolution.match.column, 10);
  } finally {
    appState.cachedProjects = previousProjects;
    await cleanup();
  }
});

test("Preview element resolution requires a choice for duplicate visible text", async () => {
  const { project, cleanup } = await makeProject("preview-element-ambiguous-");
  const previousProjects = appState.cachedProjects;
  try {
    await mkdir(join(project.path, "src"), { recursive: true });
    await writeFile(join(project.path, "src", "Header.tsx"), "export const Header = () => <h1>Hello there</h1>;");
    await writeFile(join(project.path, "src", "Footer.tsx"), "export const Footer = () => <strong>Hello there</strong>;");
    appState.cachedProjects = [project];

    const result = await resolvePreviewElement({
      projectId: project.id,
      element: { tag: "h1", text: "Hello there", classes: [], source: {} }
    });

    assert.equal(result.resolution.confidence, "ambiguous");
    assert.equal(result.resolution.match, null);
    assert.equal(result.resolution.candidates.length, 2);
  } finally {
    appState.cachedProjects = previousProjects;
    await cleanup();
  }
});

test("Preview element resolution stays inside the selected monorepo app", async () => {
  const { project, cleanup } = await makeProject("preview-element-monorepo-");
  const previousProjects = appState.cachedProjects;
  try {
    await mkdir(join(project.path, "apps", "one", "src"), { recursive: true });
    await mkdir(join(project.path, "apps", "two", "src"), { recursive: true });
    await writeFile(join(project.path, "apps", "one", "src", "App.tsx"), "export const App = () => <h1>First app</h1>;");
    await writeFile(join(project.path, "apps", "two", "src", "App.tsx"), "export const App = () => <h1>Second app</h1>;");
    appState.cachedProjects = [project];

    const result = await resolvePreviewElement({
      projectId: project.id,
      appDirectory: "apps/two",
      element: {
        tag: "h1",
        text: "Second app",
        source: { framework: "react", component: "App", file: "/src/App.tsx", line: 1 }
      }
    });

    assert.equal(result.resolution.confidence, "exact");
    assert.equal(result.resolution.match.path, "apps/two/src/App.tsx");
  } finally {
    appState.cachedProjects = previousProjects;
    await cleanup();
  }
});

test("Preview element resolution accepts an exact app-relative source before fallback scanning", async () => {
  const { project, cleanup } = await makeProject("preview-element-direct-");
  const previousProjects = appState.cachedProjects;
  try {
    await mkdir(join(project.path, "apps", "web", "src"), { recursive: true });
    await writeFile(join(project.path, "apps", "web", "src", "Title.tsx"), "export const Title = () => <h1>Fast title</h1>;");
    appState.cachedProjects = [project];

    const result = await resolvePreviewElement({
      projectId: project.id,
      appDirectory: "apps/web",
      element: {
        tag: "h1",
        text: "Fast title",
        source: { framework: "react", component: "Title", file: "/src/Title.tsx", line: 1 }
      }
    });

    assert.equal(result.resolution.confidence, "exact");
    assert.equal(result.resolution.match.path, "apps/web/src/Title.tsx");
  } finally {
    appState.cachedProjects = previousProjects;
    await cleanup();
  }
});
