import type { ProjectSpec } from "../types";

export const PROJECT_COLORS = [
  "#5b7cfa",
  "#ff9b6a",
  "#37c78a",
  "#bd8cff",
  "#6aa8ff",
  "#e8a94b",
  "#f472b6",
  "#69d6c7",
];

export function basename(path: string): string {
  const parts = path.replace(/\/+$/, "").split("/");
  return parts[parts.length - 1] || path;
}

export function nextProjectColor(existing: ProjectSpec[]): string {
  return PROJECT_COLORS[existing.length % PROJECT_COLORS.length];
}
