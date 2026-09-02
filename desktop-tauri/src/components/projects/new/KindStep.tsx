import { PROJECT_KINDS } from "../../../lib/projectTemplateKinds";
import { useProjectCreateStore } from "../../../state/projectCreateStore";
import { ProjectKindIcon } from "./ProjectKindIcons";

/** Question one. Every tile is optional — the footer skips the lot. */
export function KindStep() {
  const chooseKind = useProjectCreateStore((state) => state.chooseKind);
  const current = useProjectCreateStore((state) => state.kind);

  return (
    <>
      <div className="np-grid">
        {PROJECT_KINDS.map((kind, index) => (
          <button
            key={kind.id}
            type="button"
            className={`np-tile ${current === kind.id ? "np-tile--on" : ""}`}
            data-autofocus={index === 0 ? "" : undefined}
            onClick={() => chooseKind(kind.id)}
          >
            <span className="np-tile__mark"><ProjectKindIcon kind={kind.id} /></span>
            <strong>{kind.name}</strong>
            <small>{kind.blurb}</small>
          </button>
        ))}
      </div>
      <div className="np-skip">
        <button className="np-quiet" type="button" onClick={() => chooseKind(null)}>
          Skip — just make a folder
        </button>
      </div>
    </>
  );
}
