import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { diagnosePreviewRepairPrompt, extractMissingImports } from "./previewErrorDiagnostics.mjs";

test("extractMissingImports returns package names from Vite import-analysis errors", () => {
  const imports = extractMissingImports([
    'vite:import-analysis: Failed to resolve import "@inertiajs/inertia-react" from "resources/js/app.tsx". Does the file exist?',
    'Failed to resolve import "@inertiajs/inertia" from "resources/js/app.tsx". Does the file exist?',
    'Failed to resolve import "react/jsx-runtime" from "resources/js/app.tsx". Does the file exist?'
  ].join("\n"));

  assert.deepEqual(imports, ["@inertiajs/inertia-react", "@inertiajs/inertia", "react"]);
});

test("diagnosePreviewRepairPrompt explains stale Inertia imports as one dependency class", async () => {
  const path = await mkdtemp(join(tmpdir(), "vibyra-preview-diagnosis-"));
  try {
    await mkdir(join(path, "resources", "js", "Components", "AuthModal"), { recursive: true });
    await mkdir(join(path, "resources", "js", "Components", "DriverApp", "dashboard", "components"), { recursive: true });
    await mkdir(join(path, "node_modules", "@inertiajs", "react"), { recursive: true });
    await mkdir(join(path, "node_modules", "@inertiajs", "core"), { recursive: true });
    await writeFile(join(path, "package.json"), JSON.stringify({
      private: true,
      devDependencies: {
        "@inertiajs/react": "^2.0.0",
        vite: "^8.0.0"
      }
    }, null, 2));
    await writeFile(join(path, "resources", "js", "app.tsx"), [
      "import React from 'react';",
      "import { InertiaApp } from '@inertiajs/inertia-react';",
      "import { Inertia } from '@inertiajs/inertia';"
    ].join("\n"));
    await writeFile(join(path, "resources", "js", "Components", "AuthModal", "LoginForm.tsx"), "import { Inertia } from '@inertiajs/inertia';\n");
    await writeFile(join(path, "resources", "js", "Components", "DriverApp", "dashboard", "components", "DashboardContent.tsx"), "import { Inertia } from '@inertiajs/inertia';\n");

    const diagnosis = await diagnosePreviewRepairPrompt({
      id: Buffer.from(path).toString("base64url"),
      name: "HongKongExpress-new",
      path
    }, [
      "Captured preview diagnostics:",
      'resource: Vite preview module failed: vite:import-analysis: Failed to resolve import "@inertiajs/inertia-react" from "resources/js/app.tsx". Does the file exist?',
      'resource: Vite preview module failed: vite:import-analysis: Failed to resolve import "@inertiajs/inertia" from "resources/js/app.tsx". Does the file exist?'
    ].join("\n"));

    assert.equal(diagnosis.kind, "vite-import-resolution");
    assert.match(diagnosis.summary, /Vite import\/dependency resolution failure/);
    assert.match(diagnosis.summary, /@inertiajs\/inertia-react is not declared in package\.json/);
    assert.match(diagnosis.summary, /@inertiajs\/inertia is not declared in package\.json/);
    assert.match(diagnosis.summary, /@inertiajs\/react/);
    assert.match(diagnosis.summary, /stale Inertia v1 package names/);
    assert.match(diagnosis.summary, /resources\/js\/app\.tsx/);
    assert.match(diagnosis.summary, /resources\/js\/Components\/AuthModal\/LoginForm\.tsx/);
    assert.doesNotMatch(diagnosis.summary, /CSRF token mismatch/);
    assert.doesNotMatch(diagnosis.contextQuery, /\b419\b|CSRF|XSRF|session|proxy/i);
    assert.deepEqual(diagnosis.files.map((file) => file.path), [
      "package.json",
      "resources/js/app.tsx",
      "resources/js/Components/AuthModal/LoginForm.tsx",
      "resources/js/Components/DriverApp/dashboard/components/DashboardContent.tsx"
    ]);
  } finally {
    await rm(path, { recursive: true, force: true });
  }
});
