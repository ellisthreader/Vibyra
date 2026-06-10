import React from "react";
import { StyleProp, ViewStyle } from "react-native";
import { AppWebView, PreviewRuntimeError } from "./AppWebView";
import { sanitizePublicDemoUrl } from "../utils/publicDemoUrls";

export function PublicDemoWebView({
  onPreviewError,
  reloadKey,
  style,
  url
}: {
  onPreviewError?: (error: PreviewRuntimeError) => void;
  reloadKey: number;
  style?: StyleProp<ViewStyle>;
  url: string;
}) {
  const approvedUrl = sanitizePublicDemoUrl(url);
  if (!approvedUrl) return null;

  return (
    <AppWebView
      onPreviewError={onPreviewError}
      publicDemo
      reloadKey={reloadKey}
      style={style}
      url={approvedUrl}
    />
  );
}
