import React from "react";
import { Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { modalStyles } from "./ProjectPublishModal.styles";

export function FieldLabel({ label }: { label: string }) {
  return <Text style={modalStyles.label}>{label}</Text>;
}

export function StatusLine({ message, title, tone }: {
  message: string;
  title: string;
  tone: "success" | "info" | "danger";
}) {
  return (
    <View style={[modalStyles.statusLine, tone === "success" ? modalStyles.statusLineSuccess : tone === "danger" ? modalStyles.statusLineDanger : null]}>
      <Ionicons name={tone === "danger" ? "alert-circle-outline" : tone === "success" ? "checkmark-circle" : "time-outline"} color={tone === "danger" ? "#FF9AAD" : tone === "success" ? "#7CF1B3" : "#91A7FF"} size={18} />
      <View style={modalStyles.statusCopy}>
        <Text style={modalStyles.statusTitle}>{title}</Text>
        <Text style={modalStyles.statusText}>{message}</Text>
      </View>
    </View>
  );
}
