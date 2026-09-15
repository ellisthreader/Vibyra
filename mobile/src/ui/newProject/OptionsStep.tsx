import { ScrollView, StyleSheet } from 'react-native';
import { hasInstallStep, templateById } from '../../scaffold/templates';
import type { TemplateOptions } from '../../scaffold/types';
import { Group, SwitchRow } from '../../settings/SettingsRows';
import { WizardFooter } from './WizardFooter';

/** Question three, in the app's own Settings rows so it reads like the rest
 *  of Vibyra rather than a third invented control set. */
export function OptionsStep({ templateId, options, onChange, onContinue }: {
  templateId: string | null; options: TemplateOptions; onChange: (patch: Partial<TemplateOptions>) => void; onContinue: () => void;
}) {
  const entry = templateById(templateId);
  const installs = entry ? hasInstallStep(entry) : false;
  return <>
    <ScrollView style={s.scroll} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
      <Group>
        {installs ? <SwitchRow title="Install dependencies" detail="Slower now, but the project runs the moment it opens."
          value={options.install} onChange={install => onChange({ install })} /> : null}
        <SwitchRow title="Start a git repository" detail="Skipped if the template made one."
          value={options.git} onChange={git => onChange({ git })} />
        <SwitchRow title="Open a terminal when it is done" detail="In the new project's folder, on your computer."
          value={options.openTerminal} onChange={openTerminal => onChange({ openTerminal })} />
      </Group>
    </ScrollView>
    <WizardFooter primary={{ title: 'Continue', onPress: onContinue }} />
  </>;
}
const s = StyleSheet.create({
  scroll: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 20 },
});
