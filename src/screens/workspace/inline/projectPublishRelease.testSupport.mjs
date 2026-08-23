import { readFile } from "node:fs/promises";
import ts from "typescript";

export async function loadRelease(overrides = {}) {
  const source = await readFile(new URL("./ProjectPublishRelease.ts", import.meta.url), "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
  }).outputText;
  const module = { exports: {} };
  const require = (specifier) => {
    if (specifier === "../../../utils/communityApi") {
      return { publishProject: overrides.publishProject ?? (async (payload) => payload) };
    }
    if (specifier === "../../../utils/files") {
      return { pickPreviewHtml: overrides.pickPreviewHtml ?? (() => "") };
    }
    if (specifier === "../../../utils/hostedDemo") {
      return {
        requestHostedDemoBundle: overrides.requestHostedDemoBundle ?? (async () => null),
        requestHostedRuntimeBundle: overrides.requestHostedRuntimeBundle ?? (async () => null),
        runtimeBundleHostingError: overrides.runtimeBundleHostingError ?? (() => ""),
        runtimeBundleIncludesFrontend: (bundle) => bundle?.ok === true && (
          bundle.platform === "laravel"
          || ["frontend/dist", "client/dist", "web/dist", "dist"].includes(bundle.metadata?.frontendDistDirectory)
        )
      };
    }
    throw new Error(`Unexpected import ${specifier}`);
  };
  new Function("require", "exports", "module", output)(require, module.exports, module);
  return module.exports;
}

export function publishProjectFixture() {
  return {
    id: "card-id",
    name: "Contract App",
    path: "/stale/card/path",
    sourceProject: {
      id: "desktop-id",
      name: "Contract App",
      path: "/actual/project/path",
      stack: "Full stack",
      updated: "now"
    },
    stack: "Full stack",
    status: "On PC",
    updated: "now"
  };
}

export function publishAppFixture() {
  return {
    adoptProject: async () => {},
    agentUrl: "http://desktop",
    authToken: "token",
    connection: { url: "http://desktop", token: "desktop-token" },
    loadProjectReviewFiles: async () => ({ files: [], totalFiles: 0, truncated: false }),
    projects: [{ id: "desktop-id" }],
    selectProject: async () => []
  };
}

export const publishListingFixture = {
  description: "Contract app",
  logoImageUrl: "",
  screenshotUrls: [],
  tags: ["contract"],
  title: "Contract App",
  visibility: "public"
};
