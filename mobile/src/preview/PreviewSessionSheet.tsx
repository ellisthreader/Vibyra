import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StatusBar, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../theme';
import { Button, Icon } from '../ui/primitives';
import type { WorkspaceModel } from '../ui/types';
import { PreviewWebView } from './PreviewWebView';
import { previewTargetMatchesProject, previewTargetRunning } from './targetMatch';

interface Target { grantId: string; projectId: string; targetId: string; name?: string | null; running?: boolean }
interface OpenPage { url: string; label: string; close(): Promise<void> }
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const message = (error: unknown) => error instanceof Error ? error.message : String(error);

/** The Mac owns the server; closing this sheet closes only the phone adapter. */
export function PreviewSessionSheet({ visible, onClose, projectId, workspace, known }: {
  visible: boolean; onClose(): void; projectId: string; workspace: WorkspaceModel;
  /** The running site the card or header already found: it opens straight away. */
  known?: Target | null;
}) {
  const { colors, dark } = useTheme();
  const [targets, setTargets] = useState<Target[]>([]);
  const [page, setPage] = useState<OpenPage | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const request = useRef(0);
  const lastTarget = useRef<string | null>(null);
  const pageRef = useRef<OpenPage | null>(null);
  // Read when the sheet opens, not tracked: the header's polling hands over a new
  // object every few seconds, and that must not reopen the page.
  const knownRef = useRef(known);
  knownRef.current = known;
  // Host snapshots replace the projects array while the sheet is open. Read the
  // latest paths for matching without treating each snapshot as a new session.
  const projectsRef = useRef(workspace.projects);
  projectsRef.current = workspace.projects;

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
    if (!previewTargetMatchesProject(target, projectId, projectsRef.current) ||
      !previewTargetRunning(target) || !workspace.actions.startPreview || !workspace.actions.openPreview) return;
    const version = ++request.current;
    setBusy(true); setError('');
    try {
      // A running target was verified by preview.list; preview.open checks its
      // grant and listener again. Skip an extra start round trip on reopen.
      if (!target.running) {
        const started = await workspace.actions.startPreview(target.grantId);
        if (started.phase === 'failed') throw new Error('The Mac could not start this site. Check Preview on your Mac.');
      }
      let opened: { url: string; close(): Promise<void> } | null = null;
      for (let attempt = 0; attempt < 75 && request.current === version; attempt++) {
        try { opened = await workspace.actions.openPreview(target.grantId); break; }
        catch (cause) {
          if (!/not running|no local address/i.test(message(cause)) || attempt === 74) throw cause;
          if (target.running && attempt === 0) {
            const started = await workspace.actions.startPreview(target.grantId);
            if (started.phase === 'failed') throw new Error('The Mac could not start this site. Check Preview on your Mac.');
          }
          await wait(1000);
        }
      }
      if (!opened) return;
      if (request.current !== version) { await opened.close(); return; }
      lastTarget.current = target.grantId;
      const port = /^(?:auto|attached)-port:(\d+)$/.exec(target.targetId)?.[1];
      const pageWithLabel = { ...opened, label: port ? `localhost:${port}` : target.name || target.targetId };
      pageRef.current = pageWithLabel;
      setPage(pageWithLabel);
    } catch (cause) { if (request.current === version) setError(message(cause)); }
    finally { if (request.current === version) setBusy(false); }
  }, [workspace.actions, projectId]);

  useEffect(() => {
    if (!visible) {
      releasePage();
      return;
    }
    // A changed project or connection action set is a new Preview scope.
    // Ordinary Host project refreshes must leave the current proxy running.
    releasePage();
    const version = ++request.current;
    setTargets([]); setError(''); setBusy(true);
    const pending = request;
    const found = knownRef.current;
    if (found && previewTargetRunning(found) && previewTargetMatchesProject(found, projectId, projectsRef.current)) {
      setTargets([found]);
      void open(found);
      return () => { pending.current++; };
    }
    // Nothing running yet: keep looking, and open the site the moment its server starts.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const look = () => void workspace.actions.listPreviews?.().then(result => {
      if (request.current !== version) return;
      const matches = result.targets.filter(target =>
        previewTargetMatchesProject(target, projectId, projectsRef.current) && previewTargetRunning(target));
      setTargets(matches);
      const automatic = matches.length === 1 ? matches[0]
        : matches.find(target => target.grantId === lastTarget.current);
      if (automatic) void open(automatic);
      else {
        setBusy(false);
        if (!matches.length) timer = setTimeout(look, 2000);
      }
    }).catch(cause => { if (request.current === version) { setError(message(cause)); setBusy(false); } });
    look();
    return () => { pending.current++; clearTimeout(timer); };
  }, [visible, projectId, workspace.actions, open, releasePage]);

  useEffect(() => {
    if (visible && workspace.status !== 'connected') {
      request.current++;
      releasePage();
      setError('The Mac disconnected. Reconnect before opening Live Preview.');
    }
  }, [visible, workspace.status, releasePage]);

  // Keep the presenting view mounted while Preview covers it. The secure
  // transport WebView lives there; fullScreen removes it from the view tree
  // and WebKit throttles its socket callbacks during image-heavy pages.
  return <Modal visible={visible} animationType="slide" presentationStyle="overFullScreen" onRequestClose={close}>
    <StatusBar hidden={false} barStyle={dark ? 'light-content' : 'dark-content'} />
    <SafeAreaProvider style={styles.empty}>
    {page ? <PreviewWebView startUrl={page.url} label={page.label} onClose={close} /> :
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
            <Text style={[styles.explain, { color: colors.muted }]}>No site is running for this project yet. Start it on your Mac and it opens here by itself.</Text>
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
