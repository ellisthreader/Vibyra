import React from "react";
import { Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../../../../styles/theme";
import { styles } from "../../styles";
import { ProfileSheet } from "./ProfileSheet";

export function NotificationsSheet({ visible, onClose }: {
  visible: boolean;
  onClose: () => void;
}) {
  return (
    <ProfileSheet visible={visible} onClose={onClose} icon="notifications-outline" kicker="Preferences" title="Notifications">
      <Text style={styles.profileSheetText}>
        Notification preferences are not connected to account settings yet.
      </Text>
      <Text style={styles.profileSheetMuted}>
        Vibyra will keep using the device and system notification settings already granted to the app.
      </Text>
      <View style={styles.profileSheetSecondary}>
        <Ionicons name="notifications-off-outline" color={colors.text} size={18} />
        <Text style={styles.profileSheetSecondaryText}>Controls unavailable</Text>
      </View>
    </ProfileSheet>
  );
}
