import type { KindSpec } from "./projectTemplateTypes";

/** The first question: what are you making? Ordered by how often it is the
 * answer, with "empty" last because it is the escape hatch, not a choice. */
export const PROJECT_KINDS: KindSpec[] = [
  { id: "website", name: "Website", blurb: "Pages, marketing, docs, a portfolio" },
  { id: "webapp", name: "Web app", blurb: "Accounts, a database, something that saves" },
  { id: "mobile", name: "Mobile app", blurb: "iOS and Android, from one codebase" },
  { id: "desktop", name: "Desktop app", blurb: "A native window on Mac, Windows, Linux" },
  { id: "game", name: "Game", blurb: "2D, 3D, or a browser game" },
  { id: "backend", name: "Backend or API", blurb: "Endpoints other things call" },
  { id: "library", name: "Library or CLI", blurb: "A package, a tool, a script" },
  { id: "ai", name: "AI app", blurb: "Something that talks to a model" },
  { id: "empty", name: "Empty project", blurb: "Just the folder — you take it from here" },
];

export function kindName(id: ProjectKindId): string {
  return PROJECT_KINDS.find((kind) => kind.id === id)?.name ?? "Project";
}

type ProjectKindId = KindSpec["id"];
