import React, { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Pressable, StyleSheet, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { useAppContext } from "../../../context/AppContext";
import { usePreferences } from "../../../context/PreferencesContext";
import type { ChatMessage } from "../../../types/domain";
import { estimateChatContextUsage } from "./chatContextMeter";

const METER_SIZE = 28;
const METER_STROKE = 3;
const METER_RADIUS = (METER_SIZE - METER_STROKE) / 2;
const METER_CIRCUMFERENCE = 2 * Math.PI * METER_RADIUS;

export function ProjectMemoryBar({ chatMessages, projectId, taskText }: { chatMessages: ChatMessage[]; projectId?: string; taskText: string }) {
  const [open, setOpen] = useState(false);
  const app = useAppContext();
  const prefs = usePreferences();
  const slide = useRef(new Animated.Value(0)).current;
  const activeProjectId = projectId ?? "";
  const project = (activeProjectId ? app.chatProjects[activeProjectId] ?? app.projects.find((item) => item.id === activeProjectId) : null) ?? app.selectedProject;
  const projectMemory = activeProjectId ? app.projectMemories[activeProjectId] ?? app.projectMemories[project.id] : app.projectMemories[project.id];
  const projectBrief = (activeProjectId ? app.chatProjects[activeProjectId]?.brief ?? app.chatProjects[project.id]?.brief : null) ?? project.brief;
  const selectedFile = project.id === app.selectedProjectId && app.selectedFile?.id !== "empty" ? app.selectedFile : null;
  const tokenStats = useMemo(
    () => estimateChatContextUsage({
      chatMessages,
      chatSkills: app.chatSkills,
      connectionActive: Boolean(app.connection),
      files: project.id === app.selectedProjectId ? app.files : [],
      project,
      projectBrief,
      projectMemory,
      selectedFile,
      taskText
    }),
    [app.chatSkills, app.connection, app.files, app.selectedProjectId, chatMessages, project, projectBrief, projectMemory, selectedFile, taskText]
  );
  const palette = prefs.effectiveScheme === "light" ? lightPalette : darkPalette;
  const visualRatio = tokenStats.used > 0 ? Math.max(tokenStats.ratio, 0.012) : 0;
  const progressOffset = METER_CIRCUMFERENCE * (1 - visualRatio);

  useEffect(() => {
    Animated.timing(slide, { toValue: open ? 1 : 0, duration: 240, useNativeDriver: true }).start();
  }, [open, slide]);

  return (
    <View style={localStyles.shell}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Show context usage"
        hitSlop={10}
        onPress={() => setOpen((value) => !value)}
        style={({ pressed }) => [localStyles.trigger, pressed && localStyles.pressed]}
      >
        <Animated.Text
          pointerEvents="none"
          style={[
            localStyles.count,
            { color: palette.text },
            {
              opacity: slide,
              transform: [
                { translateX: slide.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) },
                { scale: slide.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) }
              ]
            }
          ]}
        >
          {formatTokens(tokenStats.used)}/{formatTokens(tokenStats.budget)}
        </Animated.Text>
        <View style={localStyles.meterWrap}>
          <Svg height={METER_SIZE} width={METER_SIZE} viewBox={`0 0 ${METER_SIZE} ${METER_SIZE}`}>
            <Circle
              cx={METER_SIZE / 2}
              cy={METER_SIZE / 2}
              fill="none"
              r={METER_RADIUS}
              stroke={palette.track}
              strokeWidth={METER_STROKE}
            />
            {visualRatio > 0 ? (
              <Circle
                cx={METER_SIZE / 2}
                cy={METER_SIZE / 2}
                fill="none"
                r={METER_RADIUS}
                stroke={palette.accent}
                strokeDasharray={`${METER_CIRCUMFERENCE} ${METER_CIRCUMFERENCE}`}
                strokeDashoffset={progressOffset}
                strokeLinecap="round"
                strokeWidth={METER_STROKE}
                transform={`rotate(-90 ${METER_SIZE / 2} ${METER_SIZE / 2})`}
              />
            ) : null}
          </Svg>
        </View>
      </Pressable>
    </View>
  );
}

function formatTokens(value: number) {
  if (value >= 1000) return (value / 1000).toFixed(value >= 10000 ? 0 : 1).replace(/\.0$/, "") + "K";
  return String(value);
}

const localStyles = StyleSheet.create({
  count: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0,
    lineHeight: 16,
    position: "absolute",
    right: METER_SIZE + 9
  },
  meterWrap: { height: METER_SIZE, width: METER_SIZE },
  pressed: { opacity: 0.74, transform: [{ scale: 0.96 }] },
  shell: { alignItems: "flex-end", marginTop: 4 },
  trigger: {
    alignItems: "center",
    alignSelf: "flex-end",
    flexDirection: "row",
    minHeight: 32,
    padding: 2,
    position: "relative",
    width: METER_SIZE + 4
  }
});

const darkPalette = {
  accent: "#8B5CFF",
  text: "#EAE6F8",
  track: "rgba(217, 204, 255, 0.18)"
};

const lightPalette = {
  accent: "#6D3BFF",
  text: "#312A46",
  track: "rgba(109, 59, 255, 0.16)"
};
