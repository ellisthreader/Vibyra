import React, { useMemo, useState } from "react";
import { Alert, Image, Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useAppContext } from "../../../../context/AppContext";
import { usePreferences, useThemedColor } from "../../../../context/PreferencesContext";
import { styles } from "../../styles";
import { formatPlanLabel } from "../index";
import type { LevelMapNode } from "../../../../utils/appApi";
import { ProfileLevelProgressModal } from "./ProfileLevelProgressModal";

export function ProfileHero({ onOpenBilling }: {
  onOpenBilling: () => void;
}) {
  const app = useAppContext();
  const prefs = usePreferences();
  const [levelModalVisible, setLevelModalVisible] = useState(false);
  const editIconColor = useThemedColor("#E8E2F7");
  const profileName = app.authName.trim() || "Not signed in";
  const profileEmail = app.authEmail || "Sign in to sync account data";
  const profileInitial = profileName.charAt(0).toUpperCase() || "V";
  const planLabel = formatPlanLabel(app.accountPlan);
  const level = app.levelProgress ?? {
    currentLevelXp: 0,
    level: 1,
    map: fallbackLevelMap(1),
    nextLevelXp: 120,
    nextReward: { level: 2, credits: 5 },
    progress: 0,
    xpTotal: 0
  };
  const levelMap = useMemo(() => level.map?.length ? level.map : fallbackLevelMap(level.level), [level]);
  const levelPercent = Math.max(0, Math.min(100, Math.round(level.progress * 100)));
  const nextReward = level.nextReward
    ? `Reward at level ${level.nextReward.level}`
    : "Top level rewards claimed";

  async function changeProfilePicture() {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert("Photo access needed", "Allow photo library access to set a profile picture.");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        allowsEditing: true,
        aspect: [1, 1],
        mediaTypes: ["images"],
        quality: 0.72,
        selectionLimit: 1
      });

      if (result.canceled) return;
      const uri = result.assets[0]?.uri;
      if (!uri) {
        Alert.alert("Image unavailable", "That image could not be used as a profile picture.");
        return;
      }

      app.updateProfile({ profileImageUri: uri });
    } catch {
      Alert.alert("Image unavailable", "That image could not be used as a profile picture.");
    }
  }

  return (
    <View style={styles.profileHeroCard}>
      <View style={styles.profileHeroTop}>
        <View style={styles.profileAvatarWrap}>
          <View style={styles.profileAvatarLarge}>
            {app.profileImageUri ? (
              <Image source={{ uri: app.profileImageUri }} style={styles.profileAvatarImage} />
            ) : (
              <Text style={styles.profileAvatarLargeText}>{profileInitial}</Text>
            )}
          </View>
          <Pressable
            accessibilityLabel="Change profile picture"
            hitSlop={12}
            onPress={changeProfilePicture}
            style={styles.profileAvatarEditButton}
          >
            <Ionicons name="image-outline" color={editIconColor} size={18} />
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

      <View style={styles.profileLevelShell}>
        <View style={styles.profileLevelPanel}>
          <View style={styles.profileLevelTop}>
            <Ionicons name="sparkles" color="#C259FF" size={20} />
            <View style={styles.profileLevelCopy}>
              <Text style={styles.profileLevelTitle}>Level {level.level}</Text>
              <Text style={styles.profileLevelMeta}>
                {prefs.formatNumber(level.currentLevelXp)} / {prefs.formatNumber(level.nextLevelXp)} XP
              </Text>
            </View>
          </View>
          <View style={styles.profileLevelTrack}>
            <View style={[styles.profileLevelFill, { width: `${Math.max(levelPercent, 3)}%` }]} />
          </View>
        </View>
        <Pressable
          accessibilityLabel="Open level map"
          onPress={() => setLevelModalVisible(true)}
          style={styles.profileLevelExpandRail}
        >
          <Ionicons name="map-outline" color="#EDE9FF" size={18} />
        </Pressable>
      </View>
      <ProfileLevelProgressModal
        dailyCap={level.dailyXpCap ?? 500}
        formatNumber={prefs.formatNumber}
        level={level}
        levelMap={levelMap}
        levelPercent={levelPercent}
        nextReward={nextReward}
        onClose={() => setLevelModalVisible(false)}
        visible={levelModalVisible}
      />
    </View>
  );
}

function fallbackLevelMap(currentLevel: number): LevelMapNode[] {
  const rewards: Record<number, number> = { 2: 5, 3: 10, 5: 25, 8: 50, 13: 100, 20: 150, 30: 250, 40: 350, 50: 500, 60: 650, 75: 800, 100: 1000 };
  const end = Math.max(100, currentLevel + 10);

  return Array.from({ length: end }, (_, index) => {
    const level = index + 1;
    return {
      level,
      rewardCredits: rewards[level] ?? 0,
      status: level < currentLevel ? "complete" : level === currentLevel ? "current" : "locked",
      xpTotalRequired: 120 * Math.max(0, level - 1) * Math.max(0, level - 1)
    };
  });
}
