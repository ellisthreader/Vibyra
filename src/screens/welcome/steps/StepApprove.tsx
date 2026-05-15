import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import { Animated, Pressable, Text, View } from "react-native";
import { useAppContext } from "../../../context/AppContext";
import { colors } from "../../../styles/theme";
import { HandshakeGlyph } from "../components/HandshakeGlyph";
import { PrimaryButton } from "../components/PrimaryButton";
import { SkipPill } from "../components/SkipPill";
import { welcomeCopy } from "../data/welcomeCopy";
import { useEntrance } from "../hooks/useEntrance";
import { WelcomeFlow } from "../types";
import { styles } from "../styles";

export function StepApprove({ flow }: { flow: WelcomeFlow }) {
  const app = useAppContext();
  const entrance = useEntrance("approve");
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setTimedOut(true), 30_000);
    return () => clearTimeout(timer);
  }, []);

  const awaiting = Boolean(app.pendingPhoneApproval);
  const onConfirm = () => app.confirmPhonePermission();

  return (
    <Animated.View style={[{ flex: 1, opacity: entrance.opacity, transform: [{ translateY: entrance.translateY }], gap: 14 }]}>
      <SkipPill floating onPress={flow.requestSkip} />
      <View style={[styles.header, { marginTop: 12 }]}>
        <Text style={styles.eyebrow}>{welcomeCopy.approve.eyebrow}</Text>
        <Text style={styles.title}>{welcomeCopy.approve.title}</Text>
        <Text style={styles.body1}>{welcomeCopy.approve.body}</Text>
      </View>
      <HandshakeGlyph awaiting={awaiting} />
      {!awaiting ? <Text style={[styles.helpText, { color: "#D8BCFF" }]}>{welcomeCopy.approve.waiting}</Text> : null}
      {awaiting ? (
        <PrimaryButton iconName="checkmark-circle" label={welcomeCopy.approve.confirmCta} onPress={onConfirm} />
      ) : null}
      {timedOut && !awaiting ? (
        <View style={{ alignItems: "center", gap: 6 }}>
          <Text style={styles.helpText}>{welcomeCopy.approve.timeoutHelp}</Text>
          <Pressable accessibilityRole="button" hitSlop={8} onPress={flow.goToSetup} style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
            <Ionicons accessible={false} color={colors.magenta} name="refresh" size={16} />
            <Text style={[styles.searchingText, { color: colors.magenta }]}>{welcomeCopy.approve.timeoutRetry}</Text>
          </Pressable>
        </View>
      ) : null}
      {app.pairingError ? <Text style={styles.errorText}>{app.pairingError}</Text> : null}
    </Animated.View>
  );
}
