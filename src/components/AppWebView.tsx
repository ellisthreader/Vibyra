import React from "react";
import { ActivityIndicator, StyleProp, View, ViewStyle, StyleSheet } from "react-native";
import { WebView } from "react-native-webview";

export type AppWebViewProps = {
  html?: string;
  url?: string;
  reloadKey: number;
  style?: StyleProp<ViewStyle>;
};

export function AppWebView({ html, reloadKey, style, url }: AppWebViewProps) {
  const source = html ? { html, baseUrl: "about:blank" } : { uri: url ?? "about:blank" };

  return (
    <WebView
      key={reloadKey}
      originWhitelist={["*"]}
      source={source}
      style={[styles.web, style]}
      javaScriptEnabled
      domStorageEnabled
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
