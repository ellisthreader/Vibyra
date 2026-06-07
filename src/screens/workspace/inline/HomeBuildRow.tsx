import React, { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { Agent } from "../../../types/domain";
import { styles } from "../styles";

export function HomeBuildRow({ index = 0, item, onCompleteExit, onOpenBuildChat }: {
  index?: number;
  item: { agent: Agent; projectName: string };
  onCompleteExit?: (agentId: string) => void;
  onOpenBuildChat: (chatProjectId: string) => void;
}) {
  const queued = item.agent.state === "waiting";
  const complete = item.agent.state === "complete";
  const statusLabel = complete ? "Done" : queued ? "Queued" : "Building";
  const meta = complete ? (item.agent.title || "Build completed") : queued ? "Waiting for the next available run" : (item.agent.file || item.agent.title || "Working");
  const startedAtRef = useRef(item.agent.startedAt ?? Date.now());
  const startedAt = item.agent.startedAt ?? startedAtRef.current;
  const completedAt = item.agent.completedAt;
  const [now, setNow] = useState(Date.now());
  const entrance = useRef(new Animated.Value(0)).current;
  const flyAway = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  const elapsedLabel = useMemo(() => formatElapsed((completedAt ?? now) - startedAt), [completedAt, now, startedAt]);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    Animated.timing(entrance, {
      toValue: 1,
      duration: 360,
      delay: Math.min(index * 55, 220),
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true
    }).start();
  }, [entrance, index]);

  useEffect(() => {
    if (!complete) return;
    const animation = Animated.sequence([
      Animated.delay(700),
      Animated.timing(flyAway, {
        toValue: 1,
        duration: 950,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true
      })
    ]);
    animation.start(({ finished }) => {
      if (finished) onCompleteExit?.(item.agent.id);
    });
    return () => animation.stop();
  }, [complete, flyAway, item.agent.id, onCompleteExit]);

  useEffect(() => {
    if (queued) return;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true })
    ]));
    loop.start();
    return () => loop.stop();
  }, [pulse, queued]);

  const opacity = complete ? flyAway.interpolate({ inputRange: [0, 0.72, 1], outputRange: [1, 0.9, 0] }) : entrance;
  const translateY = complete
    ? flyAway.interpolate({ inputRange: [0, 1], outputRange: [0, -280] })
    : entrance.interpolate({ inputRange: [0, 1], outputRange: [10, 0] });
  const scale = complete ? flyAway.interpolate({ inputRange: [0, 0.4, 1], outputRange: [1, 1.015, 0.92] }) : 1;
  const pulseOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] });
  const blockA = pulse.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.35, 1, 0.35] });
  const blockB = pulse.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.75, 0.35, 0.75] });
  const blockC = pulse.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.45, 0.85, 0.45] });
  const successGlow = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.08, 0.22] });

  return (
    <Animated.View style={[complete ? styles.buildRowFlyLayer : null, { opacity, transform: [{ translateY }, { scale }] }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open chat for ${item.projectName}`}
        onPress={() => onOpenBuildChat(item.agent.chatProjectId ?? item.agent.projectId)}
        style={({ pressed }) => [
          styles.buildRow,
          queued ? styles.buildRowQueued : null,
          complete ? styles.buildRowComplete : null,
          pressed ? styles.buildRowPressed : null
        ]}
      >
        {complete ? <Animated.View style={[styles.buildSuccessEdge, { opacity: successGlow }]} /> : null}
        <View style={[styles.buildRowIcon, queued ? styles.buildRowIconQueued : complete ? styles.buildRowIconComplete : null]}>
          <Animated.View style={[styles.buildRowLiveDot, queued ? styles.buildRowLiveDotQueued : complete ? styles.buildRowLiveDotComplete : { opacity: pulseOpacity }]} />
          <Ionicons
            name={complete ? "checkmark" : queued ? "time-outline" : "code-slash-outline"}
            size={18}
            color={complete ? "#8EF0B2" : queued ? "#8CC8FF" : "#BFA7FF"}
          />
        </View>
        <View style={styles.buildRowCopy}>
          <View style={styles.buildRowTitleLine}>
            <Text numberOfLines={1} style={styles.buildRowName}>{item.projectName}</Text>
          </View>
          <Text numberOfLines={1} style={styles.buildRowMeta}>{meta}</Text>
          {queued || complete ? null : (
            <View style={styles.buildActivityStrip}>
              <Animated.View style={[styles.buildActivityBlock, { opacity: blockA }]} />
              <Animated.View style={[styles.buildActivityBlock, styles.buildActivityBlockWide, { opacity: blockB }]} />
              <Animated.View style={[styles.buildActivityBlock, { opacity: blockC }]} />
            </View>
          )}
        </View>
        <View style={styles.buildRowAside}>
          <View style={[styles.buildStatusPill, queued ? styles.buildStatusPillQueued : complete ? styles.buildStatusPillComplete : null]}>
            <Text style={[styles.buildStatusText, queued ? styles.buildStatusTextQueued : complete ? styles.buildStatusTextComplete : null]}>{statusLabel}</Text>
          </View>
          <Text style={[styles.buildTimerText, complete ? styles.buildTimerTextComplete : null]}>{elapsedLabel}</Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

function formatElapsed(value: number) {
  const minutes = Math.max(0, Math.floor(value / 60000));
  return `${minutes}m`;
}
