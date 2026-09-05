import { readFile } from "node:fs/promises";
import ts from "typescript";

export async function loadPersistenceSecrets() {
  return import(await moduleUrl(new URL("./persistenceSecrets.ts", import.meta.url)));
}

async function moduleUrl(file) {
  let source = await readFile(file, "utf8");
  for (const match of [...source.matchAll(/from\s+"(\.\/[^\"]+)"/g)]) {
    const dependency = await moduleUrl(new URL(`${match[1]}.ts`, file));
    source = source.replaceAll(`"${match[1]}"`, `"${dependency}"`);
  }
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  return `data:text/javascript;base64,${Buffer.from(output).toString("base64")}`;
}

export function memoryPublic(initial = null) {
  let value = initial;
  return {
    read: async () => value,
    write: async (next) => { value = next; },
    value: () => value
  };
}

export function memorySecrets(initial = null) {
  let value = initial;
  return {
    read: async () => value,
    write: async (next) => { value = next; },
    delete: async () => { value = null; },
    value: () => value
  };
}

export function desktop(token, url = "http://desktop", pairCode = "ABC123") {
  return { url, pairCode, token, machineName: "Workstation", status: "offline" };
}

export function delayedSecretStorage() {
  let value = null;
  let releaseFirstWrite;
  const firstWriteBlocked = new Promise((resolve) => { releaseFirstWrite = resolve; });
  let writes = 0;
  return {
    adapter: {
      read: async () => value,
      write: async (next) => {
        writes += 1;
        if (writes === 1) await firstWriteBlocked;
        value = next;
      },
      delete: async () => { value = null; }
    },
    releaseFirstWrite,
    value: () => value
  };
}
