import assert from "node:assert/strict";
import test from "node:test";
import { loadRelease } from "./projectPublishRelease.testSupport.mjs";

test("duplicate project-not-found failures become one actionable folder error", async () => {
  const { publicPreviewPublishError } = await loadRelease();
  const message = publicPreviewPublishError({
    hostedDemo: { message: "Project not found", status: "failed" },
    previewHtml: "",
    projectPath: "/home/user/apps/shop",
    runtimeBundle: { message: "Project not found", status: "failed" },
    visibility: "public"
  });

  assert.equal(message, "Vibyra Desktop could not find this project folder (/home/user/apps/shop). Reopen the actual app folder from Browse PC, then publish again.");
  assert.equal((message.match(/Project not found/gi) ?? []).length, 0);
});

test("specific build errors are preserved without a generic preview prefix", async () => {
  const { publicPreviewPublishError } = await loadRelease();
  const message = publicPreviewPublishError({
    hostedDemo: { message: "npm run build failed: Cannot resolve @vitejs/plugin-react.", status: "failed" },
    previewHtml: "",
    projectPath: "/app",
    runtimeBundle: null,
    visibility: "public"
  });

  assert.equal(message, "npm run build failed: Cannot resolve @vitejs/plugin-react.");
});

test("required backend failures keep the exact runtime error", async () => {
  const exactError = "composer install failed: ext-intl is required.";
  const { publishProjectRelease } = await loadRelease({
    requestHostedRuntimeBundle: async () => ({
      message: exactError,
      needsRuntime: true,
      platform: "laravel",
      status: "failed"
    })
  });

  await assert.rejects(() => publishProjectRelease({
    app: {
      agentUrl: "http://desktop",
      authToken: "token",
      connection: { url: "http://desktop" },
      loadProjectReviewFiles: async () => ({ files: [] }),
      projects: [],
      selectProject: async () => []
    },
    onProgress: () => {},
    payload: {
      description: "App",
      logoImageUrl: "",
      screenshotUrls: [],
      tags: [],
      title: "App",
      visibility: "public"
    },
    project: {
      id: "desktop-id",
      name: "App",
      path: "/actual/app",
      stack: "React + Laravel",
      status: "On PC",
      updated: "now"
    }
  }), new RegExp(exactError.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});
