import React from "react";
import { Switch, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { styles } from "../../styles";
import { usePreferences, useThemedColor } from "../../../../context/PreferencesContext";

export function ToggleRow({ icon, title, subtitle, value, onChange }: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  const prefs = usePreferences();
  const iconColor = useThemedColor("#C259FF");
  const inactiveTrack = prefs.effectiveScheme === "light" ? prefs.colors.border : "#2A2440";
  return (
    <View style={styles.profileToggleRow}>
      <View style={styles.profileToggleIcon}><Ionicons name={icon} color={iconColor} size={20} /></View>
      <View style={styles.profileToggleCopy}>
        <Text style={styles.profileToggleTitle}>{title}</Text>
        <Text style={styles.profileToggleSubtitle}>{subtitle}</Text>
      </View>
      <Switch
        ios_backgroundColor={inactiveTrack}
        onValueChange={onChange}
        thumbColor="#FFFFFF"
        trackColor={{ false: inactiveTrack, true: prefs.colors.accent }}
        value={value}
      />
    </View>
  );
}
