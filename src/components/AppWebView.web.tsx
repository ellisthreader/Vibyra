import React from "react";
import { StyleProp, View, ViewStyle, StyleSheet } from "react-native";

export type AppWebViewProps = {
  html?: string;
  url?: string;
  reloadKey: number;
  style?: StyleProp<ViewStyle>;
};

export function AppWebView({ html, reloadKey, style, url }: AppWebViewProps) {
  const safeHtml = html ? prepareSrcDocHtml(html) : undefined;
  return (
    <View style={[styles.host, style]}>
      <iframe
        key={reloadKey}
        src={safeHtml ? undefined : url}
        srcDoc={safeHtml}
        sandbox="allow-scripts allow-forms allow-pointer-lock allow-popups allow-modals"
        style={iframeStyle}
        title="Vibyra preview"
      />
    </View>
  );
}

const RELATIVE_SCRIPT_RE = /<script\b([^>]*)\bsrc\s*=\s*("|')(?!https?:|data:|blob:|\/\/|about:)([^"']*?)\2([^>]*)>\s*<\/script>/gi;
const RELATIVE_LINK_RE = /<link\b([^>]*?)\bhref\s*=\s*("|')(?!https?:|data:|\/\/|about:)([^"']*?)\2([^>]*)>/gi;
const BASE_TAG = '<base href="about:srcdoc">';

function prepareSrcDocHtml(html: string): string {
  // Strip relative <script src> and <link href> — they would resolve against the host page
  // (e.g. http://localhost:8081/App.js), which is never what an AI-generated preview wants.
  let next = html.replace(RELATIVE_SCRIPT_RE, "").replace(RELATIVE_LINK_RE, "");
  if (!/<base\b/i.test(next)) {
    if (/<head[^>]*>/i.test(next)) {
      next = next.replace(/<head([^>]*)>/i, `<head$1>${BASE_TAG}`);
    } else if (/<html[^>]*>/i.test(next)) {
      next = next.replace(/<html([^>]*)>/i, `<html$1><head>${BASE_TAG}</head>`);
    } else {
      next = `<!doctype html><html><head>${BASE_TAG}</head><body>${next}</body></html>`;
    }
  }
  return next;
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
