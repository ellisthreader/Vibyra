import React from "react";
import { Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { styles } from "../../styles";
import { ProfileSheet } from "./ProfileSheet";
import { LANGUAGES } from "./types";
import { ProfileSheets } from "./useProfileSheets";

export function LanguageSheet({ visible, onClose, sheets }: {
  visible: boolean;
  onClose: () => void;
  sheets: ProfileSheets;
}) {
  function pick(value: string) {
    sheets.setLanguage(value);
    onClose();
  }
  return (
    <ProfileSheet visible={visible} onClose={onClose} icon="globe-outline" kicker="Preferences" title="Language">
      {LANGUAGES.map((value) => {
        const active = value === sheets.language;
        return (
          <Pressable key={value} onPress={() => pick(value)} style={[styles.profileChoiceRow, active ? styles.profileChoiceRowActive : null]}>
            <View style={styles.profileChoiceCopy}><Text style={styles.profileChoiceTitle}>{value}</Text></View>
            <Ionicons name={active ? "checkmark-circle" : "ellipse-outline"} color={active ? "#C259FF" : "#5C5470"} size={active ? 22 : 20} />
          </Pressable>
        );
      })}
    </ProfileSheet>
  );
}
