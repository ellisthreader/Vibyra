import {
  contextFilesForImportDiagnosis,
  findMissingImportOccurrences,
  inspectPreviewPackages,
  readPreviewPackageInfo
} from "./previewErrorInspection.mjs";

export async function diagnosePreviewRepairPrompt(project, prompt = "") {
  if (!project?.path || !isPreviewRepairPrompt(prompt)) return null;
  const missingImports = extractMissingImports(prompt);
  if (missingImports.length === 0) return null;

  const packageInfo = await readPreviewPackageInfo(project.path);
  const installedInfo = await inspectPreviewPackages(project.path, missingImports, packageInfo.declared);
  const occurrences = await findMissingImportOccurrences(project.path, missingImports, prompt);
  const summary = buildSummary({ missingImports, packageInfo, installedInfo, occurrences });

  return {
    kind: "vite-import-resolution",
    summary,
    contextQuery: [
      "Preview Vite import-analysis failed before the app booted.",
      `Missing imports: ${missingImports.join(", ")}`,
      "Inspect package.json, the Vite/Inertia entry files, and every source file importing those missing packages.",
      "Fix the dependency/API mismatch as a whole before switching to unrelated HTTP form transport diagnosis.",
      occurrences.map((item) => item.path).join(" ")
    ].filter(Boolean).join("\n"),
    files: contextFilesForImportDiagnosis({ packageInfo, occurrences })
  };
}

export function extractMissingImports(text = "") {
  const imports = [];
  const patterns = [
    /Failed to resolve import\s+["']([^"']+)["']/gi,
    /Cannot find module\s+["']([^"']+)["']/gi
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(String(text))) !== null) {
      const specifier = packageNameForSpecifier(match[1]);
      if (specifier && !imports.includes(specifier)) imports.push(specifier);
    }
  }
  return imports;
}

function isPreviewRepairPrompt(prompt) {
  const text = String(prompt ?? "");
  return /Captured preview diagnostics:/i.test(text) || /Vite preview module failed|vite:import-analysis|Failed to resolve import/i.test(text);
}

function buildSummary({ missingImports, packageInfo, installedInfo, occurrences }) {
  const declaredLines = missingImports.map((name) => {
    const declared = packageInfo.declared.get(name);
    return declared ? `${name} is declared in ${declared.section} (${declared.version})` : `${name} is not declared in package.json`;
  });
  const lines = [
    "Preview root-cause precheck:",
    "- Classification: Vite import/dependency resolution failure. The app has not booted yet, so Laravel HTTP 419, CSRF, session, and preview proxy transport are not the first evidence to chase.",
    `- Missing import${missingImports.length === 1 ? "" : "s"}: ${missingImports.join(", ")}`,
    packageInfo.exists ? `- package.json check: ${declaredLines.join("; ")}.` : "- package.json check: no package.json was found at the project root.",
    installedInfo.related.length ? `- Related installed/declared package${installedInfo.related.length === 1 ? "" : "s"} in the same scope: ${installedInfo.related.join(", ")}.` : "",
    occurrences.length ? `- Source files importing the missing package${missingImports.length === 1 ? "" : "s"}: ${occurrences.map((item) => item.path).join(", ")}.` : "- No source imports were found in the bounded scan; inspect the Vite stack location first.",
    inertiaMismatchHint(missingImports, installedInfo.related),
    "- Safe repair direction: compare the failing imports with package.json and update all matching imports/usages together, or add the intentional dependency if the project truly needs it. Treat the active editor file as a hint, not proof."
  ];
  return lines.filter(Boolean).join("\n");
}

function inertiaMismatchHint(missingImports, related) {
  const missingInertiaLegacy = missingImports.some((name) => ["@inertiajs/inertia", "@inertiajs/inertia-react"].includes(name));
  if (!missingInertiaLegacy || !related.includes("@inertiajs/react")) return "";
  return "- Inertia-specific hint: this looks like stale Inertia v1 package names in a project that has @inertiajs/react installed. Prefer aligning code to the installed @inertiajs/react/@inertiajs/core APIs over installing old packages unless the project intentionally targets Inertia v1.";
}

function packageNameForSpecifier(specifier) {
  const value = String(specifier ?? "").trim();
  if (!value || value.startsWith(".") || value.startsWith("/") || value.includes("\0")) return "";
  if (value.startsWith("@")) return value.split("/").slice(0, 2).join("/");
  return value.split("/")[0];
}
