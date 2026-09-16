import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../theme';
import type { PlannedProject } from '../../scaffold/planned';
import { hasInstallStep, templateById } from '../../scaffold/templates';
import type { TemplateOptions } from '../../scaffold/types';
import { Group, SwitchRow } from '../../settings/SettingsRows';
import { MONO } from './mono';
import { WizardFooter } from './WizardFooter';

/**
 * The last question, in the app's own Settings rows so it reads like the rest
 * of Vibyra rather than a third invented control set. Its button starts the
 * build: there is no page after this one confirming what this one already says.
 *
 * The literal commands live here now, folded away. They used to have a screen
 * of their own, which put a page between deciding and starting for the sake of
 * something most people read once. Folded, the rule survives — nothing is run
 * on the computer that is not written on this screen — without charging
 * everybody a tap for it.
 */
export function OptionsStep({ templateId, options, planned, host, onChange, onStart }: {
  templateId: string | null; options: TemplateOptions; planned: PlannedProject; host: string;
  onChange: (patch: Partial<TemplateOptions>) => void; onStart: () => void;
}) {
  const { colors } = useTheme();
  const [showCommands, setShowCommands] = useState(false);
  const entry = templateById(templateId);
  const installs = entry ? hasInstallStep(entry) : false;
  const { commands } = planned;
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
      {commands.length > 0
        ? <>
          <Pressable accessibilityRole="button" accessibilityState={{ expanded: showCommands }}
            accessibilityLabel={showCommands ? 'Hide the commands' : 'Show the commands'}
            onPress={() => setShowCommands(!showCommands)} hitSlop={6}
            style={({ pressed }) => [s.toggle, { opacity: pressed ? 0.55 : 1 }]}>
            <Text style={[s.toggleText, { color: colors.accent }]}>
              {showCommands ? 'Hide the commands' : `Show the ${commands.length === 1 ? 'command' : `${commands.length} commands`} ${host} will run`}
            </Text>
          </Pressable>
          {showCommands && <View style={[s.commands, { backgroundColor: colors.elevated }]}>
            {commands.map((command, index) => <Text key={index} selectable style={[s.command, { color: colors.text }]}>{command}</Text>)}
          </View>}
        </>
        : <Text style={[s.quiet, { color: colors.muted }]}>
          {`Nothing is run — the folder is created and ${planned.request.seeds.length > 0 ? 'a few starter files are written into it.' : 'left empty for you.'}`}
        </Text>}
    </ScrollView>
    <WizardFooter primary={{ title: 'Start building', label: `Start building on ${host}`, onPress: onStart }} />
  </>;
}
const s = StyleSheet.create({
  scroll: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 20 },
  toggle: { alignSelf: 'flex-start', minHeight: 40, justifyContent: 'center', marginTop: 16, marginLeft: 2 },
  toggleText: { fontSize: 14.5, fontWeight: '600' },
  commands: { borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, gap: 6 },
  command: { fontFamily: MONO, fontSize: 12, lineHeight: 18 },
  quiet: { fontSize: 14, lineHeight: 21, marginTop: 20, marginHorizontal: 2 },
});
