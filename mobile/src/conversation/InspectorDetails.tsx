import { ScrollView, Text } from 'react-native';
import { useTheme } from '../theme';
import type { WorkspaceModel } from '../ui/types';
import type { AgentItem } from '../state/conversationTypes';
import { changedFiles, type InspectorMode } from './inspection';
import { relativeChangePath } from './usageSummary';
import { ConversationStatus } from './ConversationStatus';
import { ConversationUsage } from './ConversationUsage';
import { NativeDiff } from './NativeDiff';
import { NativeInspectorData } from './NativeInspectorData';
import { InspectorRow } from './InspectorRow';
import { inspectorStyles as s } from './inspectorStyles';

export function InspectorDetails({
  mode,
  selected,
  data,
  snapshot,
  onMode,
}: {
  mode: InspectorMode | null;
  selected?: AgentItem;
  data: any;
  snapshot: WorkspaceModel['conversation'];
  onMode(mode: InspectorMode, item?: AgentItem): void;
}) {
  const { colors } = useTheme();
  if (selected && typeof data === 'string')
    return (
      <>
        <Text style={[s.caption, { color: colors.muted }]}>
          {selected.status}
          {selected.exitCode != null ? ` · Exit ${selected.exitCode}` : ''}
        </Text>
        {selected.category === 'fileChange' ? (
          <NativeDiff content={data} root={snapshot?.workingDirectory} />
        ) : (
          <ScrollView horizontal>
            <Text selectable style={[s.output, { color: colors.text }]}>
              {data}
            </Text>
          </ScrollView>
        )}
        {selected.truncated && (
          <Text style={[s.caption, { color: colors.muted }]}>The first 256 KB was retained.</Text>
        )}
      </>
    );
  if (selected) return null;
  if (mode === 'diff') {
    const files = changedFiles(snapshot?.items ?? [], snapshot?.turnId);
    return (
      <>
        <Text style={[s.caption, { color: colors.muted }]}>
          Current turn · {files.length} file operations
        </Text>
        {files.map((file, i) => (
          <InspectorRow
            key={`${file.item.id}:${i}`}
            title={relativeChangePath(file.path, snapshot?.workingDirectory)}
            subtitle={`${file.operation} · +${file.added} −${file.removed} · ${file.item.status}`}
            onPress={() => onMode('diff', file.item)}
          />
        ))}
        {!files.length && (
          <Text style={[s.rowTitle, { color: colors.text }]}>No file changes were reported.</Text>
        )}
      </>
    );
  }
  if (mode === 'context')
    return (
      <>
        <Text style={[s.caption, { color: colors.muted }]}>
          Files, searches and summaries reported by the provider.
        </Text>
        {snapshot?.items
          .filter((item) => item.kind === 'activity')
          .map((item) => (
            <InspectorRow
              key={item.id}
              title={item.title ?? 'Recorded activity'}
              subtitle={item.status}
              onPress={() => onMode('context', item)}
            />
          ))}
      </>
    );
  if (mode === 'status' && data) return <ConversationStatus value={data} />;
  if (mode === 'usage' && data) return <ConversationUsage value={data} />;
  if (mode === 'permissions' && data)
    return (
      <>
        <Text style={[s.caption, { color: colors.muted }]}>
          Saved command rules are managed on your Mac. Phone typing permission is separate.
        </Text>
        <NativeInspectorData
          value={{
            policy: data.settings?.approvalPolicy,
            sandbox: data.settings?.sandbox,
            savedRules: data.savedRules,
          }}
        />
      </>
    );
  return null;
}
