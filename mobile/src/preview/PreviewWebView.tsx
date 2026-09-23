import { useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { previewNavigationAllowed } from './navigation';
import { PreviewControls } from './PreviewControls';

/** An isolated browser surface; project JavaScript receives no Vibyra bridge. */
export function PreviewWebView({ startUrl, onClose }: { startUrl: string; onClose(): void }) {
  const browser = useRef<WebView>(null);
  const [location, setLocation] = useState('/');
  const [back, setBack] = useState(false);
  const [forward, setForward] = useState(false);
  const [error, setError] = useState('');
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.container}>
      <WebView
        ref={browser}
        source={{ uri: startUrl }}
        incognito
        javaScriptEnabled
        domStorageEnabled
        originWhitelist={['http://127.0.0.1:*']}
        onShouldStartLoadWithRequest={(request) => {
          const allowed = previewNavigationAllowed(startUrl, request.url);
          if (!allowed) setError('This link leaves the approved Preview site.');
          return allowed;
        }}
        onNavigationStateChange={(state) => {
          setBack(state.canGoBack);
          setForward(state.canGoForward);
          try {
            setLocation(new URL(state.url).pathname + new URL(state.url).search);
          } catch {
            setLocation('/');
          }
          if (state.loading) setError('');
        }}
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
        <Text accessibilityRole="alert" style={[styles.error, { top: insets.top + 10 }]}>
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
