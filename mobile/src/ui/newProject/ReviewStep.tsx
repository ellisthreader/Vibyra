import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../theme';
import { abbreviateHome } from '../../scaffold/destination';
import { kindName } from '../../scaffold/kinds';
import type { PlannedProject } from '../../scaffold/planned';
import type { ProjectKind } from '../../scaffold/types';
import { Group, Row } from '../../settings/SettingsRows';
import { MONO } from './mono';
import { WizardFooter } from './WizardFooter';

/** The last screen before anything happens, and the only one that shows the
 *  literal commands. Nothing is run on the computer that is not written here. */
export function ReviewStep({ kind, name, home, planned, host, onCreate }: {
  kind: ProjectKind | null; name: string; home: string; planned: PlannedProject; host: string; onCreate: () => void;
}) {
  const { colors } = useTheme();
  const { entry, destination, request, commands } = planned;
  return <>
    <ScrollView style={s.scroll} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
      <Group>
        <Row title="Making" value={kind ? kindName(kind) : 'An empty project'} />
        <Row title="With" value={entry.id === 'empty' ? 'Nothing installed' : entry.name} />
        <Row title="Called" value={name} />
        <Row title="At" value={abbreviateHome(destination.path, home)} />
      </Group>
      {commands.length > 0
        ? <>
          <Text accessibilityRole="header" style={[s.label, { color: colors.muted }]}>{`${host} will run`}</Text>
          <View style={[s.commands, { backgroundColor: colors.elevated }]}>
            {commands.map((command, index) => <Text key={index} selectable style={[s.command, { color: colors.text }]}>{command}</Text>)}
          </View>
        </>
        : <Text style={[s.quiet, { color: colors.muted }]}>
          {`Nothing is run — the folder is created and ${request.seeds.length > 0 ? 'a few starter files are written into it.' : 'left empty for you.'}`}
        </Text>}
    </ScrollView>
    <WizardFooter primary={{ title: 'Create project', onPress: onCreate }} />
  </>;
}
const s = StyleSheet.create({
  scroll: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 20 },
  label: { fontSize: 13, fontWeight: '600', letterSpacing: 0.2, marginTop: 24, marginBottom: 8, marginLeft: 2 },
  commands: { borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, gap: 6 },
  command: { fontFamily: MONO, fontSize: 12, lineHeight: 18 },
  quiet: { fontSize: 14, lineHeight: 21, marginTop: 20, marginHorizontal: 2 },
});
