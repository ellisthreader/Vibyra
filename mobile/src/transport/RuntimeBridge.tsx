import React, { forwardRef, useImperativeHandle, useRef } from 'react';
import { Platform, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { runtimeHtml } from '../generated/runtime';
import type { BridgeHandle, BridgeProps } from './Bridge.types';

export const RuntimeBridge = forwardRef<BridgeHandle, BridgeProps>(({ onMessage }, ref) => {
  const webview = useRef<WebView>(null);
  // WKWebView blocks a local ws:// Host from an HTTPS page; Noise encrypts the transport.
  const origin = Platform.OS === 'ios' ? 'http://localhost' : 'https://localhost';
  useImperativeHandle(ref, () => ({ post: message => webview.current?.postMessage(JSON.stringify(message)) }), []);
  return <View style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    <WebView ref={webview} source={{ html: runtimeHtml, baseUrl: origin }}
      originWhitelist={['*']} javaScriptEnabled domStorageEnabled={false}
      onShouldStartLoadWithRequest={request => request.url === 'about:blank' || request.url === `${origin}/`}
      onMessage={event => { try { onMessage(JSON.parse(event.nativeEvent.data)); } catch { /* Ignore invalid bridge data. */ } }}
      onContentProcessDidTerminate={() => onMessage({ type: 'error', message: 'iOS restarted the secure connection. Reconnect to your computer.' })}
      onError={() => onMessage({ type: 'error', message: 'Secure connection support could not start.' })}
      mixedContentMode="always" allowsInlineMediaPlayback={false}
    />
  </View>;
});
