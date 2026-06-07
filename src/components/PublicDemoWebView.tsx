import React from "react";
import { StyleProp, ViewStyle } from "react-native";
import { AppWebView, PreviewRuntimeError } from "./AppWebView";
import { sanitizePublicDemoUrl } from "../utils/publicDemoUrls";

export function PublicDemoWebView({
  html,
  onPreviewError,
  reloadKey,
  style,
  url
}: {
  html?: string;
  onPreviewError?: (error: PreviewRuntimeError) => void;
  reloadKey: number;
  style?: StyleProp<ViewStyle>;
  url?: string;
}) {
  return (
    <AppWebView
      html={html}
      onPreviewError={onPreviewError}
      reloadKey={reloadKey}
      style={style}
      url={sanitizePublicDemoUrl(url)}
    />
  );
}
