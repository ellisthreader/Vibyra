// Resolves a model's artwork file (modelArtworkData) to its bundled URL.

import { modelArtworkFile } from "./modelArtworkData";

const files = import.meta.glob("../assets/model-icons/*.png", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;

/** URL of the model's own artwork, or null when only a company mark exists. */
export function modelArtworkUrl(id: string, label = ""): string | null {
  const file = modelArtworkFile(id, label);
  return file ? (files[`../assets/model-icons/${file}`] ?? null) : null;
}
