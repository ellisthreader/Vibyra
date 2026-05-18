import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promptProjectContext } from "./projectContext.mjs";
import { appState } from "./state.mjs";

test("Laravel 419 preview prompts rank route and session context before unrelated UI files", async () => {
  const path = await mkdtemp(join(tmpdir(), "vibyra-project-context-"));
  const project = {
    id: Buffer.from(path).toString("base64url"),
    name: "Laravel Project",
    path,
    stack: "Laravel / Inertia",
    updated: "Now"
  };
  const previousProjects = appState.cachedProjects;
  try {
    appState.cachedProjects = [project];
    await mkdir(join(path, "app", "Http", "Controllers", "AdminDashboard"), { recursive: true });
    await mkdir(join(path, "config"), { recursive: true });
    await mkdir(join(path, "resources", "js", "Components", "AuthModal"), { recursive: true });
    await mkdir(join(path, "routes"), { recursive: true });

    await writeFile(join(path, "app", "Http", "Controllers", "AdminDashboard", "DashboardDataController.php"), "<?php\nclass DashboardDataController {}\n");
    await writeFile(join(path, "config", "session.php"), "<?php\nreturn ['driver' => env('SESSION_DRIVER', 'file')];\n");
    await writeFile(join(path, "resources", "js", "Components", "AuthModal", "LoginForm.tsx"), "export function LoginForm() { return <form action=\"/login\" />; }\n");
    await writeFile(join(path, "routes", "web.php"), "<?php\nRoute::post('/login', [AuthenticatedSessionController::class, 'store']);\n");

    const result = await promptProjectContext(project.id, [
      "Preview request failed: HTTP 419",
      "Location: /preview/server/project/token/login",
      "Laravel/Inertia CSRF session cookie login form"
    ].join("\n"));
    const paths = result.files.slice(0, 4).map((file) => file.path);

    assert.ok(paths.includes("routes/web.php"), paths.join(", "));
    assert.ok(paths.includes("config/session.php"), paths.join(", "));
    assert.ok(paths.indexOf("routes/web.php") < paths.indexOf("resources/js/Components/AuthModal/LoginForm.tsx"));
  } finally {
    appState.cachedProjects = previousProjects;
    await rm(path, { recursive: true, force: true });
  }
});
