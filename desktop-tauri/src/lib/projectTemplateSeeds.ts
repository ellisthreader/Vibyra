import type { TemplateSeed } from "./projectTemplateTypes";

// Files a template writes itself, for stacks with no scaffolder worth running.
// Deliberately small: enough that the folder runs, not a starter kit.

const file = (path: string, body: string): TemplateSeed => ({ path, body });

export const PLAIN_HTML_SEEDS: TemplateSeed[] = [
  file("index.html", `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{{name}}</title>
    <link rel="stylesheet" href="styles.css" />
  </head>
  <body>
    <main>
      <h1>{{name}}</h1>
      <p>Edit index.html and reload.</p>
    </main>
    <script type="module" src="main.js"></script>
  </body>
</html>
`),
  file("styles.css", `:root { color-scheme: light dark; }

body {
  margin: 0;
  display: grid;
  place-items: center;
  min-height: 100vh;
  font-family: system-ui, sans-serif;
}
`),
  file("main.js", `console.log("{{name}} is running");
`),
];

export const LOVE_SEEDS: TemplateSeed[] = [
  file("main.lua", `function love.load()
  message = "{{name}}"
end

function love.draw()
  love.graphics.print(message, 20, 20)
end
`),
  file("conf.lua", `function love.conf(t)
  t.window.title = "{{name}}"
  t.window.width = 960
  t.window.height = 540
end
`),
];

export const GODOT_SEEDS: TemplateSeed[] = [
  file("project.godot", `config_version=5

[application]

config/name="{{name}}"
config/features=PackedStringArray("4.2")

[rendering]

renderer/rendering_method="gl_compatibility"
`),
];

const nodePackage = (start: string) => `{
  "name": "{{name}}",
  "private": true,
  "type": "module",
  "scripts": { "start": "${start}" }
}
`;

export const EXPRESS_SEEDS: TemplateSeed[] = [
  file("package.json", nodePackage("node index.js")),
  file("index.js", `import express from "express";

const app = express();

app.get("/", (_request, response) => {
  response.json({ app: "{{name}}", ok: true });
});

app.listen(3000, () => console.log("http://localhost:3000"));
`),
];

export const FASTAPI_SEEDS: TemplateSeed[] = [
  file("main.py", `from fastapi import FastAPI

app = FastAPI(title="{{name}}")


@app.get("/")
def read_root() -> dict[str, str]:
    return {"app": "{{name}}"}
`),
];

export const GO_SEEDS: TemplateSeed[] = [
  file("main.go", `package main

import "fmt"

func main() {
\tfmt.Println("{{name}} is running")
}
`),
];

export const TS_LIBRARY_SEEDS: TemplateSeed[] = [
  file("package.json", `{
  "name": "{{name}}",
  "private": true,
  "type": "module",
  "main": "dist/index.js",
  "scripts": { "build": "tsc" }
}
`),
  file("tsconfig.json", `{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "rootDir": "src",
    "outDir": "dist",
    "strict": true,
    "declaration": true
  },
  "include": ["src"]
}
`),
  file("src/index.ts", `export function greet(name: string): string {
  return \`Hello, \${name}\`;
}
`),
];

export { nodePackage };
