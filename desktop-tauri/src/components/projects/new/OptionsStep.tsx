import { hasInstallStep, templateById } from "../../../lib/projectTemplates";
import { useProjectCreateStore } from "../../../state/projectCreateStore";
import { SettingRow, Switch } from "../../settings/SettingsShared";

/** Question three, in the app's own row vocabulary so it reads like Settings
 * rather than a third invented control set. */
export function OptionsStep() {
  const options = useProjectCreateStore((state) => state.options);
  const setOptions = useProjectCreateStore((state) => state.setOptions);
  const go = useProjectCreateStore((state) => state.go);
  const entry = templateById(useProjectCreateStore((state) => state.templateId));
  const installs = entry ? hasInstallStep(entry) : false;

  return (
    <>
      <div className="settings-group">
        {installs ? (
          <SettingRow
            label="Install dependencies"
            hint="Slower now, but the project runs the moment it opens."
          >
            <Switch
              checked={options.install}
              label="Install dependencies"
              onChange={(install) => setOptions({ install })}
            />
          </SettingRow>
        ) : null}
        <SettingRow label="Start a git repository" hint="Skipped if the template made one.">
          <Switch
            checked={options.git}
            label="Start a git repository"
            onChange={(git) => setOptions({ git })}
          />
        </SettingRow>
        <SettingRow label="Open a terminal when it is done" hint="In the new project's folder.">
          <Switch
            checked={options.openTerminal}
            label="Open a terminal when it is done"
            onChange={(openTerminal) => setOptions({ openTerminal })}
          />
        </SettingRow>
      </div>
      <div className="np-skip">
        <button className="btn btn--primary" data-autofocus type="button" onClick={() => go("where")}>
          Continue
        </button>
      </div>
    </>
  );
}
