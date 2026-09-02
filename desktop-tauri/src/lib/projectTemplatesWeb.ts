import { create, NODE_DOCS, NPM_INSTALL, template } from "./projectTemplateHelpers.ts";
import { PLAIN_HTML_SEEDS } from "./projectTemplateSeeds.ts";
import type { ProjectTemplate } from "./projectTemplateTypes";

// Websites and web apps. Every command here is non-interactive on purpose:
// the scaffold runner has no TTY, so a scaffolder that stops to ask a question
// would hang rather than fail. APIs live in `projectTemplatesBackend.ts`.

export const WEB_TEMPLATES: ProjectTemplate[] = [
  template({
    id: "next",
    kinds: ["website", "webapp"],
    name: "Next.js",
    blurb: "React with routing, server rendering and Tailwind",
    requires: ["node", "npx"],
    docs: NODE_DOCS,
    steps: [
      create("Creating the Next.js app", "npx", [
        "--yes", "create-next-app@latest", "{{name}}",
        "--ts", "--app", "--eslint", "--tailwind", "--src-dir",
        "--import-alias", "@/*", "--use-npm", "--skip-install",
      ]),
      NPM_INSTALL,
    ],
  }),
  template({
    id: "vite-react",
    kinds: ["website", "webapp"],
    name: "React (Vite)",
    blurb: "A fast React app with TypeScript, nothing else decided for you",
    requires: ["node", "npm"],
    docs: NODE_DOCS,
    steps: [
      create("Creating the React app", "npm", [
        "create", "vite@latest", "{{name}}", "--", "--template", "react-ts",
      ]),
      NPM_INSTALL,
    ],
  }),
  template({
    id: "vite-vue",
    kinds: ["website", "webapp"],
    name: "Vue (Vite)",
    blurb: "Vue 3 with TypeScript",
    requires: ["node", "npm"],
    docs: NODE_DOCS,
    steps: [
      create("Creating the Vue app", "npm", [
        "create", "vite@latest", "{{name}}", "--", "--template", "vue-ts",
      ]),
      NPM_INSTALL,
    ],
  }),
  template({
    id: "astro",
    kinds: ["website"],
    name: "Astro",
    blurb: "Content-first sites that ship almost no JavaScript",
    requires: ["node", "npm"],
    docs: NODE_DOCS,
    steps: [
      create("Creating the Astro site", "npm", [
        "create", "astro@latest", "{{name}}", "--",
        "--template", "minimal", "--install", "false", "--git", "false",
        "--typescript", "strict", "--skip-houston", "--yes",
      ]),
      NPM_INSTALL,
    ],
  }),
  template({
    id: "sveltekit",
    kinds: ["website", "webapp"],
    name: "SvelteKit",
    blurb: "Svelte with routing and server endpoints",
    requires: ["node", "npx"],
    docs: NODE_DOCS,
    steps: [
      create("Creating the SvelteKit app", "npx", [
        "--yes", "sv@latest", "create", "{{name}}",
        "--template", "minimal", "--types", "ts", "--no-add-ons", "--no-install",
      ]),
      NPM_INSTALL,
    ],
  }),
  template({
    id: "angular",
    kinds: ["website", "webapp"],
    name: "Angular",
    blurb: "The batteries-included framework, with the CLI",
    requires: ["node", "npx"],
    docs: NODE_DOCS,
    steps: [
      create("Creating the Angular app", "npx", [
        "--yes", "@angular/cli@latest", "new", "{{name}}",
        "--skip-install", "--skip-git", "--style", "css", "--defaults",
      ]),
      NPM_INSTALL,
    ],
  }),
  template({
    id: "plain-html",
    kinds: ["website"],
    name: "Plain HTML, CSS and JavaScript",
    blurb: "Three files and no build step",
    seeds: PLAIN_HTML_SEEDS,
  }),
  template({
    id: "laravel",
    kinds: ["webapp", "backend"],
    name: "Laravel",
    blurb: "PHP with routing, an ORM and a full toolkit",
    requires: ["composer"],
    docs: "https://getcomposer.org/download/",
    steps: [
      create("Creating the Laravel app", "composer", [
        "create-project", "laravel/laravel", "{{name}}",
      ]),
    ],
  }),
  template({
    id: "django",
    kinds: ["webapp", "backend"],
    name: "Django",
    blurb: "Python with an admin, an ORM and batteries included",
    requires: ["python3"],
    docs: "https://www.python.org/downloads/",
    steps: [
      create("Creating a virtual environment", "python3", ["-m", "venv", ".venv"], "project"),
      create("Installing Django", "{{venv}}/pip", ["install", "django"], "project"),
      create("Starting the project", "{{venv}}/django-admin", [
        "startproject", "config", ".",
      ], "project"),
    ],
  }),
  template({
    id: "rails",
    kinds: ["webapp", "backend"],
    name: "Ruby on Rails",
    blurb: "Convention over configuration, still",
    requires: ["rails"],
    docs: "https://guides.rubyonrails.org/install_ruby_on_rails.html",
    steps: [create("Creating the Rails app", "rails", ["new", "{{name}}", "--skip-bundle"])],
  }),
  template({
    id: "nest",
    kinds: ["webapp", "backend"],
    name: "NestJS",
    blurb: "A structured TypeScript API framework",
    requires: ["node", "npx"],
    docs: NODE_DOCS,
    steps: [
      create("Creating the Nest app", "npx", [
        "--yes", "@nestjs/cli@latest", "new", "{{name}}",
        "--package-manager", "npm", "--skip-install", "--skip-git",
      ]),
      NPM_INSTALL,
    ],
  }),
];
