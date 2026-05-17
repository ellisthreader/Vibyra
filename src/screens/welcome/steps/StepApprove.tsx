import React from "react";
import { Animated, Text, View } from "react-native";
import { useAppContext } from "../../../context/AppContext";
import { HandshakeGlyph } from "../components/HandshakeGlyph";
import { PrimaryButton } from "../components/PrimaryButton";
import { welcomeCopy } from "../data/welcomeCopy";
import { useEntrance } from "../hooks/useEntrance";
import { WelcomeFlow } from "../types";
import { styles } from "../styles";

export function StepApprove({ flow: _flow }: { flow: WelcomeFlow }) {
  const app = useAppContext();
  const entrance = useEntrance("approve");
  const ready = Boolean(app.pendingPhoneApproval);
  const onConfirm = () => app.confirmPhonePermission();

  return (
    <Animated.View style={[styles.approvalStep, { opacity: entrance.opacity, transform: [{ translateY: entrance.translateY }] }]}>
      <View style={[styles.header, { marginTop: 12 }]}>
        <Text style={styles.eyebrow}>{welcomeCopy.approve.eyebrow}</Text>
        <Text style={styles.title}>{welcomeCopy.approve.title}</Text>
        <Text style={styles.body1}>{welcomeCopy.approve.body}</Text>
      </View>
      <HandshakeGlyph awaiting={ready} />
      {ready ? (
        <View style={styles.approvalAction}>
          <PrimaryButton iconName="checkmark-circle" label={welcomeCopy.approve.confirmCta} onPress={onConfirm} />
        </View>
      ) : (
        <Text style={styles.helpText}>{welcomeCopy.approve.waiting}</Text>
      )}
      {app.pairingError ? <Text style={styles.errorText}>{app.pairingError}</Text> : null}
    </Animated.View>
  );
}
