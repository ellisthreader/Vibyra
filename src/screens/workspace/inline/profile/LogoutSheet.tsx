import React from "react";
import { Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAppContext } from "../../../../context/AppContext";
import { styles } from "../../styles";
import { ProfileSheet } from "./ProfileSheet";

export function LogoutSheet({ visible, onCancel }: { visible: boolean; onCancel: () => void }) {
  const app = useAppContext();
  const userName = app.authName.trim() || "Vibyra User";

  function confirm() {
    onCancel();
    app.signOut();
  }

  return (
    <ProfileSheet visible={visible} onClose={onCancel} icon="log-out-outline" kicker="Account" title="Log out?">
      <Text style={styles.profileSheetText}>
        You're signed in as <Text style={{ color: "#FFFFFF", fontWeight: "900" }}>{userName}</Text>. Logging out will clear cached projects and chats on this device.
      </Text>
      <Text style={styles.profileSheetMuted}>
        Your account, builds, and tokens remain safe and will sync back when you sign in again.
      </Text>
      <View style={styles.profileSheetActionsStack}>
        <Pressable onPress={confirm} style={styles.profileSheetDanger}>
          <Ionicons name="log-out-outline" color="#FF6478" size={18} />
          <Text style={styles.profileSheetDangerText}>Yes, log me out</Text>
        </Pressable>
        <Pressable onPress={onCancel} style={styles.profileSheetSecondary}>
          <Text style={styles.profileSheetSecondaryText}>Stay signed in</Text>
        </Pressable>
      </View>
    </ProfileSheet>
  );
}
