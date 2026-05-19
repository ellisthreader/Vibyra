import React, { useEffect, useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { styles } from "../../styles";
import type { LevelMapNode, LevelProgress } from "../../../../utils/appApi";
import { levelRankFor, levelRankUnlockFor } from "./levelTitles";

export function ProfileLevelProgressModal({ formatNumber, level, levelMap, levelPercent, nextReward, onClose, visible }: {
  formatNumber: (value: number) => string;
  level: LevelProgress;
  levelMap: LevelMapNode[];
  levelPercent: number;
  nextReward: string;
  onClose: () => void;
  visible: boolean;
}) {
  const [helpOpen, setHelpOpen] = useState(false);
  const [fullMapOpen, setFullMapOpen] = useState(false);
  const insets = useSafeAreaInsets();
  const mapWindow = useMemo(() => getLevelMapWindow(levelMap, level.level, 6), [level.level, levelMap]);
  const visibleLevelMap = fullMapOpen ? levelMap : mapWindow.nodes;
  const hiddenLevelCount = Math.max(0, levelMap.length - visibleLevelMap.length);
  const currentRank = levelRankFor(level.level);

  useEffect(() => {
    if (!visible) {
      setFullMapOpen(false);
      setHelpOpen(false);
    }
  }, [visible]);

  return (
    <Modal animationType="slide" onRequestClose={onClose} presentationStyle="fullScreen" visible={visible}>
      <View style={styles.billingScreen}>
        <View style={[styles.billingHeader, { paddingTop: Math.max(insets.top + 10, 24) }]}>
          <Pressable accessibilityLabel="Back" onPress={onClose} style={styles.billingHeaderBack}>
            <Ionicons name="arrow-back" color="#FFFFFF" size={24} />
          </Pressable>
          <Text style={styles.billingHeaderTitle}>Level map</Text>
          <Pressable accessibilityLabel="How leveling works" onPress={() => setHelpOpen((value) => !value)} style={styles.profileLevelHelpButton}>
            <Ionicons name="help-circle-outline" color="#DDBBFF" size={20} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.profileLevelModalContent} showsVerticalScrollIndicator={false}>
          <View style={styles.profileLevelModalHero}>
            <Text style={styles.profileLevelModalKicker}>Current level</Text>
            <Text style={styles.profileLevelModalTitle}>Level {level.level}</Text>
            <Text style={styles.profileLevelModalRank}>{currentRank.name}</Text>
            <Text style={styles.profileLevelModalMeta}>{formatNumber(level.currentLevelXp)} / {formatNumber(level.nextLevelXp)} XP to next level</Text>
            <View style={styles.profileLevelTrack}>
              <View style={[styles.profileLevelFill, { width: `${Math.max(levelPercent, 3)}%` }]} />
            </View>
            <Text style={styles.profileLevelModalRewardText}>{nextReward}</Text>
          </View>
          <View style={styles.profileLevelMap}>
            {visibleLevelMap.map((node) => (
              <LevelMapRow
                key={`${node.level}-${node.xpTotalRequired}`}
                node={node}
                formatNumber={formatNumber}
              />
            ))}
            {hiddenLevelCount > 0 ? (
              <View style={styles.profileLevelMapFooter}>
                <Text style={styles.profileLevelMapFooterText}>{hiddenLevelCount} more levels hidden</Text>
                <Pressable accessibilityLabel="Expand full level map" onPress={() => setFullMapOpen(true)} style={styles.profileLevelMapToggle}>
                  <Text style={styles.profileLevelMapToggleText}>Show full map</Text>
                  <Ionicons name="chevron-down" color="#EDE9FF" size={15} />
                </Pressable>
              </View>
            ) : levelMap.length > mapWindow.nodes.length ? (
              <Pressable accessibilityLabel="Collapse level map" onPress={() => setFullMapOpen(false)} style={styles.profileLevelMapCollapse}>
                <Text style={styles.profileLevelMapToggleText}>Show nearby levels</Text>
                <Ionicons name="chevron-up" color="#EDE9FF" size={15} />
              </Pressable>
            ) : null}
          </View>
          <Pressable accessibilityLabel="How XP works" onPress={() => setHelpOpen((value) => !value)} style={styles.profileLevelHelpPanel}>
            <View style={styles.profileLevelHelpRow}>
              <Text style={styles.profileLevelHelpTitle}>How XP works</Text>
              <Ionicons name={helpOpen ? "chevron-up" : "chevron-down"} color="#DDBBFF" size={17} />
            </View>
            {helpOpen ? <LevelHelpPanel /> : null}
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  );
}

function LevelHelpPanel() {
  const rows = [
    "Daily app use adds bonus XP.",
    "Prompts, chats, and completed builds add XP.",
    "Milestone levels can unlock credit rewards."
  ];

  return (
    <View style={styles.profileLevelHelpBody}>
      {rows.map((text) => (
        <View key={text} style={styles.profileLevelHelpBulletRow}>
          <View style={styles.profileLevelHelpBullet} />
          <Text style={styles.profileLevelHelpText}>{text}</Text>
        </View>
      ))}
    </View>
  );
}

function getLevelMapWindow(levelMap: LevelMapNode[], currentLevel: number, size: number) {
  if (levelMap.length <= size) return { nodes: levelMap };

  const currentIndex = Math.max(0, levelMap.findIndex((node) => node.level === currentLevel));
  const start = Math.max(0, Math.min(currentIndex - 2, levelMap.length - size));
  return { nodes: levelMap.slice(start, start + size) };
}

function LevelMapRow({ formatNumber, node }: { formatNumber: (value: number) => string; node: LevelMapNode }) {
  const current = node.status === "current";
  const complete = node.status === "complete";
  const icon = complete ? "checkmark" : current ? "radio-button-on" : "lock-closed";
  const tint = complete ? "#56E6A5" : current ? "#F2E9FF" : "#8E89A3";
  const rankUnlock = levelRankUnlockFor(node.level);

  return (
    <View style={[styles.profileLevelMapRow, current ? styles.profileLevelMapRowCurrent : null]}>
      <View style={[
        styles.profileLevelMapNode,
        complete ? styles.profileLevelMapNodeComplete : null,
        current ? styles.profileLevelMapNodeCurrent : null
      ]}>
        <Ionicons name={icon} color={current || complete ? "#090912" : tint} size={12} />
      </View>
      <View style={styles.profileLevelMapBody}>
        <Text style={[styles.profileLevelMapTitle, current ? styles.profileLevelMapTitleCurrent : null]}>Level {node.level}</Text>
        {rankUnlock ? <Text style={styles.profileLevelMapRank} numberOfLines={1}>{rankUnlock.name}</Text> : null}
        <Text style={styles.profileLevelMapMeta}>{formatNumber(node.xpTotalRequired)} XP needed</Text>
      </View>
      {node.rewardCredits > 0 ? (
        <View style={styles.profileLevelMapReward}>
          <Ionicons name="gift-outline" color="#C259FF" size={11} />
          <Text style={styles.profileLevelMapRewardText}>Reward</Text>
        </View>
      ) : null}
    </View>
  );
}
