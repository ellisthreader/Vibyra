import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { useTheme } from '../../theme';
import { Mark } from '../../ui/BrandLogo';
import { Button, Hint } from '../../ui/primitives';
import { font } from '../../ui/font';
import type { ConnectionsApi } from '../../agents/v2/connectionsModel';
import { connectable, groupAccounts, mcpUrlProblem } from '../../agents/v2/hubModel';
import { integrationBrand } from '../integrationBrands';
import { CatalogueList } from './CatalogueList';
import { HubAccountRow } from './HubAccountRow';
import { McpServerPanel } from './McpServerPanel';
import { HubAction } from './HubAction';
import { useConnectionsHub } from './useConnectionsHub';

/**
 * Agent v2 connections hub (§6c): every connected account grouped by provider, the services
 * that could be added (with honest readiness) and remote MCP servers. Connecting an account
 * here does not give it to a teammate; that is each teammate's Access tab.
 */
export function ConnectionsHub({ api, active }: { api: ConnectionsApi; active: boolean }) {
  const { colors } = useTheme();
  const hub = useConnectionsHub(api, active);
  const [url, setUrl] = useState('');
  const [urlTried, setUrlTried] = useState(false);
  const groups = groupAccounts(hub.connections ?? [], hub.catalogue);
  const mcpEntry = hub.catalogue.find(p => p.kind === 'mcp');
  const mcpReady = Boolean(mcpEntry && connectable(mcpEntry));
  const urlProblem = mcpUrlProblem(url);
  return (
    <View style={s.body} testID="connections-hub">
      {hub.error ? <View style={s.notice}><Hint error>{hub.error}</Hint></View> : null}
      <Text accessibilityRole="header" style={[s.label, { color: colors.muted }]}>Connected accounts</Text>
      {hub.connections === null && !hub.error && <Hint>Checking your accounts…</Hint>}
      {hub.connections?.length === 0 && <Hint>Nothing connected yet. Add a service below.</Hint>}
      {groups.map(group => (
        <View key={group.provider} style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={s.groupHead}>
            <Mark brand={integrationBrand(group.mcp ? 'mcp' : group.provider)} size={30} />
            <Text accessibilityRole="header" numberOfLines={1} style={[s.groupName, { color: colors.text }]}>{group.name}</Text>
            {group.canAdd && (
              <HubAction title="Add another" label={`Add another ${group.name} account`} busy={hub.busy === `add:${group.provider}`}
                disabled={hub.busy !== null} onPress={() => void hub.addAccount(group.provider)} />
            )}
          </View>
          {group.accounts.map(c => (
            <HubAccountRow key={c.id} connection={c} first={false} busy={hub.busy}
              onReconnect={() => void hub.reconnect(c)} onDisconnect={() => void hub.disconnect(c)}>
              {c.mcp && hub.servers[c.id] ? (
                <McpServerPanel server={hub.servers[c.id]!} busy={hub.busy} onReads={tools => void hub.mcpReads(c.id, tools)}
                  onApprove={() => void hub.mcpApprove(hub.servers[c.id]!)} onRefresh={() => void hub.mcpRefresh(c.id)} />
              ) : null}
            </HubAccountRow>
          ))}
        </View>
      ))}
      <Text accessibilityRole="header" style={[s.label, s.gap, { color: colors.muted }]}>Add a service</Text>
      <CatalogueList providers={hub.catalogue} busy={hub.busy} onConnect={p => void hub.addAccount(p)} onPaste={(p, t) => void hub.paste(p, t)} />
      <Text accessibilityRole="header" style={[s.label, s.gap, { color: colors.muted }]}>MCP server</Text>
      <View style={[s.card, s.mcp, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        {mcpReady ? <>
          <Text style={[s.detail, { color: colors.muted }]}>
            Add a remote MCP server by its HTTPS address. You sign in on the server’s own page, and every tool asks you first until you mark it as a read.
          </Text>
          <TextInput accessibilityLabel="MCP server address" value={url} onChangeText={value => { setUrl(value); setUrlTried(false); }}
            autoCapitalize="none" autoCorrect={false} keyboardType="url" placeholder="https://mcp.example.com/mcp" placeholderTextColor={colors.muted}
            style={[s.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.workspace }]} />
          {urlTried && urlProblem ? <Hint error>{urlProblem}</Hint> : null}
          <Button title="Add MCP server" busy={hub.busy === 'mcp:add'} disabled={hub.busy !== null || !url.trim()}
            onPress={() => { setUrlTried(true); if (!urlProblem) void hub.addMcp(url).then(ok => { if (ok) { setUrl(''); setUrlTried(false); } }); }} />
        </> : (
          <Text style={[s.detail, { color: colors.muted }]}>
            {mcpEntry ? `Not available: ${mcpEntry.message ?? 'MCP servers are not switched on for your account yet.'}` : 'Checking…'}
          </Text>
        )}
      </View>
    </View>
  );
}
const s = StyleSheet.create({
  body: { gap: 10, marginTop: 22 },
  notice: { marginBottom: 4 },
  label: { ...font.section, marginLeft: 16 },
  gap: { marginTop: 14 },
  card: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  groupHead: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 14 },
  groupName: { ...font.headline, flex: 1, minWidth: 0 },
  mcp: { padding: 16, gap: 12 },
  detail: { ...font.footnote },
  input: { minHeight: 46, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, fontSize: 15 },
});
