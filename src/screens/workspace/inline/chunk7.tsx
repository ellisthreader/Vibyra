import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../../../styles/theme";
import { useThemedColor } from "../../../context/PreferencesContext";
import type { Agent } from "../../../types/domain";
import { buildExamplePrompts } from "../data/pages";
import { styles } from "../styles";
import { HomeBuildRow } from "./HomeBuildRow";

type BuildItem = {
  agent: Agent;
  projectName: string;
};

export function RunningProjectsPanel({ onCreateBuild, onOpenBuildChat, onUsePrompt, runningProjects }: {
  onCreateBuild: () => void;
  onOpenBuildChat: (chatProjectId: string) => void;
  onUsePrompt: (prompt: string) => void;
  runningProjects: BuildItem[];
}) {
  const accentColor = useThemedColor(colors.accent);
  const dimColor = useThemedColor(colors.dim);
  const [hiddenCompleteIds, setHiddenCompleteIds] = useState<Record<string, true>>({});
  const running = runningProjects.filter((item) => item.agent.state === "running");
  const queued = runningProjects.filter((item) => item.agent.state === "waiting");
  const complete = runningProjects.filter((item) => item.agent.state === "complete" && !hiddenCompleteIds[item.agent.id]);
  const active = [...running, ...complete];
  const visibleRunning = active.slice(0, 4);
  const visibleQueued = queued.slice(0, 4);
  const hiddenRunningCount = active.length - visibleRunning.length;
  const hiddenQueuedCount = queued.length - visibleQueued.length;

  if (active.length === 0 && queued.length === 0) {
    return (
      <View style={[styles.runningProjectsPanel, styles.runningProjectsPanelEmpty]}>
        <View style={styles.buildEmpty}>
          <View style={styles.buildEmptyHeader}>
            <View style={styles.buildEmptyStatus}>
              <View style={styles.buildEmptyStatusDot} />
              <Text style={styles.buildEmptyStatusText}>Ready to build</Text>
            </View>
            <Text style={styles.buildEmptyTitle}>Start a build</Text>
            <Text style={styles.buildEmptyText}>Describe the app. Vibyra builds it on your desktop and opens the preview.</Text>
          </View>
          <Pressable onPress={onCreateBuild} style={({ pressed }) => [styles.buildEmptyPrimary, pressed ? styles.buildExampleChipPressed : null]}>
            <Text style={styles.buildEmptyPrimaryText}>Describe your app</Text>
            <View style={styles.buildEmptyPrimaryIcon}>
              <Ionicons name="arrow-forward" size={17} color={colors.text} />
            </View>
          </Pressable>
          <View style={styles.buildExampleList}>
            {buildExamplePrompts.map((example) => (
              <Pressable
                key={example.label}
                onPress={() => onUsePrompt(example.prompt)}
                style={({ pressed }) => [styles.buildExampleChip, pressed ? styles.buildExampleChipPressed : null]}
              >
                <View style={styles.buildExampleIcon}>
                  <Ionicons name={example.icon} size={20} color={accentColor} />
                </View>
                <Text style={styles.buildExampleLabel}>{example.label}</Text>
                <Ionicons name="arrow-forward" size={16} color={dimColor} />
              </Pressable>
            ))}
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.runningProjectsPanel}>
      <BuildSection
        count={active.length}
        hiddenCount={hiddenRunningCount}
        items={visibleRunning}
        onCompleteExit={(id) => setHiddenCompleteIds((current) => ({ ...current, [id]: true }))}
        onOpenBuildChat={onOpenBuildChat}
        title="Building now"
      />
      <BuildSection
        count={queued.length}
        hiddenCount={hiddenQueuedCount}
        items={visibleQueued}
        onOpenBuildChat={onOpenBuildChat}
        title="Queued"
      />
    </View>
  );
}

function BuildSection({ count, hiddenCount, items, onCompleteExit, onOpenBuildChat, title }: {
  count: number;
  hiddenCount: number;
  items: BuildItem[];
  onCompleteExit?: (agentId: string) => void;
  onOpenBuildChat: (chatProjectId: string) => void;
  title: string;
}) {
  if (items.length === 0) return null;
  return (
    <View style={styles.buildSection}>
      <View style={styles.buildSectionHeader}>
        <Text style={styles.buildSectionTitle}>{title}</Text>
        <Text style={styles.buildSectionCount}>{count}</Text>
      </View>
      <View style={styles.buildList}>
        {items.map((item, index) => (
          <HomeBuildRow index={index} key={item.agent.id} item={item} onCompleteExit={onCompleteExit} onOpenBuildChat={onOpenBuildChat} />
        ))}
        {hiddenCount > 0 ? <Text style={styles.buildMoreText}>{hiddenCount} more</Text> : null}
      </View>
    </View>
  );
}
