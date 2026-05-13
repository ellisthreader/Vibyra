import React, { useEffect, useRef } from "react";
import { StyleProp, View, ViewStyle, StyleSheet } from "react-native";
import { parsePreviewError, prepareSrcDocHtml, PreviewRuntimeError } from "./appWebViewPreview";

export type { PreviewRuntimeError };

export type AppWebViewProps = {
  html?: string;
  onPreviewError?: (error: PreviewRuntimeError) => void;
  url?: string;
  reloadKey: number;
  style?: StyleProp<ViewStyle>;
};

export function AppWebView({ html, onPreviewError, reloadKey, style, url }: AppWebViewProps) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const safeHtml = html ? prepareSrcDocHtml(html) : undefined;

  useEffect(() => {
    if (!onPreviewError) return undefined;
    const listener = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return;
      const error = parsePreviewError(event.data);
      if (error) onPreviewError(error);
    };
    window.addEventListener("message", listener);
    return () => window.removeEventListener("message", listener);
  }, [onPreviewError]);

  return (
    <View style={[styles.host, style]}>
      <iframe
        key={reloadKey}
        ref={iframeRef}
        src={safeHtml ? undefined : url}
        srcDoc={safeHtml}
        sandbox="allow-scripts allow-same-origin allow-forms allow-pointer-lock allow-popups allow-modals"
        style={iframeStyle}
        title="App preview"
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
