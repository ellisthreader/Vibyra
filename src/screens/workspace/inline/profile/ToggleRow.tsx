import React from "react";
import { Switch, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { styles } from "../../styles";

export function ToggleRow({ icon, title, subtitle, value, onChange }: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <View style={styles.profileToggleRow}>
      <View style={styles.profileToggleIcon}><Ionicons name={icon} color="#C259FF" size={20} /></View>
      <View style={styles.profileToggleCopy}>
        <Text style={styles.profileToggleTitle}>{title}</Text>
        <Text style={styles.profileToggleSubtitle}>{subtitle}</Text>
      </View>
      <Switch
        ios_backgroundColor="#2A2440"
        onValueChange={onChange}
        thumbColor="#FFFFFF"
        trackColor={{ false: "#2A2440", true: "#7E3CFF" }}
        value={value}
      />
    </View>
  );
}
