import React from "react";
import { Pressable, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { styles } from "../../styles";
import { useThemedColor } from "../../../../context/PreferencesContext";
import { ProfileSheet } from "./ProfileSheet";
import { ToggleRow } from "./ToggleRow";
import { ProfileSheets } from "./useProfileSheets";

export function SecuritySheet({ visible, onClose, sheets, onSignOutAll }: {
  visible: boolean;
  onClose: () => void;
  sheets: ProfileSheets;
  onSignOutAll: () => void;
}) {
  const signOutIconColor = useThemedColor("#E8E2F7");
  return (
    <ProfileSheet visible={visible} onClose={onClose} icon="shield-checkmark-outline" kicker="Preferences" title="Privacy & security">
      <ToggleRow icon="finger-print-outline" title="Biometric lock" subtitle="Require Face ID / Touch ID to open"
        value={sheets.biometricLock} onChange={sheets.setBiometricLock} />
      <ToggleRow icon="bar-chart-outline" title="Anonymous analytics" subtitle="Help us improve Vibyra. No build content shared."
        value={sheets.analyticsOptIn} onChange={sheets.setAnalyticsOptIn} />
      <Pressable onPress={onSignOutAll} style={styles.profileSheetSecondary}>
        <Ionicons name="log-out-outline" color={signOutIconColor} size={18} />
        <Text style={styles.profileSheetSecondaryText}>Sign out of all devices</Text>
      </Pressable>
    </ProfileSheet>
  );
}
