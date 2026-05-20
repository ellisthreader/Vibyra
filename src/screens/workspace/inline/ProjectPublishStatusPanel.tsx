import React from "react";
import { Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../../../styles/theme";
import { modalStyles } from "./ProjectPublishModal.styles";
import type { PublishFlowResult } from "./ProjectPublishResult";

type PublishResult = NonNullable<PublishFlowResult>;

export function ProjectPublishStatusPanel({ onClose, result }: { onClose: () => void; result: PublishResult }) {
  const danger = result.tone === "danger";
  const success = result.tone === "success";
  const icon = danger ? "alert-circle-outline" : success ? "checkmark" : "time-outline";
  const iconColor = danger ? "#FF9AAD" : success ? "#7CF1B3" : "#D9CBFF";

  return (
    <View style={modalStyles.completionWrap}>
      <View style={modalStyles.completionBody}>
        <View style={[modalStyles.completionIcon, success ? modalStyles.completionIconSuccess : danger ? modalStyles.completionIconDanger : null]}>
          <Ionicons name={icon} color={iconColor} size={34} />
        </View>
        <Text style={modalStyles.completionTitle}>{result.title}</Text>
        <Text style={modalStyles.completionText}>{result.message}</Text>
        <Pressable style={modalStyles.doneButton} onPress={onClose}>
          <Text style={[modalStyles.secondaryText, { color: colors.text }]}>Back to Projects</Text>
        </Pressable>
      </View>
    </View>
  );
}
