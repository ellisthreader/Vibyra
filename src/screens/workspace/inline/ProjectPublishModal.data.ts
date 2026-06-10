import { Ionicons } from "@expo/vector-icons";
import type { ProjectDisplay } from "../types";

export type VisibilityKey = "public" | "private";
export type ProjectListingPayload = {
  description: string;
  logoImageUrl: string;
  screenshotUrls: string[];
  tags: string[];
  title: string;
  visibility: VisibilityKey;
  visibilityChanged?: boolean;
};

export const PUBLISH_ASSET_CREDIT_COST = {
  logo: 12,
  screenshot: 20
} as const;

export const PUBLISH_CATEGORIES = [
  "Website",
  "Mobile App",
  "SaaS",
  "Tool",
  "Automation",
  "AI App",
  "Dashboard",
  "Productivity"
];

export const VISIBILITY_OPTIONS: Array<{ copy: string; icon: keyof typeof Ionicons.glyphMap; key: VisibilityKey; title: string }> = [
  { copy: "Anyone can discover and view this project", icon: "globe-outline", key: "public", title: "Public" },
  { copy: "Only you can view this project", icon: "lock-closed-outline", key: "private", title: "Private" }
];

export function inferCategory(stack?: string) {
  return suggestPublishMetadata(stack ? ({ id: "", name: "", path: "", stack, status: "Draft", updated: "" } as ProjectDisplay) : null).category;
}

export function suggestPublishMetadata(project: ProjectDisplay | null) {
  const text = publishSuggestionText(project);
  const category = suggestCategory(text);
  const tags = suggestTags(text, category);
  return {
    category,
    description: project ? "A " + (project.stack || "Vibyra") + " project built with Vibyra." : "",
    tags
  };
}

export function defaultTags(project: ProjectDisplay | null) {
  return suggestPublishMetadata(project).tags;
}

function publishSuggestionText(project: ProjectDisplay | null) {
  if (!project) return "";
  const source = project.sourceProject;
  const brief = source?.brief ?? source?.detectedBrief ?? null;
  return [
    project.name,
    project.stack,
    source?.analysis?.summary,
    ...(source?.analysis?.evidence ?? []),
    ...(source?.analysis?.techEvidence ?? []),
    brief?.kindLabel,
    brief?.frameworkLabel,
    brief?.frameworkDescription
  ].filter(Boolean).join(" ").toLowerCase();
}

function suggestCategory(text: string) {
  const scores = PUBLISH_CATEGORIES.reduce<Record<string, number>>((current, category) => ({ ...current, [category]: 0 }), {});
  score(scores, text, "Mobile App", ["expo", "react native", "mobile", "ios", "android", "app store"]);
  score(scores, text, "AI App", ["ai", "openai", "gpt", "llm", "chatbot", "assistant", "agent", "copilot"]);
  score(scores, text, "Dashboard", ["dashboard", "analytics", "admin", "metrics", "report", "stats", "crm"]);
  score(scores, text, "Automation", ["automation", "workflow", "bot", "scraper", "sync", "integration", "cron"]);
  score(scores, text, "Productivity", ["task", "todo", "notes", "planner", "calendar", "habit", "focus"]);
  score(scores, text, "Tool", ["tool", "utility", "cli", "api", "converter", "parser", "extension", "plugin", "laravel", "node"]);
  score(scores, text, "Website", ["website", "site", "web", "landing", "blog", "portfolio", "next", "vite", "react"]);
  score(scores, text, "SaaS", ["saas", "subscription", "billing", "auth", "account", "customer", "tenant", "stripe"]);
  return Object.entries(scores).sort((a, b) => b[1] - a[1])[0]?.[1] ? Object.entries(scores).sort((a, b) => b[1] - a[1])[0][0] : inferCategoryFromStack(text);
}

function suggestTags(text: string, category: string) {
  const tags = [category];
  const candidates: Array<[string, string[]]> = [
    ["AI", ["ai", "openai", "gpt", "llm", "assistant", "agent"]],
    ["Chat", ["chat", "message", "conversation", "support"]],
    ["React", ["react", "jsx", "tsx"]],
    ["Next.js", ["next", "nextjs"]],
    ["Expo", ["expo", "react native"]],
    ["Laravel", ["laravel", "php"]],
    ["Node", ["node", "express", "npm"]],
    ["TypeScript", ["typescript", "tsx", "tsconfig"]],
    ["Dashboard", ["dashboard", "analytics", "metrics", "admin"]],
    ["Automation", ["automation", "workflow", "sync", "bot"]],
    ["Productivity", ["productivity", "task", "todo", "notes", "planner"]],
    ["API", ["api", "endpoint", "backend"]],
    ["Mobile", ["mobile", "ios", "android", "react native"]]
  ];
  candidates.forEach(([tag, terms]) => {
    if (terms.some((term) => text.includes(term))) tags.push(tag);
  });
  return Array.from(new Set(tags)).slice(0, 6);
}

function score(scores: Record<string, number>, text: string, category: string, terms: string[]) {
  scores[category] += terms.reduce((sum, term) => sum + (text.includes(term) ? 1 : 0), 0);
}

function inferCategoryFromStack(text: string) {
  if (!text) return "SaaS";
  if (text.includes("expo") || text.includes("react native") || text.includes("mobile")) return "Mobile App";
  if (text.includes("node") || text.includes("laravel")) return "Tool";
  if (text.includes("web") || text.includes("react")) return "Website";
  return "SaaS";
}

export function addUniqueTag(current: string[], draft: string) {
  const next = draft.trim();
  if (!next) return current;
  return Array.from(new Set([...current, next])).slice(0, 8);
}

export function publishTags(tags: string[], category: string) {
  return Array.from(new Set([...tags, category].map((tag) => tag.trim()).filter(Boolean))).slice(0, 8);
}

export function shouldHydratePublishForm(previousKey: string, nextKey: string, dirty: boolean) {
  return previousKey !== nextKey || !dirty;
}
