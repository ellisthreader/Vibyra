import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { useTheme } from '../theme';
import { Icon } from '../ui/primitives';
import { previewFrameAllowed, previewNavigationAllowed } from './navigation';
import { PreviewControls } from './PreviewControls';
import { PreviewStatus } from './PreviewStatus';
import { previewProblem } from './previewProblem';
import { previewReadinessScript } from './readinessScript';
import { usePreviewPage } from './usePreviewPage';

/** Project messages report rendering only; they have no access to Vibyra actions. */
export function PreviewWebView({ startUrl, label, onClose }: {
  startUrl: string; label: string; onClose(): void;
}) {
  const page = usePreviewPage(startUrl);
  const source = useMemo(() => ({ uri: startUrl }), [startUrl]);
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  return <View style={[styles.container, { backgroundColor: colors.background }]}>
    <View style={[styles.addressBar, { paddingTop: insets.top + 6, backgroundColor: colors.rail,
      borderBottomColor: colors.border }]}>
      <View style={[styles.address, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Icon name="globe-outline" size={14} color={colors.muted} />
        <Text numberOfLines={1} style={[styles.addressText, { color: colors.text }]}>
          {label}{page.location === '/' ? '' : page.location}
        </Text>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Close Live Preview"
        onPress={onClose} style={styles.close}>
        <Icon name="close-outline" size={23} color={colors.text} />
      </Pressable>
      {page.phase === 'loading' && page.progress > 0 && page.progress < 1 &&
        <View pointerEvents="none" style={[styles.progress, { width: `${Math.round(page.progress * 100)}%`, backgroundColor: colors.accent }]} />}
    </View>
    <View style={styles.container}>
      {page.phase !== 'error' && <WebView
        key={page.attempt} ref={page.browser} source={source}
        incognito javaScriptEnabled domStorageEnabled originWhitelist={['*']}
        injectedJavaScriptBeforeContentLoaded={previewReadinessScript}
        injectedJavaScript={previewReadinessScript}
        injectedJavaScriptBeforeContentLoadedForMainFrameOnly
        injectedJavaScriptForMainFrameOnly
        onShouldStartLoadWithRequest={request => request.isTopFrame === false
          ? previewFrameAllowed(startUrl, request.url) : previewNavigationAllowed(startUrl, request.url)}
        onNavigationStateChange={page.navigate}
        onLoadStart={({ nativeEvent }) => page.begin(nativeEvent.url)}
        onLoadProgress={({ nativeEvent }) => page.setProgress(nativeEvent.progress)}
        onMessage={({ nativeEvent }) => page.message(nativeEvent.data, nativeEvent.url)}
        onError={({ nativeEvent }) => page.fail(previewProblem('connection', nativeEvent.description))}
        onHttpError={({ nativeEvent }) => page.httpError(nativeEvent.url, nativeEvent.statusCode)}
        onContentProcessDidTerminate={() => page.fail(previewProblem('process'))}
        renderError={() => <View />}
        sharedCookiesEnabled={false} allowsBackForwardNavigationGestures={false}
      />}
      {page.phase !== 'ready' && <View style={StyleSheet.absoluteFill}>
        <PreviewStatus key={page.attempt} label={label} problem={page.problem} onRetry={page.retry} onClose={onClose} />
      </View>}
    </View>
    {page.phase === 'ready' && <PreviewControls location={page.location}
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
});
