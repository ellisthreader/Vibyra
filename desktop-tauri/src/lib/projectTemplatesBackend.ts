import { create, install, NODE_DOCS, template } from "./projectTemplateHelpers.ts";
import { EXPRESS_SEEDS, FASTAPI_SEEDS, GO_SEEDS } from "./projectTemplateSeeds.ts";
import type { ProjectTemplate } from "./projectTemplateTypes";

// Things other things call. The Python entries install into a virtual
// environment inside the project, so `{{venv}}` — resolved on the Rust side,
// which is the only half that knows where a venv puts its binaries.

export const BACKEND_TEMPLATES: ProjectTemplate[] = [
  template({
    id: "fastapi",
    kinds: ["backend"],
    name: "FastAPI",
    blurb: "Typed Python endpoints with docs generated for you",
    requires: ["python3"],
    docs: "https://www.python.org/downloads/",
    seeds: FASTAPI_SEEDS,
    steps: [
      create("Creating a virtual environment", "python3", ["-m", "venv", ".venv"], "project"),
      create("Installing FastAPI", "{{venv}}/pip", [
        "install", "fastapi", "uvicorn[standard]",
      ], "project"),
    ],
  }),
  template({
    id: "express",
    kinds: ["backend"],
    name: "Express",
    blurb: "One file, one route, nothing in the way",
    requires: ["node", "npm"],
    docs: NODE_DOCS,
    seeds: EXPRESS_SEEDS,
    steps: [install("Installing Express", "npm", ["install", "express"])],
  }),
  template({
    id: "go-module",
    kinds: ["backend", "library"],
    name: "Go module",
    blurb: "A Go module with a runnable main package",
    requires: ["go"],
    docs: "https://go.dev/doc/install",
    seeds: GO_SEEDS,
    steps: [create("Starting the module", "go", ["mod", "init", "{{name}}"], "project")],
  }),
  template({
    id: "axum",
    kinds: ["backend"],
    name: "Axum (Rust)",
    blurb: "A fast Rust API on Tokio",
    requires: ["cargo"],
    docs: "https://rustup.rs",
    steps: [
      create("Creating the crate", "cargo", ["new", "{{name}}"]),
      install("Adding Axum", "cargo", ["add", "axum"]),
      install("Adding Tokio", "cargo", ["add", "tokio", "--features", "full"]),
    ],
  }),
];
