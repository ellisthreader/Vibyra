import React, { useEffect, useMemo, useState } from "react";
import { Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { ChatRunStatus } from "../../../types/domain";
import { styles } from "../styles";

export function AgentRunProgressText({ status }: { status: ChatRunStatus }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (status.status !== "running") return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [status.status]);

  const elapsedSeconds = Math.max(0, Math.floor(((status.completedAt ?? now) - status.startedAt) / 1000));
  const steps = useMemo(() => runSteps(status), [status.mode, status.route]);
  const activeIndex = Math.min(steps.length - 1, Math.floor(elapsedSeconds / 4));
  const title = activeIndex < 2 ? "Thinking" : "Working";
  const editActivity = (status.mode === "build" || status.activeFile) && activeIndex >= 2
    ? liveEditActivity(status.activeFile, elapsedSeconds)
    : null;

  return (
    <View style={styles.agentRunProgress}>
      <Text style={styles.agentRunProgressTitle}>{title} {formatElapsed(elapsedSeconds)}</Text>
      {steps.slice(0, activeIndex + 1).map((step) => (
        <Text key={step} style={styles.agentRunProgressLine}>- {step}</Text>
      ))}
      {editActivity ? (
        <View style={styles.agentRunEditCard}>
          <View style={styles.agentRunEditIcon}>
            <Ionicons name="code-slash-outline" color="#D7C4FF" size={15} />
          </View>
          <View style={styles.agentRunEditBody}>
            <Text style={styles.agentRunEditLabel}>Generating code</Text>
            <Text numberOfLines={1} style={styles.agentRunEditFile}>{editActivity.file}</Text>
          </View>
          <View style={styles.agentRunEditCounts}>
            <Text style={styles.agentRunEditAdd}>+{editActivity.additions}</Text>
            <Text style={styles.agentRunEditDel}>-{editActivity.deletions}</Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

function runSteps(status: ChatRunStatus) {
  const route = status.route === "desktop" ? "desktop agent" : "cloud model";
  return [
    "Reading your prompt and chat context",
    `Choosing the ${status.mode === "build" ? "build" : "chat"} path`,
    `Running the ${route}`,
    status.mode === "build" ? "Collecting files, preview, and changes" : "Preparing the answer",
    "Writing the response back into chat"
  ];
}

function formatElapsed(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

function liveEditActivity(activeFile: string | undefined, elapsedSeconds: number) {
  const active = Math.max(1, elapsedSeconds - 7);
  return {
    file: activeFile || "App.js",
    additions: Math.min(240, 8 + Math.floor(active * 3.5)),
    deletions: Math.min(80, Math.max(0, Math.floor((active - 3) * 1.4)))
  };
}
