import React, { useEffect, useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { styles } from "../../styles";
import type { LevelMapNode, LevelProgress } from "../../../../utils/appApi";

export function ProfileLevelProgressModal({ dailyCap, formatNumber, level, levelMap, levelPercent, nextReward, onClose, visible }: {
  dailyCap: number;
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
            <Ionicons name="help-circle-outline" color="#DDBBFF" size={21} />
          </Pressable>
          <View style={styles.profileLevelHeaderBadge}>
            <Ionicons name="sparkles" color="#C259FF" size={13} />
            <Text style={styles.profileLevelHeaderBadgeText}>Level {level.level}</Text>
          </View>
        </View>
        {helpOpen ? <LevelHelpPanel top={Math.max(insets.top + 62, 76)} /> : null}
        <ScrollView contentContainerStyle={styles.profileLevelModalContent} showsVerticalScrollIndicator={false}>
          <View style={styles.profileLevelModalHero}>
            <View style={styles.profileLevelModalHeroTop}>
              <View style={styles.profileLevelModalEmblem}>
                <Ionicons name="sparkles" color="#C259FF" size={28} />
              </View>
              <View style={styles.profileLevelCopy}>
                <Text style={styles.profileLevelModalKicker}>Current level</Text>
                <Text style={styles.profileLevelModalTitle}>Level {level.level}</Text>
                <Text style={styles.profileLevelModalMeta}>{formatNumber(level.currentLevelXp)} / {formatNumber(level.nextLevelXp)} XP to next level</Text>
              </View>
            </View>
            <View style={styles.profileLevelTrack}>
              <View style={[styles.profileLevelFill, { width: `${Math.max(levelPercent, 3)}%` }]} />
            </View>
            <View style={styles.profileLevelModalReward}>
              <Ionicons name="gift-outline" color="#C259FF" size={16} />
              <Text style={styles.profileLevelModalRewardText}>{nextReward}</Text>
            </View>
          </View>
          <View style={styles.profileLevelStatsRow}>
            <LevelStat icon="flame" label="Total XP" value={formatNumber(level.xpTotal)} />
            <LevelStat icon="trophy" label="Progress" value={`${levelPercent}%`} />
            <LevelStat icon="shield-checkmark" label="Daily cap" value={formatNumber(dailyCap)} />
          </View>
          <View style={styles.profileLevelMap}>
            {visibleLevelMap.map((node, index) => (
              <LevelMapRow
                key={`${node.level}-${node.xpTotalRequired}`}
                first={!fullMapOpen && mapWindow.startsAfterFirst && index === 0 ? false : index === 0}
                last={!fullMapOpen && mapWindow.endsBeforeLast && index === visibleLevelMap.length - 1 ? false : index === visibleLevelMap.length - 1}
                node={node}
                formatNumber={formatNumber}
              />
            ))}
            {hiddenLevelCount > 0 ? (
              <View style={styles.profileLevelMapFooter}>
                <Text style={styles.profileLevelMapFooterText}>{hiddenLevelCount} more levels hidden</Text>
                <Pressable accessibilityLabel="Expand full level map" onPress={() => setFullMapOpen(true)} style={styles.profileLevelMapToggle}>
                  <Ionicons name="chevron-down" color="#EDE9FF" size={15} />
                  <Text style={styles.profileLevelMapToggleText}>Show full map</Text>
                </Pressable>
              </View>
            ) : levelMap.length > mapWindow.nodes.length ? (
              <Pressable accessibilityLabel="Collapse level map" onPress={() => setFullMapOpen(false)} style={styles.profileLevelMapCollapse}>
                <Ionicons name="chevron-up" color="#EDE9FF" size={15} />
                <Text style={styles.profileLevelMapToggleText}>Show 6 levels</Text>
              </Pressable>
            ) : null}
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

function LevelHelpPanel({ top }: { top: number }) {
  const rows: Array<{ icon: keyof typeof Ionicons.glyphMap; title: string; text: string }> = [
    { icon: "calendar-clear-outline", title: "Daily login", text: "Open Vibyra each day for bonus XP." },
    { icon: "terminal-outline", title: "Build with AI", text: "Prompts, chats, and completed desktop runs add XP." },
    { icon: "chatbubbles-outline", title: "Community", text: "Likes, comments, posts, and app opens help you level up." },
    { icon: "gift-outline", title: "Rewards", text: "Milestone levels unlock rewards shown on the roadmap." }
  ];

  return (
    <View style={[styles.profileLevelHelpPanel, { top }]}>
      {rows.map((row) => (
        <View key={row.title} style={styles.profileLevelHelpRow}>
          <View style={styles.profileLevelHelpIcon}>
            <Ionicons name={row.icon} color="#C259FF" size={15} />
          </View>
          <View style={styles.profileLevelCopy}>
            <Text style={styles.profileLevelHelpTitle}>{row.title}</Text>
            <Text style={styles.profileLevelHelpText}>{row.text}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

function getLevelMapWindow(levelMap: LevelMapNode[], currentLevel: number, size: number) {
  if (levelMap.length <= size) {
    return { endsBeforeLast: false, nodes: levelMap, startsAfterFirst: false };
  }

  const currentIndex = Math.max(0, levelMap.findIndex((node) => node.level === currentLevel));
  const start = Math.max(0, Math.min(currentIndex - 2, levelMap.length - size));
  const end = start + size;

  return {
    endsBeforeLast: end < levelMap.length,
    nodes: levelMap.slice(start, end),
    startsAfterFirst: start > 0
  };
}

function LevelStat({ icon, label, value }: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.profileLevelStat}>
      <Ionicons name={icon} color="#DDBBFF" size={15} />
      <Text style={styles.profileLevelStatValue}>{value}</Text>
      <Text style={styles.profileLevelStatLabel}>{label}</Text>
    </View>
  );
}

function LevelMapRow({ first, formatNumber, last, node }: {
  first: boolean;
  formatNumber: (value: number) => string;
  last: boolean;
  node: LevelMapNode;
}) {
  const current = node.status === "current";
  const complete = node.status === "complete";
  const icon = complete ? "checkmark" : current ? "radio-button-on" : "lock-closed";
  const tint = complete ? "#56E6A5" : current ? "#F23ACD" : "#8E89A3";

  return (
    <View style={styles.profileLevelMapRow}>
      <View style={styles.profileLevelMapRoute}>
        <View style={[styles.profileLevelMapLine, first ? styles.profileLevelMapLineHidden : null]} />
        <View style={[
          styles.profileLevelMapNode,
          complete ? styles.profileLevelMapNodeComplete : null,
          current ? styles.profileLevelMapNodeCurrent : null
        ]}>
          <Ionicons name={icon} color={current || complete ? "#090912" : tint} size={13} />
        </View>
        <View style={[styles.profileLevelMapLine, last ? styles.profileLevelMapLineHidden : null]} />
      </View>
      <View style={styles.profileLevelMapBody}>
        <Text style={[styles.profileLevelMapTitle, current ? styles.profileLevelMapTitleCurrent : null]}>Level {node.level}</Text>
        <Text style={styles.profileLevelMapMeta}>{formatNumber(node.xpTotalRequired)} XP needed</Text>
      </View>
      {node.rewardCredits > 0 ? (
        <View style={styles.profileLevelMapReward}>
          <Ionicons name="gift-outline" color="#C259FF" size={11} />
          <Text style={styles.profileLevelMapRewardText}>Reward</Text>
        </View>
      ) : (
        <Text style={styles.profileLevelMapNoReward}>XP</Text>
      )}
    </View>
  );
}
