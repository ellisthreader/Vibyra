import React from "react";
import { StyleProp, ViewStyle, StyleSheet } from "react-native";
import { LoadingScreen } from "./LoadingScreen";
import { WebView, WebViewMessageEvent } from "react-native-webview";
import {
  ERROR_CAPTURE_SCRIPT,
  parsePreviewError,
  preparePreviewHtml,
  PreviewRuntimeError
} from "./appWebViewPreview";
import {
  createWebViewNavigationPolicy,
  isWebViewNavigationAllowed
} from "./webViewNavigationPolicy";

export type { PreviewRuntimeError };

export type AppWebViewProps = {
  html?: string;
  onPreviewError?: (error: PreviewRuntimeError) => void;
  publicDemo?: boolean;
  url?: string;
  reloadKey: number;
  style?: StyleProp<ViewStyle>;
};

export function AppWebView({ html, onPreviewError, publicDemo = false, reloadKey, style, url }: AppWebViewProps) {
  const source = publicDemo
    ? { uri: url ?? "about:blank" }
    : html
      ? { html: preparePreviewHtml(html), baseUrl: "about:blank" }
      : { uri: url ?? "about:blank" };
  const navigationPolicy = createWebViewNavigationPolicy(html, url, publicDemo);

  return (
    <WebView
      key={reloadKey}
      originWhitelist={publicDemo ? ["https://*"] : ["about:blank", "http://*", "https://*"]}
      source={source}
      style={[styles.web, style]}
      javaScriptEnabled
      domStorageEnabled={!publicDemo}
      cacheEnabled={!publicDemo}
      incognito={publicDemo}
      sharedCookiesEnabled={false}
      thirdPartyCookiesEnabled={false}
      allowFileAccess={false}
      allowFileAccessFromFileURLs={false}
      allowUniversalAccessFromFileURLs={false}
      injectedJavaScriptBeforeContentLoaded={publicDemo ? PUBLIC_DEMO_ISOLATION_SCRIPT : ERROR_CAPTURE_SCRIPT}
      onMessage={(publicDemo
        ? undefined
        : (event: WebViewMessageEvent) => handlePreviewMessage(event, onPreviewError))}
      onShouldStartLoadWithRequest={(event) => isWebViewNavigationAllowed(navigationPolicy, event.url)}
      onError={(event) => {
        onPreviewError?.({
          message: event.nativeEvent.description || "Preview failed to load",
          type: "webview"
        });
      }}
      onHttpError={(event) => {
        onPreviewError?.({
          message: `Preview request failed: HTTP ${event.nativeEvent.statusCode}`,
          source: event.nativeEvent.url,
          stack: event.nativeEvent.description,
          type: "webview"
        });
      }}
      allowsInlineMediaPlayback
      allowsBackForwardNavigationGestures={false}
      allowsLinkPreview={false}
      dataDetectorTypes="none"
      mediaPlaybackRequiresUserAction
      javaScriptCanOpenWindowsAutomatically={false}
      setSupportMultipleWindows={false}
      onOpenWindow={() => undefined}
      mixedContentMode="never"
      pullToRefreshEnabled={!publicDemo}
      webviewDebuggingEnabled={!publicDemo && __DEV__}
      startInLoadingState
      renderLoading={() => (
        <LoadingScreen compact message="Loading preview." style={styles.loader} title="Opening app" />
      )}
    />
  );
}

const PUBLIC_DEMO_ISOLATION_SCRIPT = String.raw`
(() => {
  const blockedHost = (hostname) => {
    const host = String(hostname || "").toLowerCase().replace(/^\[|\]$/g, "");
    if (!host || host === "localhost" || host.endsWith(".localhost") ||
        host.endsWith(".local") || host.endsWith(".lan") || host.endsWith(".internal")) return true;
    if (host === "::" || host === "::1" || host.startsWith("fc") ||
        host.startsWith("fd") || host.startsWith("fe80:")) return true;
    const parts = host.split(".");
    if (parts.length !== 4 || parts.some((part) => !/^\d+$/.test(part) || Number(part) > 255)) return false;
    const [a, b] = parts.map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 198 && b >= 18 && b <= 19);
  };
  const allowed = (value) => {
    try {
      const url = new URL(String(value), location.href);
      return ["data:", "blob:", "about:"].includes(url.protocol) ||
        (url.protocol === "https:" && !url.username && !url.password && !blockedHost(url.hostname));
    } catch {
      return false;
    }
  };
  const deny = () => Promise.reject(new TypeError("Blocked public demo network request"));
  const nativeFetch = window.fetch.bind(window);
  window.fetch = (input, init) => allowed(input && input.url ? input.url : input)
    ? nativeFetch(input, init)
    : deny();
  const nativeOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(method, url, ...rest) {
    if (!allowed(url)) throw new DOMException("Blocked public demo network request", "SecurityError");
    return nativeOpen.call(this, method, url, ...rest);
  };
  const guardConstructor = (NativeConstructor) => function(url, ...rest) {
    if (!allowed(url)) throw new DOMException("Blocked public demo network request", "SecurityError");
    return new NativeConstructor(url, ...rest);
  };
  if (window.WebSocket) window.WebSocket = guardConstructor(window.WebSocket);
  if (window.EventSource) window.EventSource = guardConstructor(window.EventSource);
  if (navigator.sendBeacon) {
    const nativeSendBeacon = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = (url, data) => allowed(url) && nativeSendBeacon(url, data);
  }
  window.open = () => null;
})();
true;
`;

function handlePreviewMessage(event: WebViewMessageEvent, onPreviewError?: (error: PreviewRuntimeError) => void) {
  if (!onPreviewError) return;
  try {
    const error = parsePreviewError(JSON.parse(event.nativeEvent.data));
    if (error) onPreviewError(error);
  } catch {
    /* Ignore messages from the preview app that are not runtime diagnostics. */
  }
}

const styles = StyleSheet.create({
  loader: {
    alignItems: "center",
    backgroundColor: "#0B0D17",
    bottom: 0,
    justifyContent: "center",
    left: 0,
    position: "absolute",
    right: 0,
    top: 0
  },
  web: {
    backgroundColor: "transparent",
    flex: 1
  }
});
