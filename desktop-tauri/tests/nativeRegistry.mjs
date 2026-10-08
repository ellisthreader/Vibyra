import { readdirSync, readFileSync } from "node:fs";

const commands = new URL("../src-tauri/src/commands/", import.meta.url);

/** The native command registry as one text: the chain in registry.rs and every part it joins. */
export function nativeRegistry() {
  const parts = readdirSync(new URL("registry/", commands)).filter((name) => name.endsWith(".rs")).sort();
  return [readFileSync(new URL("registry.rs", commands), "utf8"),
    ...parts.map((name) => readFileSync(new URL(`registry/${name}`, commands), "utf8"))].join("\n");
}
