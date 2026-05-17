import React from "react";
import { Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAppContext } from "../../../../context/AppContext";
import { useThemedColor } from "../../../../context/PreferencesContext";
import { styles } from "../../styles";
import { ProfileSheet } from "./ProfileSheet";

export function ClearCacheSheet({ visible, onCancel }: { visible: boolean; onCancel: () => void }) {
  const app = useAppContext();
  const warningIconColor = useThemedColor("#FFD166");

  function confirm() {
    onCancel();
    app.clearCache();
  }

  return (
    <ProfileSheet visible={visible} onClose={onCancel} icon="trash-outline" kicker="Storage" title="Clear cache?">
      <Text style={styles.profileSheetText}>
        This clears cached projects, chats, desktop connections, logs, generated files, and edit approvals from this device.
      </Text>
      <Text style={styles.profileSheetMuted}>
        Your account, plan, credits, and profile stay signed in.
      </Text>
      <View style={styles.profileSheetActionsStack}>
        <Pressable onPress={confirm} style={styles.profileSheetDanger}>
          <Ionicons name="trash-outline" color={warningIconColor} size={18} />
          <Text style={styles.profileSheetDangerText}>Clear cache</Text>
        </Pressable>
        <Pressable onPress={onCancel} style={styles.profileSheetSecondary}>
          <Text style={styles.profileSheetSecondaryText}>Keep cache</Text>
        </Pressable>
      </View>
    </ProfileSheet>
  );
}
