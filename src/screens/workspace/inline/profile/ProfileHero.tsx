import React from "react";
import { Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAppContext } from "../../../../context/AppContext";
import { usePreferences, useThemedColor } from "../../../../context/PreferencesContext";
import { styles } from "../../styles";
import { formatPlanLabel } from "../index";

export function ProfileHero({ onEdit, onOpenBilling, onOpenUsage }: {
  onEdit: () => void;
  onOpenBilling: () => void;
  onOpenUsage: () => void;
}) {
  const app = useAppContext();
  const prefs = usePreferences();
  const editIconColor = useThemedColor("#E8E2F7");
  const calendarIconColor = useThemedColor("#B8B3CB");
  const profileName = app.authName.trim() || "Vibyra User";
  const renewsAt = new Date();
  renewsAt.setDate(renewsAt.getDate() + 30);
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
            <Ionicons name="pencil-outline" color={editIconColor} size={18} />
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
            <Text style={styles.profileUsageValue}>{prefs.formatNumber(app.creditsBalance)}</Text>
            <Text style={styles.profileUsageLabel}>{prefs.t("profile.tokensRemaining")}</Text>
          </View>
        </Pressable>
        <View style={styles.profileUsageDivider} />
        <Pressable onPress={onOpenBilling} style={styles.profileUsageItem}>
          <View style={styles.profileUsageIcon}>
            <Ionicons name="calendar-clear-outline" color={calendarIconColor} size={25} />
          </View>
          <View>
            <Text style={styles.profileRenewMeta}>{onFree ? prefs.t("profile.currentPlan") : prefs.t("profile.renewsOn")}</Text>
            <Text style={styles.profileRenewDate}>{onFree ? prefs.t("profile.freeTrial") : prefs.formatDate(renewsAt)}</Text>
          </View>
        </Pressable>
      </View>
    </View>
  );
}
