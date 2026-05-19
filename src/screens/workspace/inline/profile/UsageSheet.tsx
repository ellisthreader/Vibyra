import React, { useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useAppContext } from "../../../../context/AppContext";
import { usePreferences, useThemedColor } from "../../../../context/PreferencesContext";
import { styles } from "../../styles";
import type { ChatMessage } from "../../../../types/domain";

const COLLAPSED_HISTORY_COUNT = 3;

export function UsageSheet({ visible, onClose, onUpgrade }: { visible: boolean; onClose: () => void; onUpgrade: () => void }) {
  const app = useAppContext();
  const prefs = usePreferences();
  const primaryIconColor = useThemedColor("#C259FF");
  const emptyIconColor = useThemedColor("#7D6A96");
  const [projectsExpanded, setProjectsExpanded] = useState(false);
  const [chatsExpanded, setChatsExpanded] = useState(false);
  const allowance = Math.max(app.creditsBalance + app.creditsUsed, 1);
  const remaining = Math.max(allowance - app.creditsUsed, 0);
  const usedPercent = Math.min(100, Math.round((app.creditsUsed / allowance) * 100));
  const onFree = app.accountPlan === "free";
  const planAction = onFree ? prefs.t("usage.upgradePlan") : prefs.t("usage.managePlan");
  const projectNames = useMemo(() => new Map(app.projects.map((project) => [project.id, project.name])), [app.projects]);

  const recentProjects = useMemo(
    () => [...app.projects].sort((a, b) => (b.updated || "").localeCompare(a.updated || "")),
    [app.projects]
  );

  const recentChats = useMemo(() => {
    const items: Array<{ projectId: string; projectName: string; preview: string; role: string; tokens: number }> = [];
    for (const [projectId, thread] of Object.entries(app.chatThreads)) {
      if (!thread || thread.length === 0) continue;
      const last = thread[thread.length - 1];
      const title = app.chatTitles[projectId];
      const project = app.chatProjects[projectId];
      items.push({
        projectId,
        projectName: title?.trim() || project?.name || projectNames.get(projectId) || "New chat",
        preview: (last.text || "").trim().slice(0, 80) || "(empty message)",
        role: last.role,
        tokens: threadTokenUsage(thread)
      });
    }
    return items.reverse();
  }, [app.chatProjects, app.chatThreads, app.chatTitles, projectNames]);
  const shownProjects = projectsExpanded ? recentProjects : recentProjects.slice(0, COLLAPSED_HISTORY_COUNT);
  const shownChats = chatsExpanded ? recentChats : recentChats.slice(0, COLLAPSED_HISTORY_COUNT);

  return (
    <Modal animationType="slide" onRequestClose={onClose} presentationStyle="fullScreen" visible={visible}>
      <View style={styles.billingScreen}>
        <View style={styles.billingHeader}>
          <Pressable accessibilityLabel="Back" onPress={onClose} style={styles.billingHeaderBack}>
            <Ionicons name="arrow-back" color={prefs.effectiveScheme === "light" ? "#0A0814" : "#FFFFFF"} size={24} />
          </Pressable>
          <Text style={styles.billingHeaderTitle}>{prefs.t("usage.title")}</Text>
        </View>

        <ScrollView contentContainerStyle={styles.usagePageContent} showsVerticalScrollIndicator={false}>
          <View style={styles.usageHeroBlock}>
            <View style={styles.usageHeroHeader}>
              <View>
                <Text style={styles.usageHeroKicker}>{prefs.t("usage.tokensLeft")}</Text>
                <View style={{ alignItems: "baseline", flexDirection: "row", gap: 6, marginTop: 4 }}>
                  <Text style={styles.usageHeroValue}>{prefs.formatNumber(remaining)}</Text>
                  <Text style={styles.usageHeroDenom}>{prefs.t("billing.tokens")}</Text>
                </View>
              </View>
              <Pressable onPress={onUpgrade} style={styles.usagePlanLink}>
                <Text style={styles.usagePlanLinkText}>{planAction}</Text>
              </Pressable>
            </View>
            <View style={styles.usageProgressTrack}>
              <LinearGradient
                colors={["#6F4DFF", "#9D5CFF", "#C259FF"]}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={[styles.usageProgressFill, { width: `${Math.max(usedPercent, 2)}%` }]}
              />
            </View>
            <View style={styles.usageHeroFooter}>
              <Text style={styles.usageHeroFootnote}>
                {prefs.formatNumber(app.creditsUsed)} / {prefs.formatNumber(allowance)} · {prefs.t("usage.resetsMonthly")}
              </Text>
            </View>
          </View>

          <View style={styles.usageFlatSection}>
            <View style={styles.usageSectionHeader}>
              <Text style={styles.usageSectionTitle}>{prefs.t("usage.recentProjects")}</Text>
              {recentProjects.length > 0 ? <Text style={styles.usageSectionMeta}>{recentProjects.length} {prefs.t("usage.active")}</Text> : null}
            </View>
            {recentProjects.length > 0 ? (
              shownProjects.map((project, i) => (
                <View key={project.id} style={[styles.usageListRow, i === shownProjects.length - 1 && recentProjects.length <= COLLAPSED_HISTORY_COUNT ? styles.usageListRowLast : null]}>
                  <Ionicons name="folder-outline" color={primaryIconColor} size={19} />
                  <View style={styles.usageListBody}>
                    <Text numberOfLines={1} style={styles.usageListTitle}>{project.name}</Text>
                    <Text numberOfLines={1} style={styles.usageListSub}>{project.stack || "Untitled stack"} · {project.updated || "just now"}</Text>
                  </View>
                </View>
              ))
            ) : null}
            {recentProjects.length > COLLAPSED_HISTORY_COUNT ? (
              <ExpandRow expanded={projectsExpanded} total={recentProjects.length} onPress={() => setProjectsExpanded((value) => !value)} tint={primaryIconColor} />
            ) : null}
            {recentProjects.length === 0 ? (
              <EmptyHint icon="folder-open-outline" iconColor={emptyIconColor} text={prefs.t("usage.noProjects")} />
            ) : null}
          </View>

          <View style={styles.usageFlatSection}>
            <View style={styles.usageSectionHeader}>
              <Text style={styles.usageSectionTitle}>{prefs.t("usage.recentChats")}</Text>
              {recentChats.length > 0 ? <Text style={styles.usageSectionMeta}>{recentChats.length} {prefs.t("usage.chats")}</Text> : null}
            </View>
            {recentChats.length > 0 ? shownChats.map((chat, i) => (
              <View key={chat.projectId} style={[styles.usageListRow, i === shownChats.length - 1 && recentChats.length <= COLLAPSED_HISTORY_COUNT ? styles.usageListRowLast : null]}>
                <Ionicons name={chat.role === "assistant" ? "sparkles-outline" : "chatbubble-ellipses-outline"} color={primaryIconColor} size={19} />
                <View style={styles.usageListBody}>
                  <Text numberOfLines={1} style={styles.usageListTitle}>{chat.projectName}</Text>
                  <Text numberOfLines={1} style={styles.usageListSub}>{chat.preview}</Text>
                </View>
                <View style={styles.usageListMeta}>
                  <Text style={styles.usageListCount}>{prefs.formatNumber(chat.tokens)}</Text>
                  <Text style={styles.usageListMetaLabel}>{prefs.t("billing.tokens")}</Text>
                </View>
              </View>
            )) : (
              <EmptyHint icon="chatbubbles-outline" iconColor={emptyIconColor} text={prefs.t("usage.noChats")} />
            )}
            {recentChats.length > COLLAPSED_HISTORY_COUNT ? (
              <ExpandRow expanded={chatsExpanded} total={recentChats.length} onPress={() => setChatsExpanded((value) => !value)} tint={primaryIconColor} />
            ) : null}
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

function ExpandRow({ expanded, onPress, tint, total }: { expanded: boolean; onPress: () => void; tint: string; total: number }) {
  return (
    <Pressable onPress={onPress} style={styles.usageExpandRow}>
      <Text style={styles.usageExpandText}>{expanded ? "Show less" : `Show all ${total}`}</Text>
      <Ionicons name={expanded ? "chevron-up" : "chevron-down"} color={tint} size={16} />
    </Pressable>
  );
}

function EmptyHint({ icon, iconColor, text }: { icon: keyof typeof Ionicons.glyphMap; iconColor: string; text: string }) {
  return (
    <View style={styles.usageEmptyBlock}>
      <Ionicons name={icon} color={iconColor} size={22} />
      <Text style={styles.usageEmptyText}>{text}</Text>
    </View>
  );
}

function threadTokenUsage(thread: ChatMessage[]) {
  const billed = thread.filter((message) => typeof message.creditCost === "number");
  if (billed.length > 0) {
    return billed.reduce((total, message) => total + (message.creditCost ?? 0), 0);
  }
  return estimateThreadTokens(thread);
}

function estimateThreadTokens(thread: ChatMessage[]) {
  const chars = thread.reduce((total, message) => total + (message.text?.length ?? 0), 0);
  return Math.max(1, Math.ceil(chars / 4));
}
