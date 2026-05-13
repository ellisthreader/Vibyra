import React from "react";
import { Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { styles } from "../../styles";
import { colors } from "../../../../styles/theme";
import { ProfileSheet } from "./ProfileSheet";

export function SecuritySheet({ visible, onClose }: {
  visible: boolean;
  onClose: () => void;
}) {
  return (
    <ProfileSheet visible={visible} onClose={onClose} icon="shield-checkmark-outline" kicker="Preferences" title="Privacy & security">
      <Text style={styles.profileSheetText}>
        Biometric lock and analytics preferences are not enforced by this mobile build.
      </Text>
      <Text style={styles.profileSheetMuted}>
        They will return once the app can save the settings and enforce them consistently.
      </Text>
      <View style={styles.profileSheetSecondary}>
        <Ionicons name="shield-outline" color={colors.text} size={18} />
        <Text style={styles.profileSheetSecondaryText}>Security controls unavailable</Text>
      </View>
    </ProfileSheet>
  );
}
