import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StatusBar, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../theme';
import { Button, Icon } from '../ui/primitives';
import type { WorkspaceModel } from '../ui/types';
import { PreviewWebView } from './PreviewWebView';
import { previewTargetMatchesProject } from './targetMatch';

interface Target { grantId: string; projectId: string; targetId: string; name?: string | null }
interface OpenPage { url: string; close(): Promise<void> }
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const message = (error: unknown) => error instanceof Error ? error.message : String(error);

/** The Mac owns the server; closing this sheet closes only the phone adapter. */
export function PreviewSessionSheet({ visible, onClose, projectId, workspace }: {
  visible: boolean; onClose(): void; projectId: string; workspace: WorkspaceModel;
}) {
  const { colors, dark } = useTheme();
  const [targets, setTargets] = useState<Target[]>([]);
  const [page, setPage] = useState<OpenPage | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const request = useRef(0);
  const lastTarget = useRef<string | null>(null);
  const pageRef = useRef<OpenPage | null>(null);

  const releasePage = useCallback(() => {
    const current = pageRef.current;
    pageRef.current = null;
    if (current) void current.close();
    setPage(null);
  }, []);

  const close = useCallback(() => {
    request.current++;
    setBusy(false);
    releasePage();
    onClose();
  }, [onClose, releasePage]);

  useEffect(() => () => {
    request.current++;
    const current = pageRef.current;
    pageRef.current = null;
    if (current) void current.close();
  }, []);

  const open = useCallback(async (target: Target) => {
    if (!workspace.actions.startPreview || !workspace.actions.openPreview) return;
    const version = ++request.current;
    setBusy(true); setError('');
    try {
      const started = await workspace.actions.startPreview(target.grantId);
      if (started.phase === 'failed') throw new Error('The Mac could not start this site. Check Preview on your Mac.');
      let opened: OpenPage | null = null;
      for (let attempt = 0; attempt < 75 && request.current === version; attempt++) {
        try { opened = await workspace.actions.openPreview(target.grantId); break; }
        catch (cause) {
          if (!/not running|no local address/i.test(message(cause)) || attempt === 74) throw cause;
          await wait(1000);
        }
      }
      if (!opened) return;
      if (request.current !== version) { await opened.close(); return; }
      lastTarget.current = target.grantId;
      pageRef.current = opened;
      setPage(opened);
    } catch (cause) { if (request.current === version) setError(message(cause)); }
    finally { if (request.current === version) setBusy(false); }
  }, [workspace.actions]);

  useEffect(() => {
    if (!visible) {
      releasePage();
      return;
    }
    const version = ++request.current;
    setTargets([]); setError(''); setBusy(true);
    void workspace.actions.listPreviews?.().then(result => {
      if (request.current !== version) return;
      const matches = result.targets.filter(target =>
        previewTargetMatchesProject(target, projectId, workspace.projects));
      setTargets(matches);
      const automatic = matches.length === 1 ? matches[0]
        : matches.find(target => target.grantId === lastTarget.current);
      if (automatic) void open(automatic);
      else setBusy(false);
    }).catch(cause => { if (request.current === version) { setError(message(cause)); setBusy(false); } });
    const pending = request;
    return () => { pending.current++; };
  }, [visible, projectId, workspace.projects, workspace.actions, open, releasePage]);

  useEffect(() => {
    if (visible && workspace.status !== 'connected') {
      request.current++;
      releasePage();
      setError('The Mac disconnected. Reconnect before opening Live Preview.');
    }
  }, [visible, workspace.status, releasePage]);

  return <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={close}>
    <StatusBar hidden={Boolean(page)} barStyle={dark ? 'light-content' : 'dark-content'} />
    <SafeAreaProvider style={styles.empty}>
    {page ? <PreviewWebView startUrl={page.url} onClose={close} /> :
      <SafeAreaView style={[styles.empty, { backgroundColor: colors.background }]}>
        <View style={styles.header}>
          <View style={styles.heading}><Text style={[styles.eyebrow, { color: colors.accent }]}>ON YOUR MAC</Text>
            <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>Live preview</Text></View>
          <Pressable accessibilityRole="button" accessibilityLabel="Close Live Preview" onPress={close}
            style={[styles.dismiss, { backgroundColor: colors.elevated }]}><Icon name="close" size={19} color={colors.text} /></Pressable>
        </View>
        <View style={styles.list}>
          {busy && <View style={styles.wait}><ActivityIndicator color={colors.accent} />
            <Text style={[styles.explain, { color: colors.muted }]}>Opening your site…</Text></View>}
          {error ? <Text accessibilityRole="alert" style={[styles.error, { color: colors.error }]}>{error}</Text> : null}
          {!busy && targets.length === 0 ? <View style={styles.wait}>
            <Icon name="globe-outline" size={32} color={colors.muted} />
            <Text style={[styles.explain, { color: colors.muted }]}>No running site is available for this project. Start its local server on your Mac and allow website Preview for this phone in Settings → Phone.</Text>
          </View> : null}
          {!busy && targets.map(target => <Button key={target.grantId}
            title={target.name ? `Open ${target.name}` : `Open ${target.targetId}`}
            icon="globe-outline" disabled={workspace.status !== 'connected'}
            onPress={() => void open(target)} />)}
        </View>
      </SafeAreaView>}
    </SafeAreaProvider>
  </Modal>;
}

const styles = StyleSheet.create({
  empty: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 22, paddingTop: 16 },
  heading: { gap: 5 }, eyebrow: { fontSize: 11, fontWeight: '700', letterSpacing: 1.5 },
  title: { fontSize: 27, fontWeight: '700', letterSpacing: -0.6 },
  dismiss: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  list: { flex: 1, padding: 22, gap: 16 },
  wait: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, paddingHorizontal: 14 },
  explain: { fontSize: 14, lineHeight: 21, textAlign: 'center' },
  error: { fontSize: 14, lineHeight: 21 },
});
