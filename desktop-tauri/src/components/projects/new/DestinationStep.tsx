import { open as openDialog } from "@tauri-apps/plugin-dialog";

import { abbreviateHome } from "../../../lib/relativeTime";
import { resolveDestination } from "../../../lib/projectDestination";
import { useProjectCreateStore } from "../../../state/projectCreateStore";
import { useProjectStore } from "../../../state/projectStore";
import { FolderIcon } from "../../common/Icons";

/** The one question that cannot be skipped, so it is pre-filled and one key
 * away from done. The resolved path is shown while the name is typed. */
export function DestinationStep() {
  const name = useProjectCreateStore((state) => state.name);
  const parent = useProjectCreateStore((state) => state.parent);
  const setName = useProjectCreateStore((state) => state.setName);
  const setParent = useProjectCreateStore((state) => state.setParent);
  const go = useProjectCreateStore((state) => state.go);
  const homeDir = useProjectStore((state) => state.homeDir);
  const destination = resolveDestination(parent, name, homeDir);

  const choose = async () => {
    const picked = await openDialog({
      directory: true,
      multiple: false,
      title: "Where should the project go?",
      defaultPath: parent,
    }).catch(() => null);
    if (typeof picked === "string" && picked) setParent(picked);
  };

  return (
    <div className="np-where">
      <label className="np-where__name">
        <span>Project name</span>
        <input
          className="input"
          data-autofocus
          maxLength={64}
          value={name}
          spellCheck={false}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !destination.error) go("review");
          }}
        />
      </label>
      <div className="np-where__folder">
        <span className="np-where__folder-text">
          <small>Inside</small>
          <code>{abbreviateHome(parent, homeDir)}</code>
        </span>
        <button className="btn" type="button" onClick={() => void choose()}>
          <FolderIcon size={14} /> Change
        </button>
      </div>
      <p className={destination.error ? "np-where__path np-where__path--bad" : "np-where__path"}>
        {destination.error ?? `It will be created at ${abbreviateHome(destination.path, homeDir)}`}
      </p>
      <div className="np-skip">
        <button
          className="btn btn--primary"
          type="button"
          disabled={Boolean(destination.error)}
          onClick={() => go("review")}
        >
          Continue
        </button>
      </div>
    </div>
  );
}
