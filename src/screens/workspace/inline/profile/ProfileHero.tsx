import React from "react";
import { Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAppContext } from "../../../../context/AppContext";
import { styles } from "../../styles";
import { formatPlanLabel } from "../index";

export function ProfileHero({ onEdit, onOpenBilling, onOpenUsage }: {
  onEdit: () => void;
  onOpenBilling: () => void;
  onOpenUsage: () => void;
}) {
  const app = useAppContext();
  const profileName = app.authName.trim() || "Vibyra User";
  const profileEmail = app.authEmail || "you@vibyra.app";
  const profileInitial = profileName.charAt(0).toUpperCase();
  const planLabel = formatPlanLabel(app.accountPlan);
  const onFree = app.accountPlan === "free";

  return (
    <View style={styles.profileHeroCard}>
      <View style={styles.profileHeroTop}>
        <View style={styles.profileAvatarWrap}>
          <View style={styles.profileAvatarLarge}>
            <Text style={styles.profileAvatarLargeText}>{profileInitial}</Text>
          </View>
          <Pressable accessibilityLabel="Edit profile" onPress={onEdit} style={styles.profileAvatarEditButton}>
            <Ionicons name="pencil-outline" color="#E8E2F7" size={18} />
          </Pressable>
        </View>
        <View style={styles.profileSummaryCopy}>
          <Text style={styles.profileSummaryName}>{profileName}</Text>
          <Text style={styles.profileSummaryEmail}>{profileEmail}</Text>
          <Pressable onPress={onOpenBilling} style={styles.profilePlanBadge}>
            <Ionicons name="diamond" color="#C259FF" size={16} />
            <Text style={styles.profilePlanBadgeText}>{planLabel}</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.profileDivider} />

      <View style={styles.profileUsageStrip}>
        <Pressable onPress={onOpenUsage} style={styles.profileUsageItem}>
          <View style={styles.profileUsageIcon}>
            <Ionicons name="flash" color="#C259FF" size={29} />
          </View>
          <View>
            <Text style={styles.profileUsageValue}>{app.creditsBalance.toLocaleString()}</Text>
            <Text style={styles.profileUsageLabel}>tokens remaining</Text>
          </View>
        </Pressable>
        <View style={styles.profileUsageDivider} />
        <Pressable onPress={onOpenBilling} style={styles.profileUsageItem}>
          <View style={styles.profileUsageIcon}>
            <Ionicons name="calendar-clear-outline" color="#B8B3CB" size={25} />
          </View>
          <View>
            <Text style={styles.profileRenewMeta}>{onFree ? "Current plan" : "Renews on"}</Text>
            <Text style={styles.profileRenewDate}>{onFree ? "Free trial" : "May 24, 2025"}</Text>
          </View>
        </Pressable>
      </View>
    </View>
  );
}
