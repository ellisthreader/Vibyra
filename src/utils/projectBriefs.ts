import type { ProjectBrief } from "../types/domain";

export type ProjectKindOption = {
  id: string;
  label: string;
  description: string;
  icon: string;
};

export type FrameworkOption = {
  id: string;
  label: string;
  description: string;
  recommended?: boolean;
};

export const projectKindOptions: ProjectKindOption[] = [
  { id: "website", label: "Website", description: "Marketing, portfolio, ecommerce, landing pages.", icon: "globe-outline" },
  { id: "mobile-app", label: "Phone app", description: "iOS, Android, or cross-platform app flows.", icon: "phone-portrait-outline" },
  { id: "automation", label: "Automation", description: "Scripts, bots, workflows, and integrations.", icon: "git-branch-outline" },
  { id: "saas", label: "SaaS product", description: "Dashboards, auth, billing, and team tools.", icon: "grid-outline" },
  { id: "ai-tool", label: "AI tool", description: "Chat, agents, summarizers, and copilots.", icon: "sparkles-outline" },
  { id: "desktop-app", label: "Desktop app", description: "Local tools for Mac, Windows, or Linux.", icon: "desktop-outline" },
  { id: "game", label: "Game", description: "2D games, prototypes, and interactive scenes.", icon: "game-controller-outline" },
  { id: "api", label: "Backend/API", description: "Services, data models, queues, and endpoints.", icon: "server-outline" }
];

export const customKindOption: ProjectKindOption = {
  id: "custom",
  label: "Other",
  description: "Describe exactly what you are creating.",
  icon: "create-outline"
};

export const customFrameworkOption: FrameworkOption = {
  id: "custom-stack",
  label: "Other stack",
  description: "Use your own framework or toolchain."
};

const frameworkOptions: Record<string, FrameworkOption[]> = {
  website: [
    { id: "react-tailwind", label: "React + Tailwind", description: "Fast responsive UI with broad component support.", recommended: true },
    { id: "next-tailwind", label: "Next.js + Tailwind", description: "SEO, routing, and production web apps." },
    { id: "vite-css", label: "Vite + CSS", description: "Small static sites with simple styling." }
  ],
  "mobile-app": [
    { id: "expo-react-native", label: "Expo React Native", description: "Best fit for cross-platform phone apps.", recommended: true },
    { id: "react-native-cli", label: "React Native CLI", description: "Native module control for mature apps." },
    { id: "flutter", label: "Flutter", description: "Dart-based UI with consistent platform rendering." }
  ],
  automation: [
    { id: "node-scripts", label: "Node.js scripts", description: "Great for file, API, and desktop automation.", recommended: true },
    { id: "python", label: "Python", description: "Data, scraping, and reliable automation tasks." },
    { id: "github-actions", label: "GitHub Actions", description: "CI/CD and repository workflow automation." }
  ],
  saas: [
    { id: "next-laravel", label: "Next.js + Laravel", description: "Strong full-stack app with APIs and billing.", recommended: true },
    { id: "next-supabase", label: "Next.js + Supabase", description: "Fast auth, database, and realtime features." },
    { id: "react-node", label: "React + Node API", description: "Flexible frontend and backend ownership." }
  ],
  "ai-tool": [
    { id: "react-node-openai", label: "React + Node + OpenAI", description: "Interactive AI interfaces and API routes.", recommended: true },
    { id: "next-ai-sdk", label: "Next.js + AI SDK", description: "Streaming chat and tool calling." },
    { id: "python-fastapi", label: "Python + FastAPI", description: "Model workflows and service endpoints." }
  ],
  "desktop-app": [
    { id: "electron-react", label: "Electron + React", description: "Desktop app using web UI patterns.", recommended: true },
    { id: "tauri-react", label: "Tauri + React", description: "Smaller native shell with web frontend." },
    { id: "native-script", label: "Node CLI", description: "Lightweight local command tools." }
  ],
  game: [
    { id: "phaser", label: "Phaser", description: "Reliable 2D browser game engine.", recommended: true },
    { id: "three", label: "Three.js", description: "3D scenes and interactive visuals." },
    { id: "canvas", label: "HTML Canvas", description: "Simple prototypes without an engine." }
  ],
  api: [
    { id: "laravel", label: "Laravel", description: "Structured backend with auth, queues, and tests.", recommended: true },
    { id: "node-express", label: "Node + Express", description: "Small APIs and integrations." },
    { id: "fastapi", label: "Python + FastAPI", description: "Typed Python services and model endpoints." }
  ]
};

export function frameworksForKind(kindId: string) {
  return frameworkOptions[kindId] ?? [
    { id: "react-tailwind", label: "React + Tailwind", description: "Flexible UI for prototypes and web experiences.", recommended: true },
    { id: "node-python", label: "Node.js or Python", description: "Reliable for automation, APIs, and custom tools." },
    { id: "expo-react-native", label: "Expo React Native", description: "Best fit when the idea needs a phone interface." }
  ];
}

export function projectBriefTitle(brief: ProjectBrief) {
  return `${brief.kindLabel} · ${brief.frameworkLabel}`;
}

export function projectBriefStack(brief: ProjectBrief) {
  return `${brief.kindLabel} · ${brief.frameworkLabel}`;
}

export function withProjectBriefPrompt(brief: ProjectBrief | undefined, prompt: string) {
  if (!brief) return prompt;
  return [
    "Project context:",
    `- Product type: ${brief.kindLabel}`,
    `- Preferred framework/stack: ${brief.frameworkLabel}`,
    `- Stack reason: ${brief.frameworkDescription}`,
    "- Workflow: create a concise internal plan, review it for missing pieces and risk, then implement it in the project files or runnable preview.",
    "- Output rule: prioritize code/project output over conversational explanation.",
    "",
    `User prompt: ${prompt}`
  ].join("\n");
}
