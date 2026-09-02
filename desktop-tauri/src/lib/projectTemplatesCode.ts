import { create, install, NODE_DOCS, template } from "./projectTemplateHelpers.ts";
import { TS_LIBRARY_SEEDS } from "./projectTemplateSeeds.ts";
import { CLAUDE_NODE_SEEDS, CLAUDE_PYTHON_SEEDS } from "./projectTemplateSeedsAi.ts";
import type { ProjectTemplate } from "./projectTemplateTypes";

// Packages, command-line tools, model-backed apps, and the empty folder that
// every skipped question lands on.

export const CODE_TEMPLATES: ProjectTemplate[] = [
  template({
    id: "ts-library",
    kinds: ["library"],
    name: "TypeScript package",
    blurb: "A typed package that compiles to dist/",
    requires: ["node", "npm"],
    docs: NODE_DOCS,
    seeds: TS_LIBRARY_SEEDS,
    steps: [install("Installing TypeScript", "npm", ["install", "--save-dev", "typescript", "@types/node"])],
  }),
  template({
    id: "rust-cli",
    kinds: ["library"],
    name: "Rust crate",
    blurb: "A cargo binary crate",
    requires: ["cargo"],
    docs: "https://rustup.rs",
    steps: [create("Creating the crate", "cargo", ["new", "{{name}}"])],
  }),
  template({
    id: "claude-node",
    kinds: ["ai"],
    name: "Claude app (TypeScript)",
    blurb: "Node calling Claude through the official Anthropic SDK",
    requires: ["node", "npm"],
    docs: NODE_DOCS,
    seeds: CLAUDE_NODE_SEEDS,
    steps: [install("Installing the Anthropic SDK", "npm", ["install", "@anthropic-ai/sdk"])],
  }),
  template({
    id: "claude-python",
    kinds: ["ai"],
    name: "Claude app (Python)",
    blurb: "Python calling Claude through the official Anthropic SDK",
    requires: ["python3"],
    docs: "https://www.python.org/downloads/",
    seeds: CLAUDE_PYTHON_SEEDS,
    steps: [
      create("Creating a virtual environment", "python3", ["-m", "venv", ".venv"], "project"),
      create("Installing the Anthropic SDK", "{{venv}}/pip", ["install", "anthropic"], "project"),
    ],
  }),
  template({
    id: "empty",
    kinds: ["empty"],
    name: "Empty project",
    blurb: "Just the folder. Vibyra will watch it and open agents in it.",
  }),
];
