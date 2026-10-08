/** Quiet tints for project tiles: a dark ground with a lighter letter, picked
 * by the project's id so a project keeps its colour everywhere it appears. */
const TINTS = ["cobalt", "amber", "green", "violet", "teal", "rose"] as const;

function projectTint(id: string): (typeof TINTS)[number] {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return TINTS[hash % TINTS.length];
}

export function ProjectTile({ id, name, size = 18 }: { id: string; name: string; size?: number }) {
  const letter = (name.trim().charAt(0) || "·").toUpperCase();
  return <span className={`project-tile project-tile--${projectTint(id)}`} aria-hidden="true"
    style={{ width: size, height: size, fontSize: Math.round(size * 0.56), borderRadius: Math.round(size * 0.28) }}>
    {letter}
  </span>;
}
