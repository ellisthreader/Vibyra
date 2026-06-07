import React, { useEffect, useMemo, useState } from "react";
import { Pressable, Text, useWindowDimensions, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { PublicDemoWebView } from "../../../components/PublicDemoWebView";
import { firstPublicDemoUrl, publicDemoUrlBlockedReason } from "../../../utils/publicDemoUrls";
import { communityDetailAccent } from "../data/community";
import { styles } from "../styles";
import type { CommunityComment, CommunityPost } from "../types";
import { CommunityAppLogo } from "./chunk16";

export function getCommunitySeedComments(post: CommunityPost): CommunityComment[] {
  void post;
  return [];
}

export function CommunityOpenedAppPage({ opened, post }: { opened: boolean; post: CommunityPost }) {
  const { height } = useWindowDimensions();
  const demoUrl = useMemo(() => communityDemoUrl(post), [post]);
  const [reloadVersion, setReloadVersion] = useState(0);
  const [previewError, setPreviewError] = useState("");
  const previewHeight = Math.max(520, height - 146);
  const hostingStatus = communityHostingStatus(post);
  const unavailableMessage = previewError || communityUnavailableMessage(post, demoUrl);
  const shouldRenderDemo = Boolean(post.previewHtml || demoUrl) && !previewError;

  useEffect(() => {
    setPreviewError("");
    setReloadVersion(0);
  }, [demoUrl, post.id, post.previewHtml]);

  return (
    <View style={[styles.communityAppPreviewPage, { minHeight: previewHeight }]}>
      <View style={styles.communityAppPreviewHeader}>
        <View style={styles.communityAppPreviewIdentity}>
          <CommunityAppLogo accent={communityDetailAccent} post={post} size={42} />
          <View style={styles.communityOpenedAppCopy}>
            <Text style={styles.communityOpenedAppKicker}>{previewError ? "Preview unavailable" : opened ? "Opened preview" : "App preview"}</Text>
            <Text numberOfLines={1} style={styles.communityOpenedAppTitle}>{formatCommunityTitle(post.title)}</Text>
            {hostingStatus ? <Text numberOfLines={1} style={styles.communityOpenedAppSubtitle}>{hostingStatus}</Text> : null}
          </View>
        </View>
        <Pressable accessibilityLabel="Reload app preview" accessibilityRole="button" onPress={() => { setPreviewError(""); setReloadVersion((value) => value + 1); }} style={styles.communityAppPreviewRefresh}>
          <Ionicons name="refresh" color="#F6F2FF" size={19} />
        </Pressable>
      </View>
      {shouldRenderDemo ? (
        <View style={styles.communityAppPreviewFrame}>
          <PublicDemoWebView
            html={post.previewHtml}
            onPreviewError={(error) => {
              if (error.type === "webview") setPreviewError(cleanPreviewError(error.message || error.stack || ""));
            }}
            reloadKey={(post.id.length * 31) + reloadVersion}
            url={demoUrl}
          />
        </View>
      ) : (
        <View style={styles.communityDemoPanel}>
          <Text style={styles.communityDemoLabel}>Live preview</Text>
          <Text style={styles.communityDemoValue}>Unavailable</Text>
          <Text style={styles.communityDemoLineText}>{unavailableMessage}</Text>
        </View>
      )}
    </View>
  );
}

export function CommunityAppExperience({ post }: { post: CommunityPost }) {
  return <CommunityOpenedAppPage opened post={post} />;
}

export function hasCommunityRunnableDemo(post: CommunityPost) {
  return Boolean(post.previewHtml || communityDemoUrl(post));
}

export function formatCommunityTitle(title: string) {
  return title.replace(/\b\w/g, (letter) => letter.toUpperCase()).replace(/\bAi\b/g, "AI").replace(/\bSaas\b/g, "SaaS");
}

function communityHostingStatus(post: CommunityPost) {
  const status = post.hostedDemoStatus || post.deploymentStatus;
  const hasDemo = hasCommunityRunnableDemo(post);
  const capability = capabilityLabel(post);
  if (status === "ready") return hasDemo ? capability : "Preview unavailable";
  if (status === "pending") return capability;
  if (status === "failed") return post.hostedDemoMessage || "Live preview unavailable";
  if (status === "unavailable") return hasDemo ? capability : "Preview unavailable";
  return hasDemo ? capability : "";
}

function communityDemoUrl(post: CommunityPost) {
  return firstPublicDemoUrl([post.hostedDemoUrl, post.previewUrl, post.publicUrl, post.appUrl]);
}

function capabilityLabel(post: CommunityPost) {
  const frontend = post.frontendStatus === "unavailable" ? "Frontend unavailable" : "Frontend ready";
  if (!post.backendStatus || post.backendStatus === "not_included") return `${frontend} | Backend not included`;
  const platform = post.backendPlatform ? ` (${post.backendPlatform})` : "";
  const backend = post.backendStatus === "ready"
    ? `Backend live${platform}`
    : post.backendStatus === "pending"
      ? `Backend building${platform}`
      : `Backend unavailable${platform}`;
  return `${frontend} | ${backend}`;
}

function communityUnavailableMessage(post: CommunityPost, demoUrl?: string) {
  if (post.previewHtml || demoUrl) return "";
  const reason = publicDemoUrlBlockedReason(post.hostedDemoUrl || post.previewUrl || post.publicUrl || post.appUrl);
  if (reason) return `${reason} Publish a hosted HTTPS demo before opening this app in Explore.`;
  return "This community app does not expose a public preview yet.";
}

function cleanPreviewError(message: string) {
  const lower = message.toLowerCase();
  if (lower.includes("refused") || lower.includes("network") || lower.includes("could not connect") || lower.includes("failed to load")) {
    return "This hosted demo is not reachable from your phone.";
  }
  if (lower.includes("http 404")) return "This published app no longer has a hosted demo available.";
  if (/http 5\d\d/i.test(message)) return "This hosted demo is temporarily unavailable.";
  return "This published app could not be opened from Explore.";
}
