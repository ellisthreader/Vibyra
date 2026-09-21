import { pickerModels } from './pickerModels';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import type { VibesModel } from '../vibes/types';
import { useProjectChat } from '../vibes/useProjectChat';
import { useVibes } from '../vibes/VibesProvider';
import { AgentRow, AGENT_TILE } from './AgentRow';
import { AUTO } from './agents';
import { CompanyRow } from './CompanyRow';
import { groupCompanies } from './modelGroups';
import { Hint, Icon } from './primitives';
import type { Project, WorkspaceModel } from './types';

/**
 * The agents that run from the phone: Auto, then the current branded shortlist as
 * a row that opens to its models — the AI chat's picker, grouped the same way,
 * drawn as rows rather than cards so it reads as one list with the computer's. Picking a model is
 * the start — a chat opens on it, bound to this project so it can read the
 * files there. When that is not possible yet, one line says what would make it.
 */
export function PhoneAgents({ visible, workspace, project, title, disabled, onOpen, onBusyChange }: {
  visible: boolean;
  workspace: WorkspaceModel; project: Project; title: string; disabled: boolean; onOpen: () => void;
  onBusyChange(busy: boolean): void;
}) {
  const { colors } = useTheme();
  const { models, wallet } = useVibes();
  const { block, busy, error, start } = useProjectChat(workspace, project, onOpen);
  const [expanded, setExpanded] = useState(false);
  useEffect(() => { onBusyChange(!!busy); return () => onBusyChange(false); }, [busy, onBusyChange]);
  const [open, setOpen] = useState<string | null>(null);
  const [locked, setLocked] = useState<VibesModel | null>(null);
  useEffect(() => { if (visible) { setExpanded(false); setOpen(null); setLocked(null); } }, [visible]);
  const now = useMemo(() => Date.now(), []);
  // A model with no live price cannot be quoted, so it is not offered; with no
  // pricing at all the catalogue still shows.
  const offered = useMemo(() => pickerModels(models), [models]);
  const companies = useMemo(() => groupCompanies(offered, now), [offered, now]);
  const choose = (id: string) => { setLocked(null); void start(id, title); };
  return <View style={[s.section, { borderTopColor: colors.border }]}>
    <Pressable accessibilityRole="button" accessibilityLabel="More AI models" accessibilityState={{ expanded, disabled: disabled || !!busy }}
      aria-expanded={expanded} disabled={disabled || !!busy} onPress={() => setExpanded(value => !value)}
      style={({ pressed }) => [s.disclosure, { opacity: pressed || disabled ? 0.5 : 1 }]}>
      <View style={s.symbol}><Icon name="sparkles-outline" size={22} color={colors.muted} /></View>
      <View style={s.heading}>
        <Text style={[s.label, { color: colors.text }]}>More AI models</Text>
        <Text style={[s.lead, { color: colors.muted }]}>From your phone · Vibyra tokens</Text>
      </View>
      <Icon name={expanded ? 'chevron-up' : 'chevron-down'} size={17} color={colors.muted} />
    </Pressable>
    {expanded && <View style={s.catalogue}>
      <Text style={[s.explanation, { color: colors.muted }]}>Start an AI chat with access to this project.</Text>
      {block ? <Hint>{block}</Hint> : <>
      <AgentRow name="Auto" detail="Chosen for you" busy={busy === AUTO} disabled={disabled || !!busy}
        mark={<View style={[s.auto, { backgroundColor: colors.accentSoft }]}><Icon name="sparkles" size={19} color={colors.accent} /></View>}
        onPress={() => choose(AUTO)} />
      <View pointerEvents={disabled || busy ? 'none' : 'auto'}>
        {companies.map(company => <CompanyRow key={company.vendor} company={company} busy={busy} now={now}
          paid={Boolean(wallet?.paidAvailable)} expanded={open === company.vendor} disabled={disabled || !!busy}
          onToggle={() => setOpen(open === company.vendor ? null : company.vendor)} onStart={choose} onLocked={setLocked} />)}
      </View>
      {locked && <Hint>{`${locked.name} is included with a membership.`}</Hint>}
      {error && <Hint error>{error}</Hint>}
      </>}
    </View>}
  </View>;
}
const s = StyleSheet.create({
  section: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12 },
  disclosure: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 70, paddingHorizontal: 8, paddingVertical: 12 },
  symbol: { width: 44, alignItems: 'center' }, heading: { flex: 1, gap: 4 },
  label: { fontSize: 15, lineHeight: 21, fontWeight: '600' },
  lead: { fontSize: 12, lineHeight: 17 },
  catalogue: { gap: 2, paddingTop: 8 },
  explanation: { fontSize: 13, lineHeight: 18, paddingHorizontal: 12, paddingBottom: 10 },
  auto: { width: AGENT_TILE, height: AGENT_TILE, borderRadius: AGENT_TILE / 3, alignItems: 'center', justifyContent: 'center' },
});
