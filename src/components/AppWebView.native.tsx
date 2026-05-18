import React from "react";
import { ActivityIndicator, StyleProp, View, ViewStyle, StyleSheet } from "react-native";
import { WebView, WebViewMessageEvent } from "react-native-webview";
import {
  ERROR_CAPTURE_SCRIPT,
  parsePreviewError,
  preparePreviewHtml,
  PreviewRuntimeError
} from "./appWebViewPreview";

export type { PreviewRuntimeError };

export type AppWebViewProps = {
  html?: string;
  onPreviewError?: (error: PreviewRuntimeError) => void;
  url?: string;
  reloadKey: number;
  style?: StyleProp<ViewStyle>;
};

export function AppWebView({ html, onPreviewError, reloadKey, style, url }: AppWebViewProps) {
  const source = html ? { html: preparePreviewHtml(html), baseUrl: "about:blank" } : { uri: url ?? "about:blank" };

  return (
    <WebView
      key={reloadKey}
      originWhitelist={["*"]}
      source={source}
      style={[styles.web, style]}
      javaScriptEnabled
      domStorageEnabled
      injectedJavaScriptBeforeContentLoaded={ERROR_CAPTURE_SCRIPT}
      onMessage={(event) => handlePreviewMessage(event, onPreviewError)}
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
      mediaPlaybackRequiresUserAction
      setSupportMultipleWindows={false}
      mixedContentMode="always"
      startInLoadingState
      renderLoading={() => (
        <View style={styles.loader}>
          <ActivityIndicator color="#8E3CFF" size="large" />
        </View>
      )}
    />
  );
}

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
