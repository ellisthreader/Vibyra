import React, { useState } from "react";
import { Pressable, Text, useWindowDimensions, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { AppWebView } from "../../../components/AppWebView";
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
  const [reloadVersion, setReloadVersion] = useState(0);
  const previewHeight = Math.max(520, height - 146);

  return (
    <View style={[styles.communityAppPreviewPage, { minHeight: previewHeight }]}>
      <View style={styles.communityAppPreviewHeader}>
        <View style={styles.communityAppPreviewIdentity}>
          <CommunityAppLogo accent={communityDetailAccent} post={post} size={42} />
          <View style={styles.communityOpenedAppCopy}>
            <Text style={styles.communityOpenedAppKicker}>{opened ? "Opened app" : "App preview"}</Text>
            <Text numberOfLines={1} style={styles.communityOpenedAppTitle}>{formatCommunityTitle(post.title)}</Text>
          </View>
        </View>
        <Pressable accessibilityLabel="Reload app preview" accessibilityRole="button" onPress={() => setReloadVersion((value) => value + 1)} style={styles.communityAppPreviewRefresh}>
          <Ionicons name="refresh" color="#F6F2FF" size={19} />
        </Pressable>
      </View>
      {post.appUrl ? (
        <View style={styles.communityAppPreviewFrame}>
          <AppWebView reloadKey={(post.id.length * 31) + reloadVersion} url={post.appUrl} />
        </View>
      ) : (
        <View style={styles.communityDemoPanel}>
          <Text style={styles.communityDemoLabel}>Live app data</Text>
          <Text style={styles.communityDemoValue}>Unavailable</Text>
          <Text style={styles.communityDemoLineText}>This community app does not expose a live preview payload yet.</Text>
        </View>
      )}
    </View>
  );
}

export function CommunityAppExperience({ post }: { post: CommunityPost }) {
  return <CommunityOpenedAppPage opened post={post} />;
}

export function formatCommunityTitle(title: string) {
  return title.replace(/\b\w/g, (letter) => letter.toUpperCase()).replace(/\bAi\b/g, "AI").replace(/\bSaas\b/g, "SaaS");
}
