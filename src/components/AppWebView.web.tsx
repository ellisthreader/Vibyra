import React from "react";
import { StyleProp, View, ViewStyle, StyleSheet } from "react-native";

export type AppWebViewProps = {
  html?: string;
  url?: string;
  reloadKey: number;
  style?: StyleProp<ViewStyle>;
};

export function AppWebView({ html, reloadKey, style, url }: AppWebViewProps) {
  return (
    <View style={[styles.host, style]}>
      <iframe
        key={reloadKey}
        src={html ? undefined : url}
        srcDoc={html || undefined}
        sandbox="allow-scripts allow-forms allow-pointer-lock allow-popups allow-modals allow-same-origin"
        style={iframeStyle}
        title="Vibyra preview"
      />
    </View>
  );
}

const iframeStyle: React.CSSProperties = {
  backgroundColor: "#0B0D17",
  border: "0",
  display: "block",
  height: "100%",
  width: "100%"
};

const styles = StyleSheet.create({
  host: {
    backgroundColor: "#0B0D17",
    flex: 1,
    overflow: "hidden"
  }
});
