import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { analyzeProjectPath } from "./projectAnalysis.mjs";
import { detectProjectPurpose } from "./projectAnalysisPurpose.mjs";

test("Laravel Inertia portfolio is not inferred as a restaurant from generic menu/order words", async () => {
  const root = await mkdtemp(join(tmpdir(), "vibyra-analysis-portfolio-"));
  try {
    await writeFile(join(root, "artisan"), "");
    await writeFile(join(root, "composer.json"), JSON.stringify({ require: { "laravel/framework": "^12.0" } }));
    await writeFile(join(root, "package.json"), JSON.stringify({
      name: "reactlaravel",
      dependencies: { "@inertiajs/react": "^2.0.0", react: "^19.0.0" },
      devDependencies: { tailwindcss: "^4.0.0", vite: "^7.0.0" }
    }));
    await mkdir(join(root, "resources", "views"), { recursive: true });
    await mkdir(join(root, "resources", "js", "Pages"), { recursive: true });
    await writeFile(join(root, "resources", "views", "app.blade.php"), [
      "<html><head><title>{{ config('app.name', 'Laravel') }}</title></head><body>",
      "@inertia",
      "</body></html>"
    ].join(""));
    await writeFile(join(root, "resources", "js", "Pages", "Home.jsx"), [
      "export default function Home() {",
      "  return <main>",
      "    <nav>Menu</nav>",
      "    <h1>Alex Carter Portfolio</h1>",
      "    <section>Selected work, projects, skills, experience, contact, GitHub and LinkedIn.</section>",
      "    <p>I can present case studies in any order and include payment systems I have built.</p>",
      "  </main>;",
      "}"
    ].join("\n"));

    const result = await analyzeProjectPath(root, await readdir(root));
    assert.equal(result.analysis.analyzerVersion, 2);
    assert.equal(result.detectedBrief.kindLabel, "Portfolio website");
    assert.equal(result.detectedBrief.frameworkLabel, "Laravel + Inertia React + Tailwind");
    assert.match(result.analysis.summary, /portfolio website/i);
    assert.doesNotMatch(result.analysis.summary, /config\('app\.name|Laravel'\)/i);
    assert.deepEqual(result.analysis.evidence.includes("food or venue terms"), false);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("restaurant purpose requires food or venue terms beyond generic operations words", () => {
  const genericPurpose = detectProjectPurpose({
    descriptions: [],
    evidence: ["resources/js/Pages/Dashboard.jsx"],
    rootName: "ClientPortal",
    snippets: ["Menu navigation, checkout status, payment reports, staff workflow, and orders sorted by date."],
    titles: ["ClientPortal"]
  });
  assert.notEqual(genericPurpose?.kindLabel, "Restaurant platform");

  const restaurantPurpose = detectProjectPurpose({
    descriptions: ["A takeaway restaurant platform for dishes, allergens, kitchen orders, and delivery drivers."],
    evidence: ["resources/js/Pages/Menu.jsx"],
    rootName: "KitchenFlow",
    snippets: ["Restaurant menus show dishes, allergens, kitchen status, live orders, and driver locations."],
    titles: ["KitchenFlow"]
  });
  assert.equal(restaurantPurpose?.kindLabel, "Restaurant platform");
});

test("root Expo markers take precedence over a nested Laravel backend", async () => {
  const root = await mkdtemp(join(tmpdir(), "vibyra-analysis-expo-monorepo-"));
  try {
    await writeFile(join(root, "app.json"), JSON.stringify({ expo: { name: "Mobile App" } }));
    await writeFile(join(root, "package.json"), JSON.stringify({
      main: "node_modules/expo/AppEntry.js",
      dependencies: { expo: "latest", "react-native": "latest" }
    }));
    await mkdir(join(root, "backend"), { recursive: true });
    await writeFile(join(root, "backend", "artisan"), "");
    await writeFile(join(root, "backend", "composer.json"), JSON.stringify({ require: { "laravel/framework": "latest" } }));
    const result = await analyzeProjectPath(root, await readdir(root));
    assert.equal(result.detectedBrief.kindId, "mobile-app");
    assert.equal(result.detectedBrief.frameworkId, "expo-react-native");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});
