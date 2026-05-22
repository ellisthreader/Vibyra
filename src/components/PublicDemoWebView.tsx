import React from "react";
import { StyleProp, ViewStyle } from "react-native";
import { AppWebView } from "./AppWebView";

export function PublicDemoWebView({
  html,
  reloadKey,
  style,
  url
}: {
  html?: string;
  reloadKey: number;
  style?: StyleProp<ViewStyle>;
  url?: string;
}) {
  return <AppWebView html={html} reloadKey={reloadKey} style={style} url={publicDemoUrl(url)} />;
}

function publicDemoUrl(url?: string) {
  if (!url || !/^https?:\/\//i.test(url)) return undefined;
  return url;
}
