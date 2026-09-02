import { abbreviateHome } from "../../../lib/relativeTime";
import { kindName } from "../../../lib/projectTemplateKinds";
import { plannedDestination, plannedRequest, runProjectCreate } from "../../../lib/projectCreateRun";
import { describeSteps } from "../../../lib/projectTemplateCommand";
import { useProjectCreateStore } from "../../../state/projectCreateStore";
import { useProjectStore } from "../../../state/projectStore";

/** The last screen before anything happens, and the only one that shows the
 * literal commands. Nothing is run that is not written here. */
export function ReviewStep() {
  const kind = useProjectCreateStore((state) => state.kind);
  const name = useProjectCreateStore((state) => state.name);
  const homeDir = useProjectStore((state) => state.homeDir);
  const { entry, request } = plannedRequest();
  const { path } = plannedDestination();
  const commands = describeSteps(request);

  return (
    <div className="np-review">
      <dl className="np-review__facts">
        <div><dt>Making</dt><dd>{kind ? kindName(kind) : "An empty project"}</dd></div>
        <div><dt>With</dt><dd>{entry.id === "empty" ? "Nothing installed" : entry.name}</dd></div>
        <div><dt>Called</dt><dd>{name}</dd></div>
        <div><dt>At</dt><dd><code>{abbreviateHome(path, homeDir)}</code></dd></div>
      </dl>
      {commands.length > 0 ? (
        <div className="np-review__commands">
          <span className="section-label">Vibyra will run</span>
          <pre>{commands.join("\n")}</pre>
        </div>
      ) : (
        <p className="np-review__quiet">
          Nothing is run — the folder is created and {request.seeds.length > 0
            ? "a few starter files are written into it."
            : "left empty for you."}
        </p>
      )}
      <div className="np-skip">
        <button
          className="btn btn--primary"
          data-autofocus
          type="button"
          onClick={() => void runProjectCreate()}
        >
          Create project
        </button>
      </div>
    </div>
  );
}
