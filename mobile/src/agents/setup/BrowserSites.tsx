import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { useTheme } from '../../theme';
import { Button, Hint, IconButton } from '../../ui/primitives';
import { font } from '../../ui/font';
import { RunError } from '../v2/runsApi';
import { BROWSER_SOCKET_NOTE, BROWSER_WORDS, browserHidden, siteLabel, withSite, type BrowserApi, type BrowserGrant } from '../v2/browserModel';
import { SetupCard, SetupHeading, form } from './SetupForm';

const words = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * Agent V2 browser access in the Access tab (Phase 7): the sites this teammate may open in the
 * separate browser on the Mac. Each change saves the whole list at once; removing the last site
 * removes browser access. Renders nothing while browser tools are off for the account.
 */
export function BrowserSites({ api, agentId, active }: { api?: BrowserApi; agentId?: string; active: boolean }) {
  const { colors } = useTheme();
  const [shown, setShown] = useState(false);
  const [grant, setGrant] = useState<BrowserGrant | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const load = useCallback(async () => {
    if (!api || !agentId) return;
    try {
      const access = await api.get(agentId);
      if (!alive.current) return;
      setShown(access.enabled); setGrant(access.browser); setError('');
    } catch (e) {
      if (!alive.current) return;
      if (e instanceof RunError && browserHidden(e.status)) { setShown(false); return; }
      setShown(true); setError(words(e));
    }
  }, [api, agentId]);
  useEffect(() => { if (active) void load(); }, [active, load]);
  if (!api || !agentId || !shown) return null;

  const origins = grant?.origins ?? [];
  const save = async (next: string[], key: string) => {
    if (busy) return;
    setBusy(key); setError('');
    try {
      if (next.length) { const saved = await api.put(agentId, next); if (alive.current) setGrant(saved); }
      else { await api.remove(agentId); if (alive.current) setGrant(null); }
      if (alive.current && key === 'add') setDraft('');
    } catch (e) {
      if (!alive.current) return;
      if (e instanceof RunError && e.code === 'browser_disabled') { setShown(false); return; }
      setError(words(e));
    } finally { if (alive.current) setBusy(null); }
  };
  const add = () => {
    const next = withSite(origins, draft);
    if (typeof next === 'string') setError(next);
    else void save(next, 'add');
  };

  return (
    <View style={s.body} testID="teammate-browser">
      <SetupHeading title="Browser" description={BROWSER_WORDS} />
      {origins.length > 0 && (
        <SetupCard>
          {origins.map((origin, i) => (
            <View key={origin} style={[s.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border }]}>
              <Text numberOfLines={1} style={[s.site, { color: colors.text }]}>{siteLabel(origin)}</Text>
              <IconButton icon="close" label={`Remove ${siteLabel(origin)}`} disabled={busy !== null}
                onPress={() => void save(origins.filter(o => o !== origin), `remove:${origin}`)} />
            </View>
          ))}
        </SetupCard>
      )}
      {origins.length === 0 && <Hint>No sites yet. Add one to let this teammate use the browser.</Hint>}
      <View style={s.add}>
        <TextInput accessibilityLabel="Site to allow" value={draft} onChangeText={text => { setDraft(text); if (error) setError(''); }}
          placeholder="example.com" placeholderTextColor={colors.muted} autoCapitalize="none" autoCorrect={false}
          keyboardType="url" returnKeyType="done" onSubmitEditing={add} editable={busy === null}
          style={[form.input, s.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]} />
        <Button secondary title="Add site" busy={busy === 'add'} disabled={busy !== null || !draft.trim()} onPress={add} />
      </View>
      {error ? <Hint error>{error}</Hint> : null}
      <Text style={[s.note, { color: colors.muted }]}>{BROWSER_SOCKET_NOTE}</Text>
      {grant && <Button danger title="Remove browser access" busy={busy === 'all'} disabled={busy !== null} onPress={() => void save([], 'all')} />}
    </View>
  );
}
const s = StyleSheet.create({
  body: { gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 16, paddingRight: 6, minHeight: 48 },
  site: { ...font.row, flex: 1, minWidth: 0 },
  add: { gap: 8 },
  note: { ...font.footnote },
  input: { minHeight: 44, paddingVertical: 10 },
});
