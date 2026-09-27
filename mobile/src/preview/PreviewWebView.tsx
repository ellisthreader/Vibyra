import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { useTheme } from '../theme';
import { Icon } from '../ui/primitives';
import { previewFrameAllowed, previewLocation, previewNavigationAllowed } from './navigation';
import { PreviewControls } from './PreviewControls';

/** An isolated browser surface; project JavaScript receives no Vibyra bridge. */
export function PreviewWebView({ startUrl, label, onClose }: {
  startUrl: string; label: string; onClose(): void;
}) {
  const browser = useRef<WebView>(null);
  const [location, setLocation] = useState('/');
  const [back, setBack] = useState(false);
  const [forward, setForward] = useState(false);
  const [error, setError] = useState('');
  // A page still arriving from the Mac is white until its scripts run; a load
  // line says it is working rather than blank.
  const [progress, setProgress] = useState(0);
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  return (
    <View style={styles.container}>
      <View style={[styles.addressBar, { paddingTop: insets.top + 6, backgroundColor: colors.rail,
        borderBottomColor: colors.border }] }>
        <View style={[styles.address, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text numberOfLines={1} style={[styles.addressText, { color: colors.text }]}>
            {label}{location === '/' ? '' : location}
          </Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Refresh Live Preview"
          onPress={() => browser.current?.reload()} style={styles.refresh}>
          <Icon name="refresh-outline" size={20} color={colors.accent} />
        </Pressable>
        {progress > 0 && progress < 1 ? (
          <View pointerEvents="none" style={[styles.progress, { width: `${Math.round(progress * 100)}%`,
            backgroundColor: colors.accent }]} />
        ) : null}
      </View>
      <WebView
        ref={browser}
        source={{ uri: startUrl }}
        incognito
        javaScriptEnabled
        domStorageEnabled
        // Every load comes to the check below. A narrower whitelist makes the
        // library hand anything else to Linking.openURL, which left the app for
        // Safari whenever a site embedded a third-party frame.
        originWhitelist={['*']}
        onShouldStartLoadWithRequest={(request) => {
          if (request.isTopFrame === false) return previewFrameAllowed(startUrl, request.url);
          const allowed = previewNavigationAllowed(startUrl, request.url);
          if (!allowed) setError('This link leaves the approved Preview site.');
          return allowed;
        }}
        onNavigationStateChange={(state) => {
          setBack(state.canGoBack);
          setForward(state.canGoForward);
          const path = previewLocation(state.url);
          if (path !== null) setLocation(path);
          if (state.loading) setError('');
        }}
        onLoadProgress={({ nativeEvent }) => setProgress(nativeEvent.progress)}
        onLoadEnd={() => setProgress(1)}
        onError={() => setError('Preview could not load. Check the connection and reload.')}
        onHttpError={({ nativeEvent }) => {
          let path = '/';
          try {
            const candidate = new URL(nativeEvent.url).pathname;
            path = candidate.startsWith('/_vibyra_preview/') ? 'Preview setup' : candidate;
          } catch {
            /* Keep a non-sensitive fallback. */
          }
          setError(`Preview received HTTP ${nativeEvent.statusCode} at ${path}.`);
        }}
        onContentProcessDidTerminate={() => setError('iOS restarted Preview. Reload the page.')}
        sharedCookiesEnabled={false}
        allowsBackForwardNavigationGestures={false}
      />
      {error ? (
        <Text accessibilityRole="alert" style={[styles.error, { top: insets.top + 62 }]}>
          {error}
        </Text>
      ) : null}
      <PreviewControls
        location={location}
        back={back}
        forward={forward}
        onBack={() => browser.current?.goBack()}
        onForward={() => browser.current?.goForward()}
        onReload={() => {
          setError('');
          browser.current?.reload();
        }}
        onClose={onClose}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  addressBar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12,
    paddingBottom: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  address: { flex: 1, minHeight: 36, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12, justifyContent: 'center' },
  addressText: { fontSize: 13, fontWeight: '600' },
  progress: { position: 'absolute', left: 0, bottom: 0, height: 2 },
  refresh: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  error: {
    position: 'absolute',
    left: 12,
    right: 70,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#fff4f3',
    color: '#9c2b2b',
    fontSize: 13,
  },
});
