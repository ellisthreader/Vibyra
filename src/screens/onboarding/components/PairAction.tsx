import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Pressable, Text, View } from "react-native";
import { PrimaryButton } from "../../../components/Buttons";
import { useAppContext } from "../../../context/AppContext";
import { colors } from "../../../styles/theme";
import { styles } from "../styles";

export function PairAction() {
  const app = useAppContext();
  if (!app.pendingPhoneApproval) {
    return (
      <Pressable style={({ pressed }) => [styles.connectSecondaryAction, pressed ? styles.connectActionPressed : null]} onPress={app.pairMachine}>
        <Ionicons name="link-outline" color={colors.text} size={18} />
        <Text style={styles.connectSecondaryActionText}>{app.pairing ? "Connecting..." : "Connect with code"}</Text>
      </Pressable>
    );
  }

  return (
    <View style={styles.connectApproval}>
      <Ionicons name="shield-checkmark-outline" color={colors.success} size={22} />
      <Text style={styles.connectApprovalTitle}>Allow {app.pendingPhoneApproval.machineName}?</Text>
      <Text style={styles.rowMeta}>
        Vibyra can show projects, receive prompts, run approved commands, and send live updates.
      </Text>
      <PrimaryButton icon="checkmark-circle-outline" label="Confirm on phone" onPress={app.confirmPhonePermission} />
    </View>
  );
}
