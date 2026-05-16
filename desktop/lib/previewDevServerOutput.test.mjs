import test from "node:test";
import assert from "node:assert/strict";
import { portsFromOutput } from "./previewDevServerOutput.mjs";

test("portsFromOutput strips ANSI color codes from Vite 6 output", () => {
  const output = [
    "[32m[1mVITE[22m v6.0.5[39m [2mready in 312 ms[22m",
    "[32m→[39m [1mLocal[22m: [36mhttp://localhost:5173/[39m"
  ].join("\n");
  assert.ok(portsFromOutput(output).includes(5173));
});

test("portsFromOutput finds the bumped port when Vite shifts off 5173", () => {
  const output = [
    "> dev",
    "> vite --host 0.0.0.0",
    "",
    "Port 5173 is in use, trying another one...",
    "[32m[1mVITE[22m v8.0.2[39m [2mready in [22m[1m288[22m[2m ms[22m",
    "[32m→[39m [1mLocal[22m: [36mhttp://localhost:[1m5174[22m/[39m",
    "[32m→[39m [1mNetwork[22m: [36mhttp://192.168.1.109:[1m5174[22m/[39m"
  ].join("\n");
  const ports = portsFromOutput(output);
  assert.ok(ports.includes(5174), `expected 5174 in ${JSON.stringify(ports)}`);
});

test("portsFromOutput parses literal bracket sequences (email-rendered ANSI)", () => {
  const output = [
    "[32m→[39m [1mLocal[22m: [36mhttp:// localhost:[1m5174[22m/[39m",
    "[32m→[39m [1mNetwork[22m: [36mhttp:// 192.168.1.109:[1m5174[22m/[39m"
  ].join("\n");
  const ports = portsFromOutput(output);
  assert.ok(ports.includes(5174), `expected 5174 in ${JSON.stringify(ports)}`);
});
