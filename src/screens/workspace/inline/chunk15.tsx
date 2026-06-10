import React, { useEffect, useMemo, useState } from "react";
import { Modal, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { PublicDemoWebView } from "../../../components/PublicDemoWebView";
import { firstPublicDemoUrl, publicDemoUrlBlockedReason } from "../../../utils/publicDemoUrls";
import { styles } from "../styles";
import type { CommunityComment, CommunityPost } from "../types";

export function getCommunitySeedComments(post: CommunityPost): CommunityComment[] {
  void post;
  return [];
}

export function CommunityOpenedAppPage({ onClose, post }: { onClose: () => void; post: CommunityPost }) {
  const insets = useSafeAreaInsets();
  const demoUrl = useMemo(() => communityDemoUrl(post), [post]);
  const [reloadVersion, setReloadVersion] = useState(0);
  const [previewError, setPreviewError] = useState("");
  const unavailableMessage = previewError || communityUnavailableMessage(post, demoUrl);
  const shouldRenderDemo = Boolean(demoUrl) && !previewError;

  useEffect(() => {
    setPreviewError("");
    setReloadVersion(0);
  }, [demoUrl, post.id]);

  return (
    <Modal
      animationType="slide"
      navigationBarTranslucent
      onRequestClose={onClose}
      presentationStyle="fullScreen"
      statusBarTranslucent
      visible
    >
      <View style={styles.communityAppFullscreen}>
        <View style={[styles.communityAppContent, { paddingTop: Math.max(insets.top, 12) }]}>
          {shouldRenderDemo ? (
            <PublicDemoWebView
              onPreviewError={(error) => {
                if (error.type === "webview") setPreviewError(cleanPreviewError(error.message || error.stack || ""));
              }}
              reloadKey={(post.id.length * 31) + reloadVersion}
              style={styles.communityAppFullscreenWebView}
              url={demoUrl || ""}
            />
          ) : (
            <View style={styles.communityAppUnavailable}>
              <View style={styles.communityDemoPanel}>
                <Text style={styles.communityDemoLabel}>Live preview</Text>
                <Text style={styles.communityDemoValue}>Unavailable</Text>
                <Text style={styles.communityDemoLineText}>{unavailableMessage}</Text>
              </View>
            </View>
          )}
        </View>
        <View pointerEvents="box-none" style={[styles.communityAppFloatingControls, { paddingTop: Math.max(insets.top, 12) }]}>
          <Pressable
            accessibilityHint="Returns to the Explore app details"
            accessibilityLabel="Close full-screen app"
            accessibilityRole="button"
            hitSlop={8}
            onPress={onClose}
            style={styles.communityAppFloatingButton}
          >
            <Ionicons name="close" color="#FFFFFF" size={24} />
          </Pressable>
          <Pressable
            accessibilityLabel="Reload full-screen app"
            accessibilityRole="button"
            hitSlop={8}
            onPress={() => { setPreviewError(""); setReloadVersion((value) => value + 1); }}
            style={styles.communityAppFloatingButton}
          >
            <Ionicons name="refresh" color="#FFFFFF" size={21} />
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

export function CommunityAppExperience({ onClose, post }: { onClose: () => void; post: CommunityPost }) {
  return <CommunityOpenedAppPage onClose={onClose} post={post} />;
}

export function hasCommunityRunnableDemo(post: CommunityPost) {
  return Boolean(communityDemoUrl(post));
}

export function formatCommunityTitle(title: string) {
  return title.replace(/\b\w/g, (letter) => letter.toUpperCase()).replace(/\bAi\b/g, "AI").replace(/\bSaas\b/g, "SaaS");
}

function communityDemoUrl(post: CommunityPost) {
  return firstPublicDemoUrl([post.hostedDemoUrl, post.previewUrl, post.publicUrl, post.appUrl]);
}

function communityUnavailableMessage(post: CommunityPost, demoUrl?: string) {
  if (demoUrl) return "";
  if (post.previewHtml) {
    return "This app only includes an inline preview. Publish an approved HTTPS demo before opening it in Explore.";
  }
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
