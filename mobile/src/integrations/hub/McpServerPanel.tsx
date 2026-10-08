import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../theme';
import { Icon } from '../../ui/primitives';
import { HubAction } from './HubAction';
import { font } from '../../ui/font';
import type { McpServer, McpTool } from '../../agents/v2/connectionsModel';
import { MCP_READ_WARNING, markableReads, needsReview, reviewSummary, toolLabel } from '../../agents/v2/hubModel';

/**
 * A remote MCP server's tools. Every tool asks for approval each time unless the server
 * itself annotates it read-only and the person marks it as a read here. A changed tool list
 * is held for review; nothing on it reaches a teammate until approved.
 */
export function McpServerPanel({ server, busy, onReads, onApprove, onRefresh }: {
  server: McpServer; busy: string | null; onReads(tools: string[]): void; onApprove(): void; onRefresh(): void;
}) {
  const { colors } = useTheme();
  const id = server.connectionId;
  const reads = server.tools.filter(t => t.kind === 'read').map(t => t.tool);
  const review = needsReview(server);
  const toggle = (tool: McpTool) => onReads(reads.includes(tool.tool) ? reads.filter(t => t !== tool.tool) : [...reads, tool.tool]);
  return (
    <View style={s.panel}>
      {review && (
        <View style={[s.review, { backgroundColor: colors.elevated, borderColor: colors.warning }]}>
          <Text style={[s.detail, { color: colors.text }]}>{reviewSummary(server)}</Text>
          {server.pending?.tools.map(t => (
            <Text key={t.tool} style={[s.detail, { color: colors.muted }]}>
              {server.pending!.added.includes(t.tool) ? 'New · ' : server.pending!.changed.includes(t.tool) ? 'Changed · ' : ''}
              {toolLabel(t.tool)}{t.description ? ` — ${t.description}` : ''}
            </Text>
          ))}
          {server.pending?.removed.map(tool => (
            <Text key={tool} style={[s.detail, { color: colors.muted }]}>Removed · {toolLabel(tool)}</Text>
          ))}
          <HubAction tone="primary" title="Approve new tool list" label={`Approve tool list for ${server.name}`} busy={busy === `mcp:approve:${id}`}
            disabled={busy !== null || !server.pending} onPress={onApprove} />
        </View>
      )}
      {server.status === 'pending_auth' && <Text style={[s.detail, { color: colors.muted }]}>Sign in to this server to list its tools.</Text>}
      {server.tools.length > 0 && <Text style={[s.section, { color: colors.muted }]}>Tools</Text>}
      {server.tools.map(tool => {
        const read = tool.kind === 'read';
        return (
          <View key={tool.tool} style={s.tool}>
            <View style={s.grow}>
              <Text style={[s.name, { color: colors.text }]}>{toolLabel(tool.tool)}</Text>
              <Text numberOfLines={2} style={[s.detail, { color: colors.muted }]}>
                {read ? 'Read · runs without asking' : 'Asks you each time'}{tool.description ? ` · ${tool.description}` : ''}
              </Text>
            </View>
            {tool.readOnlyHint ? (
              <Pressable accessibilityRole="checkbox" accessibilityLabel={`Treat ${toolLabel(tool.tool)} as a read`}
                aria-checked={read} accessibilityState={{ checked: read, disabled: busy !== null }} disabled={busy !== null}
                onPress={() => toggle(tool)} style={s.check}>
                <Icon name={read ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={read ? colors.accent : colors.muted} />
              </Pressable>
            ) : (
              <Icon name="hand-left-outline" size={16} color={colors.muted} />
            )}
          </View>
        );
      })}
      {markableReads(server).length > 0 && (
        <>
          <Text style={[s.detail, { color: colors.muted }]}>Only tools the server marks read-only can skip approval.</Text>
          <Text style={[s.detail, { color: colors.muted }]}>{MCP_READ_WARNING}</Text>
        </>
      )}
      <HubAction title="Check for changes" label={`Check ${server.name} for changes`} busy={busy === `mcp:refresh:${id}`}
        disabled={busy !== null} onPress={onRefresh} />
    </View>
  );
}
const s = StyleSheet.create({
  panel: { gap: 10, marginTop: 4 },
  review: { borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, padding: 12, gap: 6 },
  section: { ...font.section, marginTop: 4 },
  tool: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  grow: { flex: 1, minWidth: 0 },
  name: { ...font.row, fontSize: 14 },
  detail: { ...font.footnote },
  check: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
});
