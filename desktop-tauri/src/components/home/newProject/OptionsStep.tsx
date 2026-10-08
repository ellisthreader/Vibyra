import { useState } from 'react';

import { runProjectCreate } from '../../../lib/projectCreateRun';
import { hasInstallStep, templateById } from '../../../lib/projectTemplates';
import { usePlannedProject, useProjectCreateStore } from '../../../state/projectCreateStore';
import { SettingRow, Switch } from '../../settings/SettingsShared';
import { GithubOption } from './GithubOption';

/**
 * The last question, in the app's own Settings rows so it reads like the rest
 * of Vibyra rather than a third invented control set — but without their card.
 * On a page whose every other surface has been taken away, a bordered group is
 * the one box left standing. Its button starts the
 * build: there is no page after this one confirming what this one already says.
 *
 * The literal commands live here, folded away. They used to have a screen of
 * their own, which put a page between deciding and starting for the sake of
 * something most people read once. Folded, the rule survives — nothing is run
 * on this computer that is not written on this screen — without charging
 * everybody a click for it.
 */
export function OptionsStep() {
  const options = useProjectCreateStore(s => s.options);
  const setOptions = useProjectCreateStore(s => s.setOptions);
  const entry = templateById(useProjectCreateStore(s => s.templateId));
  const name = useProjectCreateStore(s => s.name);
  const [showCommands, setShowCommands] = useState(false);
  const installs = entry ? hasInstallStep(entry) : false;
  const planned = usePlannedProject();
  const { commands } = planned;

  return <div className="np-options">
    <div className="np-options__rows">
      {installs && <SettingRow label="Install dependencies"
        hint="Slower now, but the project runs the moment it opens.">
        <Switch checked={options.install} label="Install dependencies"
          onChange={install => setOptions({ install })} />
      </SettingRow>}
      <SettingRow label="Start a git repository"
        hint="A repository in the folder itself. Skipped if the template made one.">
        <Switch checked={options.git} label="Start a git repository" onChange={git => setOptions({ git })} />
      </SettingRow>
      <GithubOption name={name} />
      <SettingRow label="Open a terminal when it is done" hint="In the new project's folder.">
        <Switch checked={options.openTerminal} label="Open a terminal when it is done"
          onChange={openTerminal => setOptions({ openTerminal })} />
      </SettingRow>
    </div>
    {commands.length > 0
      ? <>
        <button className="np-quiet np-quiet--start" type="button" aria-expanded={showCommands}
          onClick={() => setShowCommands(!showCommands)}>
          {showCommands
            ? 'Hide the commands'
            : `Show the ${commands.length === 1 ? 'command' : `${commands.length} commands`} Vibyra will run`}
        </button>
        {showCommands && <pre className="np-commands">{commands.join('\n')}</pre>}
      </>
      : <p className="np-quiet-text">
        Nothing is run — the folder is created and {planned.request.seeds.length > 0
          ? 'a few starter files are written into it.'
          : 'left empty for you.'}
      </p>}
    <footer className="np-foot">
      <button className="btn btn--primary" type="button" autoFocus onClick={() => void runProjectCreate()}>
        Start building
      </button>
    </footer>
  </div>;
}
