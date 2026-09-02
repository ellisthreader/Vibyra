import { create, install, NODE_DOCS, NPM_INSTALL, template } from "./projectTemplateHelpers.ts";
import { GODOT_SEEDS, LOVE_SEEDS } from "./projectTemplateSeeds.ts";
import type { ProjectTemplate } from "./projectTemplateTypes";

// Phones, native windows and games. Unity and Unreal are deliberately absent:
// neither creates a project from a command line we can drive, and a folder
// that only looks like one of their projects is worse than no entry at all.

const VITE_GAME = (name: string) =>
  create(`Creating the ${name} project`, "npm", [
    "create", "vite@latest", "{{name}}", "--", "--template", "vanilla-ts",
  ]);

export const APP_TEMPLATES: ProjectTemplate[] = [
  template({
    id: "expo",
    kinds: ["mobile"],
    name: "Expo (React Native)",
    blurb: "iOS, Android and web from one TypeScript codebase",
    requires: ["node", "npx"],
    docs: NODE_DOCS,
    steps: [
      create("Creating the Expo app", "npx", [
        "--yes", "create-expo-app@latest", "{{name}}",
        "--template", "blank-typescript", "--no-install",
      ]),
      NPM_INSTALL,
    ],
  }),
  template({
    id: "react-native",
    kinds: ["mobile"],
    name: "React Native CLI",
    blurb: "The bare framework, with native projects you own",
    requires: ["node", "npx"],
    docs: NODE_DOCS,
    steps: [
      create("Creating the React Native app", "npx", [
        "--yes", "@react-native-community/cli@latest", "init", "{{Name}}",
        "--directory", "{{name}}", "--skip-install", "--skip-git-init",
      ]),
      NPM_INSTALL,
    ],
  }),
  template({
    id: "flutter",
    kinds: ["mobile", "desktop"],
    name: "Flutter",
    blurb: "Dart, one codebase, phones and desktop",
    requires: ["flutter"],
    docs: "https://docs.flutter.dev/get-started/install",
    steps: [create("Creating the Flutter app", "flutter", ["create", "{{name}}"])],
  }),
  template({
    id: "tauri",
    kinds: ["desktop"],
    name: "Tauri",
    blurb: "A Rust shell around a web UI — what Vibyra itself is built on",
    requires: ["node", "npm", "cargo"],
    docs: "https://tauri.app/start/prerequisites/",
    steps: [
      create("Creating the Tauri app", "npm", [
        "create", "tauri-app@latest", "{{name}}", "--",
        "--template", "react-ts", "--manager", "npm", "--yes",
      ]),
      NPM_INSTALL,
    ],
  }),
  template({
    id: "electron",
    kinds: ["desktop"],
    name: "Electron",
    blurb: "Chromium and Node in a desktop window",
    requires: ["node", "npx"],
    docs: NODE_DOCS,
    steps: [
      create("Creating the Electron app", "npx", [
        "--yes", "create-electron-app@latest", "{{name}}",
        "--template=webpack-typescript",
      ]),
    ],
  }),
  template({
    id: "phaser",
    kinds: ["game"],
    name: "Phaser (Vite)",
    blurb: "2D games in the browser, with hot reload",
    requires: ["node", "npm"],
    docs: NODE_DOCS,
    steps: [VITE_GAME("Phaser"), NPM_INSTALL, install("Adding Phaser", "npm", ["install", "phaser"])],
  }),
  template({
    id: "threejs",
    kinds: ["game", "website"],
    name: "Three.js (Vite)",
    blurb: "3D in the browser, with hot reload",
    requires: ["node", "npm"],
    docs: NODE_DOCS,
    steps: [VITE_GAME("Three.js"), NPM_INSTALL, install("Adding Three.js", "npm", ["install", "three"])],
  }),
  template({
    id: "bevy",
    kinds: ["game"],
    name: "Bevy (Rust)",
    blurb: "A data-driven Rust game engine",
    requires: ["cargo"],
    docs: "https://rustup.rs",
    steps: [
      create("Creating the crate", "cargo", ["new", "{{name}}"]),
      install("Adding Bevy", "cargo", ["add", "bevy"]),
    ],
  }),
  template({
    id: "love",
    kinds: ["game"],
    name: "LÖVE (Lua)",
    blurb: "A tiny 2D framework — the folder is the game",
    docs: "https://love2d.org",
    seeds: LOVE_SEEDS,
  }),
  template({
    id: "godot",
    kinds: ["game"],
    name: "Godot 4",
    blurb: "A project file Godot can open — the editor does the rest",
    docs: "https://godotengine.org/download",
    seeds: GODOT_SEEDS,
  }),
];
