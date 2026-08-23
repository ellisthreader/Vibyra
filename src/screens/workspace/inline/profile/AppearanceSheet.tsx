import React from "react";
import { Pressable, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useThemedColor } from "../../../../context/PreferencesContext";
import { styles } from "../../styles";
import { ProfileSheet } from "./ProfileSheet";
import { APPEARANCE_OPTIONS } from "./types";
import { ProfileSheets } from "./useProfileSheets";

export function AppearanceSheet({ visible, onClose, sheets }: {
  visible: boolean;
  onClose: () => void;
  sheets: ProfileSheets;
}) {
  const accentColor = useThemedColor("#5B7CFA");
  const inactiveColor = useThemedColor("#747C8A");
  return (
    <ProfileSheet visible={visible} onClose={onClose} icon="color-palette-outline" kicker="Preferences" title="Appearance">
      {APPEARANCE_OPTIONS.map((opt) => {
        const active = opt.key === sheets.appearance;
        return (
          <Pressable key={opt.key} onPress={() => sheets.setAppearance(opt.key)} style={[styles.profileChoiceRow, active ? styles.profileChoiceRowActive : null]}>
            <View style={styles.profileToggleIcon}><Ionicons name={opt.icon} color={accentColor} size={20} /></View>
            <View style={styles.profileChoiceCopy}>
              <Text style={styles.profileChoiceTitle}>{opt.title}</Text>
              <Text style={styles.profileChoiceSubtitle}>{opt.subtitle}</Text>
            </View>
            <Ionicons name={active ? "checkmark-circle" : "ellipse-outline"} color={active ? accentColor : inactiveColor} size={active ? 22 : 20} />
          </Pressable>
        );
      })}
    </ProfileSheet>
  );
}
