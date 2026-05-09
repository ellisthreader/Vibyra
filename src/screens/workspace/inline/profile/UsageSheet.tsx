import React, { useMemo } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useAppContext } from "../../../../context/AppContext";
import { usePreferences } from "../../../../context/PreferencesContext";
import { styles } from "../../styles";
import { formatPlanLabel } from "../index";

const SOURCE_ICON: Record<string, keyof typeof import("@expo/vector-icons").Ionicons.glyphMap> = {
  pc: "desktop-outline",
  desktop: "desktop-outline",
  mobile: "phone-portrait-outline"
};

export function UsageSheet({ visible, onClose, onUpgrade }: {
  visible: boolean;
  onClose: () => void;
  onUpgrade: () => void;
}) {
  const app = useAppContext();
  const prefs = usePreferences();
  const allowance = Math.max(app.creditsBalance + app.creditsUsed, 1);
  const usedPercent = Math.min(100, Math.round((app.creditsUsed / allowance) * 100));
  const planLabel = formatPlanLabel(app.accountPlan);
  const onFree = app.accountPlan === "free";

  const recentProjects = useMemo(
    () => [...app.projects].sort((a, b) => (b.updated || "").localeCompare(a.updated || "")).slice(0, 4),
    [app.projects]
  );

  const recentChats = useMemo(() => {
    const items: Array<{ projectId: string; projectName: string; preview: string; role: string; count: number }> = [];
    for (const project of app.projects) {
      const thread = app.chatThreads[project.id];
      if (!thread || thread.length === 0) continue;
      const last = thread[thread.length - 1];
      const title = app.chatTitles[project.id];
      items.push({
        projectId: project.id,
        projectName: title?.trim() || project.name,
        preview: (last.text || "").trim().slice(0, 80) || "(empty message)",
        role: last.role,
        count: thread.length
      });
    }
    return items.slice(0, 4);
  }, [app.projects, app.chatThreads, app.chatTitles]);

  return (
    <Modal animationType="slide" onRequestClose={onClose} presentationStyle="fullScreen" visible={visible}>
      <View style={styles.billingScreen}>
        <View style={styles.billingHeader}>
          <Pressable accessibilityLabel="Back" onPress={onClose} style={styles.billingHeaderBack}>
            <Ionicons name="arrow-back" color={prefs.effectiveScheme === "light" ? "#0A0814" : "#FFFFFF"} size={24} />
          </Pressable>
          <Text style={styles.billingHeaderTitle}>{prefs.t("usage.title")}</Text>
          <View style={styles.billingHeaderTokens}>
            <Ionicons name="flash" color="#FFD166" size={13} />
            <Text style={styles.billingHeaderTokensText}>{prefs.formatNumber(app.creditsBalance)} {prefs.t("billing.tokens")}</Text>
          </View>
        </View>

        <ScrollView contentContainerStyle={{ gap: 16, paddingBottom: 24, paddingHorizontal: 18 }} showsVerticalScrollIndicator={false}>
          <View style={styles.usageHeroCard}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
              <View>
                <Text style={styles.usageHeroKicker}>{prefs.t("usage.tokensThisCycle")}</Text>
                <View style={{ alignItems: "baseline", flexDirection: "row", gap: 6, marginTop: 4 }}>
                  <Text style={styles.usageHeroValue}>{prefs.formatNumber(app.creditsUsed)}</Text>
                  <Text style={styles.usageHeroDenom}>/ {prefs.formatNumber(allowance)}</Text>
                </View>
              </View>
              <View style={styles.usageHeroBadge}>
                <Text style={styles.usageHeroBadgeText}>{usedPercent}%</Text>
              </View>
            </View>
            <View style={styles.usageProgressTrack}>
              <LinearGradient
                colors={["#7E3CFF", "#C259FF", "#FFD166"]}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={[styles.usageProgressFill, { width: `${Math.max(usedPercent, 2)}%` }]}
              />
            </View>
            <Text style={styles.usageHeroFootnote}>{planLabel} · {prefs.t("usage.resetsMonthly")}</Text>
          </View>

          <View style={styles.usageStatsRow}>
            <StatTile icon="folder-open" tint="#7DA3FF" tintBg="rgba(120, 160, 255, 0.16)" value={app.projects.length} label={prefs.t("usage.projects")} />
            <StatTile icon="chatbubbles" tint="#C259FF" tintBg="rgba(194, 89, 255, 0.18)" value={recentChats.reduce((n, c) => n + c.count, 0)} label={prefs.t("usage.messages")} />
            <StatTile icon="diamond" tint="#FACC15" tintBg="rgba(250, 204, 21, 0.16)" value={planLabel.replace(" Plan", "")} label={prefs.t("profile.currentPlan")} />
          </View>

          <View>
            <View style={styles.usageSectionHeader}>
              <Text style={styles.usageSectionTitle}>{prefs.t("usage.recentProjects")}</Text>
              {recentProjects.length > 0 ? <Text style={styles.usageSectionMeta}>{recentProjects.length} of {app.projects.length}</Text> : null}
            </View>
            {recentProjects.length === 0 ? (
              <EmptyHint icon="folder-open-outline" text={prefs.t("usage.noProjects")} />
            ) : (
              <View style={styles.usageListCard}>
                {recentProjects.map((project, i) => (
                  <View key={project.id} style={[styles.usageListRow, i === recentProjects.length - 1 ? styles.usageListRowLast : null]}>
                    <View style={[styles.usageListIcon, { backgroundColor: "rgba(120, 160, 255, 0.16)" }]}>
                      <Ionicons name="folder" color="#7DA3FF" size={16} />
                    </View>
                    <View style={styles.usageListBody}>
                      <Text numberOfLines={1} style={styles.usageListTitle}>{project.name}</Text>
                      <Text numberOfLines={1} style={styles.usageListSub}>{project.stack || "Untitled stack"} · {project.updated || "just now"}</Text>
                    </View>
                    {project.source ? (
                      <View style={styles.usageListChip}>
                        <Ionicons name={SOURCE_ICON[project.source] ?? "globe-outline"} color="#9C97AE" size={12} />
                        <Text style={styles.usageListChipText}>{project.source}</Text>
                      </View>
                    ) : null}
                  </View>
                ))}
              </View>
            )}
          </View>

          <View>
            <View style={styles.usageSectionHeader}>
              <Text style={styles.usageSectionTitle}>{prefs.t("usage.recentChats")}</Text>
              {recentChats.length > 0 ? <Text style={styles.usageSectionMeta}>{recentChats.length} {prefs.t("usage.active")}</Text> : null}
            </View>
            {recentChats.length === 0 ? (
              <EmptyHint icon="chatbubbles-outline" text={prefs.t("usage.noChats")} />
            ) : (
              <View style={styles.usageListCard}>
                {recentChats.map((chat, i) => (
                  <View key={chat.projectId} style={[styles.usageListRow, i === recentChats.length - 1 ? styles.usageListRowLast : null]}>
                    <View style={[styles.usageListIcon, { backgroundColor: "rgba(194, 89, 255, 0.18)" }]}>
                      <Ionicons name={chat.role === "assistant" ? "sparkles" : "chatbubble-ellipses"} color="#C259FF" size={15} />
                    </View>
                    <View style={styles.usageListBody}>
                      <Text numberOfLines={1} style={styles.usageListTitle}>{chat.projectName}</Text>
                      <Text numberOfLines={1} style={styles.usageListSub}>{chat.preview}</Text>
                    </View>
                    <View style={styles.usageListChip}>
                      <Ionicons name="layers-outline" color="#9C97AE" size={12} />
                      <Text style={styles.usageListChipText}>{chat.count}</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>

          <Pressable onPress={onUpgrade} style={styles.usagePrimaryCta}>
            <Ionicons name={onFree ? "rocket" : "settings-outline"} color="#1A0E33" size={18} />
            <Text style={styles.usagePrimaryCtaText}>{onFree ? prefs.t("usage.upgradePlan") : prefs.t("usage.managePlan")}</Text>
            <Ionicons name="arrow-forward" color="#1A0E33" size={16} />
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  );
}

function StatTile({ icon, tint, tintBg, value, label }: {
  icon: keyof typeof Ionicons.glyphMap;
  tint: string;
  tintBg: string;
  value: number | string;
  label: string;
}) {
  return (
    <View style={styles.usageStatTile}>
      <View style={[styles.usageStatIcon, { backgroundColor: tintBg }]}>
        <Ionicons name={icon} color={tint} size={16} />
      </View>
      <Text numberOfLines={1} style={styles.usageStatValue}>{value}</Text>
      <Text style={styles.usageStatLabel}>{label}</Text>
    </View>
  );
}

function EmptyHint({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  return (
    <View style={styles.usageEmptyCard}>
      <Ionicons name={icon} color="#5C5870" size={22} />
      <Text style={styles.usageEmptyText}>{text}</Text>
    </View>
  );
}
