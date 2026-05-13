import { Ionicons } from "@expo/vector-icons";
import type { ProjectDisplay } from "../types";

export type VisibilityKey = "public" | "unlisted" | "private";

export const PUBLISH_ASSET_CREDIT_COST = {
  logo: 2,
  screenshot: 4
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
  { copy: "Anyone with the link can view this project", icon: "link-outline", key: "unlisted", title: "Unlisted" },
  { copy: "Only you can view this project", icon: "lock-closed-outline", key: "private", title: "Private" }
];

export function inferCategory(stack?: string) {
  if (!stack) return "SaaS";
  const normalized = stack.toLowerCase();
  if (normalized.includes("expo") || normalized.includes("react native") || normalized.includes("mobile")) return "Mobile App";
  if (normalized.includes("node") || normalized.includes("laravel")) return "Tool";
  if (normalized.includes("web") || normalized.includes("react")) return "Website";
  return "SaaS";
}

export function defaultTags(project: ProjectDisplay | null) {
  return [];
}

export function addUniqueTag(current: string[], draft: string) {
  const next = draft.trim();
  if (!next) return current;
  return Array.from(new Set([...current, next])).slice(0, 8);
}

export function publishTags(tags: string[], category: string) {
  return Array.from(new Set([...tags, category].map((tag) => tag.trim()).filter(Boolean))).slice(0, 8);
}
