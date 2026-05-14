import React from "react";
import { View, Text } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import type { Agent } from "../../../types/domain";
import { usePreferences } from "../../../context/PreferencesContext";
import { styles } from "../styles";

export function HomeBuildCard({ item }: {
  item: {
    agent: Agent;
    projectName: string;
  };
}) {
  const prefs = usePreferences();
  const queued = item.agent.state === "waiting";
  const progress = queued ? 0 : Math.max(0, Math.min(item.agent.progress, 100));
  const detail = queued
    ? "Waiting for build capacity"
    : item.agent.file || item.agent.model || "Build active";
  const beamGradient = queued
    ? (prefs.effectiveScheme === "light" ? ["rgba(138, 144, 160, 0.55)", "rgba(138, 144, 160, 0.55)"] as const : ["rgba(60, 64, 82, 0.9)", "rgba(60, 64, 82, 0.9)"] as const)
    : (prefs.effectiveScheme === "light" ? ["#7C3AED", "#C026D3"] as const : ["#8F3DFF", "#F0A8FF"] as const);
  return (
    <View style={[styles.runningProjectCard, queued ? styles.runningProjectCardWaiting : styles.runningProjectCardRunning]}>
      <View style={styles.runningProjectTop}>
        <View style={styles.runningProjectCopy}>
          <Text numberOfLines={1} style={styles.runningProjectName}>{item.projectName}</Text>
          <Text numberOfLines={1} style={styles.runningProjectTask}>{item.agent.title}</Text>
          <View style={styles.runningProjectMetaRow}>
            <View style={[styles.runningProjectMetaDot, queued ? styles.runningProjectMetaDotQueued : null]} />
            <Text style={[styles.runningProjectMetaText, queued ? styles.runningProjectMetaTextQueued : null]}>
              {queued ? "Queued" : `${progress}% complete`}
            </Text>
            <Text style={styles.runningProjectMetaSep}>•</Text>
            <Text numberOfLines={1} style={styles.runningProjectMetaMuted}>{detail}</Text>
          </View>
        </View>
      </View>
      <View style={styles.runningProjectBottom}>
        <View style={styles.runningProjectBeamTrack}>
          <LinearGradient
            colors={beamGradient}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={[styles.runningProjectBeamFill, { width: queued ? "0%" : `${Math.max(8, progress)}%` }]}
          />
        </View>
        {queued ? null : <Text style={styles.runningProjectPercent}>{progress}%</Text>}
      </View>
    </View>
  );
}
