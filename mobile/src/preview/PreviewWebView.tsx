import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { useTheme } from '../theme';
import { Icon } from '../ui/primitives';
import { previewFrameAllowed, previewNavigationAllowed } from './navigation';
import { PreviewControls } from './PreviewControls';
import { PreviewStatus } from './PreviewStatus';
import { usePreviewHostNoun } from './hostNoun';
import { previewProblem } from './previewProblem';
import { previewReadinessScript } from './readinessScript';
import { usePreviewPage } from './usePreviewPage';
import { windowCommand, windowShellScript } from './windowShell';

/** Project messages report rendering only; they have no access to Vibyra actions. */
export function PreviewWebView({ startUrl, label, onClose, nativeWindow = false, onReconnect, onTargets }: {
  startUrl: string; label: string; onClose(): void; nativeWindow?: boolean; onReconnect?(): void; onTargets?(): void;
}) {
  const page = usePreviewPage(startUrl);
  const source = useMemo(() => ({ uri: startUrl }), [startUrl]);
  const insets = useSafeAreaInsets();
  const host = usePreviewHostNoun();
  const { colors } = useTheme();
  const { width, height } = useWindowDimensions();
  const shell = useMemo(() => windowShellScript({ targets: !!onTargets, accent: colors.action, label }), [onTargets, colors.action, label]);
  // A computer app's viewer with its own controls (close, window list, zoom)
  // gets the whole screen, edge to edge; until it says so, the app's chrome stays.
  const [ownControls, setOwnControls] = useState(false);
  useEffect(() => { setOwnControls(false); }, [page.attempt, startUrl]);
  const chrome = !(nativeWindow && ownControls && page.phase === 'ready');
  // Sideways the page gets the whole screen; only close and targets float.
  const sideways = width > height;
  const floating = sideways && chrome && <View style={[styles.floating, { top: insets.top + 8, left: insets.left + 8 }]}>
    <Pressable accessibilityRole="button" accessibilityLabel="Close Live Preview" onPress={onClose} style={styles.float}>
      <Icon name="close-outline" size={21} color="#fff" />
    </Pressable>
    {onTargets && <Pressable accessibilityRole="button" accessibilityLabel="Choose preview target" onPress={onTargets} style={styles.float}>
      <Icon name="layers-outline" size={19} color="#fff" />
    </Pressable>}
  </View>;
  return <View style={[styles.container, { backgroundColor: nativeWindow ? '#0d0e12' : colors.background }]}>
    {!sideways && chrome && <View style={[styles.addressBar, { paddingTop: insets.top + 6, backgroundColor: colors.rail,
      borderBottomColor: colors.border }]}>
      <View style={[styles.address, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Icon name={nativeWindow ? 'desktop-outline' : 'globe-outline'} size={14} color={colors.muted} />
        <Text numberOfLines={1} style={[styles.addressText, { color: colors.text }]}>
          {label}{page.location === '/' ? '' : page.location}
        </Text>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Close Live Preview"
        onPress={onClose} style={styles.close}>
        <Icon name="close-outline" size={23} color={colors.text} />
      </Pressable>
      {onTargets && <Pressable accessibilityRole="button" accessibilityLabel="Choose preview target" onPress={onTargets} style={styles.close}>
        <Icon name="layers-outline" size={21} color={colors.text} />
      </Pressable>}
      {page.phase === 'loading' && page.progress > 0 && page.progress < 1 &&
        <View pointerEvents="none" style={[styles.progress, { width: `${Math.round(page.progress * 100)}%`, backgroundColor: colors.accent }]} />}
    </View>}
    <View style={[styles.container, sideways && chrome && { paddingLeft: insets.left, paddingRight: insets.right }]}>
      {page.phase !== 'error' && <WebView
        key={page.attempt} ref={page.browser} source={source}
        incognito javaScriptEnabled domStorageEnabled originWhitelist={['*']}
        injectedJavaScriptBeforeContentLoaded={nativeWindow ? shell : previewReadinessScript}
        injectedJavaScript={nativeWindow ? 'true;' : previewReadinessScript}
        injectedJavaScriptBeforeContentLoadedForMainFrameOnly
        injectedJavaScriptForMainFrameOnly
        onShouldStartLoadWithRequest={request => request.isTopFrame === false
          ? previewFrameAllowed(startUrl, request.url) : previewNavigationAllowed(startUrl, request.url)}
        onNavigationStateChange={page.navigate}
        onLoadStart={({ nativeEvent }) => page.begin(nativeEvent.url)}
        onLoadProgress={({ nativeEvent }) => page.setProgress(nativeEvent.progress)}
        onMessage={({ nativeEvent }) => {
          // Only a computer app's viewer may close or switch; website pages cannot.
          if (nativeWindow && windowCommand(nativeEvent.data, nativeEvent.url, startUrl,
            { close: onClose, targets: onTargets, controls: () => setOwnControls(true) })) return;
          page.message(nativeEvent.data, nativeEvent.url);
        }}
        onError={({ nativeEvent }) => page.fail(previewProblem('connection', nativeEvent.description, undefined, host))}
        onHttpError={({ nativeEvent }) => page.httpError(nativeEvent.url, nativeEvent.statusCode)}
        onContentProcessDidTerminate={() => page.fail(previewProblem('process'))}
        renderError={() => <View />}
        sharedCookiesEnabled={false} allowsBackForwardNavigationGestures={false}
        // A computer app's viewer raises the keyboard when the app focuses a text
        // field; its own controls replace the web keyboard bar.
        keyboardDisplayRequiresUserAction={!nativeWindow} hideKeyboardAccessoryView={nativeWindow}
      />}
      {page.phase !== 'ready' && <View style={StyleSheet.absoluteFill}>
        <PreviewStatus key={page.attempt} nativeWindow={nativeWindow} label={label} problem={page.problem} onRetry={nativeWindow ? onReconnect ?? page.retry : page.retry} onClose={onClose} />
      </View>}
    </View>
    {floating}
    {page.phase === 'ready' && !nativeWindow && <PreviewControls location={page.location}
      back={page.navigation.back} forward={page.navigation.forward}
      onBack={page.back} onForward={page.forward} onReload={page.retry} onClose={onClose} />}
  </View>;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  addressBar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12,
    paddingBottom: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  address: { flex: 1, minHeight: 36, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12, flexDirection: 'row', gap: 8, alignItems: 'center' },
  addressText: { flex: 1, fontSize: 13, fontWeight: '600' },
  progress: { position: 'absolute', left: 0, bottom: 0, height: 2 },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  floating: { position: 'absolute', flexDirection: 'row', gap: 8 },
  float: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(18,20,26,0.72)' },
});
