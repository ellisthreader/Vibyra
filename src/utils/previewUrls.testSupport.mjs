import { readFile } from "node:fs/promises";
import ts from "typescript";

export async function loadPreviewUrls(mockNetwork = {}) {
  const source = await readFile(new URL("./previewUrls.ts", import.meta.url), "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
  }).outputText;
  const module = { exports: {} };
  const network = {
    fetchWithTimeout: async () => { throw new Error("unexpected fetch"); },
    normalizeAgentUrl: (value) => {
      const trimmed = String(value ?? "").trim().replace(/\/+$/, "");
      return !trimmed ? "" : /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
    },
    ...mockNetwork
  };
  const require = (specifier) => {
    if (specifier === "./network") return network;
    throw new Error(`Unexpected import ${specifier}`);
  };
  new Function("require", "exports", "module", output)(require, module.exports, module);
  return module.exports;
}

export function response({ ok = true, status = 200, body = "", contentType = "text/html; charset=utf-8", url }) {
  return {
    ok,
    status,
    url,
    headers: {
      get(name) {
        return String(name).toLowerCase() === "content-type" ? contentType : "";
      }
    },
    async text() {
      return body;
    }
  };
}
