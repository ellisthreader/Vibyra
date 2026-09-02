import type { ProjectTemplate } from "../../../lib/projectTemplateTypes";
import { CheckIcon } from "../../common/Icons";

interface Props {
  entry: ProjectTemplate;
  /** Required tools Rust has said are not on PATH. */
  missing: string[];
  /** The kind this stack is filed under, shown only while browsing them all. */
  kindLabel?: string;
  selected: boolean;
  autoFocus: boolean;
  onPick: () => void;
}

/** One stack. Shared by the kind's own list and the whole-catalog browser so
 * the two cannot drift into looking like different things. */
export function StackRow({ entry, missing, kindLabel, selected, autoFocus, onPick }: Props) {
  const blocked = missing.length > 0;
  return (
    <button
      type="button"
      className={`np-stack ${selected ? "np-stack--on" : ""}`}
      data-autofocus={autoFocus ? "" : undefined}
      disabled={blocked}
      onClick={onPick}
    >
      <span className="np-stack__text">
        <strong>
          {entry.name}
          {kindLabel ? <em className="np-stack__kind">{kindLabel}</em> : null}
        </strong>
        <small>{entry.blurb}</small>
      </span>
      {blocked ? (
        <span className="np-stack__need">Needs {missing.join(" and ")}</span>
      ) : (
        <span className="np-stack__go" aria-hidden="true"><CheckIcon size={13} /></span>
      )}
    </button>
  );
}

/** Tools stay usable until Rust has actually said the executable is absent —
 * an unanswered preflight is not a missing toolchain. */
export function missingTools(entry: ProjectTemplate, tools: Record<string, boolean>): string[] {
  return entry.requires.filter((tool) => tools[tool] === false);
}
