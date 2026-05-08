import React from "react";
import { Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { colors } from "../../../../styles/theme";
import { useAppContext } from "../../../../context/AppContext";
import { styles } from "../../styles";
import { ProfileSheet } from "./ProfileSheet";
import { formatPlanLabel } from "../index";

export function UsageSheet({ visible, onClose, onUpgrade }: {
  visible: boolean;
  onClose: () => void;
  onUpgrade: () => void;
}) {
  const app = useAppContext();
  const allowance = Math.max(app.creditsBalance + app.creditsUsed, 1);
  const usedPercent = Math.min(100, Math.round((app.creditsUsed / allowance) * 100));
  const planLabel = formatPlanLabel(app.accountPlan);
  const projectCount = app.projects.length;
  const onFree = app.accountPlan === "free";

  return (
    <ProfileSheet visible={visible} onClose={onClose} icon="time-outline" kicker="Usage & history" title="Your activity">
      <View style={[styles.profileToggleRow, { flexDirection: "column", alignItems: "stretch", gap: 8 }]}>
        <Text style={styles.profileSheetMuted}>Tokens used this cycle</Text>
        <Text style={[styles.profileSheetTitle, { fontSize: 22 }]}>
          {app.creditsUsed.toLocaleString()} / {allowance.toLocaleString()}
        </Text>
        <View style={{ backgroundColor: "rgba(139, 53, 255, 0.24)", borderRadius: 999, height: 8, overflow: "hidden" }}>
          <LinearGradient
            colors={["#7E3CFF", "#C259FF"]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={{ height: 8, width: `${usedPercent}%` }}
          />
        </View>
      </View>

      <Stat icon="folder-open-outline" title="Projects" subtitle={`${projectCount} saved workspace${projectCount === 1 ? "" : "s"}`} />
      <Stat icon="sparkles-outline" title="Active model" subtitle={app.selectedModel} />
      <Stat icon="diamond-outline" title={planLabel} subtitle={onFree ? "Upgrade for higher token allowance" : "Renews automatically every month"} />

      <Pressable onPress={onUpgrade} style={styles.profileSheetPrimary}>
        <Ionicons name="rocket-outline" color={colors.text} size={18} />
        <Text style={styles.profileSheetPrimaryText}>{onFree ? "Upgrade plan" : "Manage plan"}</Text>
      </Pressable>
    </ProfileSheet>
  );
}

function Stat({ icon, title, subtitle }: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
}) {
  return (
    <View style={styles.profileToggleRow}>
      <View style={styles.profileToggleIcon}><Ionicons name={icon} color="#C259FF" size={20} /></View>
      <View style={styles.profileToggleCopy}>
        <Text style={styles.profileToggleTitle}>{title}</Text>
        <Text style={styles.profileToggleSubtitle}>{subtitle}</Text>
      </View>
    </View>
  );
}
