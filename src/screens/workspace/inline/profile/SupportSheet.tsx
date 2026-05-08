import React from "react";
import { Linking, Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../../../../styles/theme";
import { styles } from "../../styles";
import { ProfileSheet } from "./ProfileSheet";

export function SupportSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  function emailSupport() {
    Linking.openURL("mailto:support@vibyra.app?subject=Vibyra%20support%20request").catch(() => undefined);
  }
  return (
    <ProfileSheet visible={visible} onClose={onClose} icon="chatbubble-outline" kicker="Support" title="Contact support">
      <Text style={styles.profileSheetText}>
        Our team replies within one business day. Include the project you were working on and a short description of what happened.
      </Text>
      <View style={styles.profileToggleRow}>
        <View style={styles.profileToggleIcon}><Ionicons name="mail-outline" color="#C259FF" size={20} /></View>
        <View style={styles.profileToggleCopy}>
          <Text style={styles.profileToggleTitle}>support@vibyra.app</Text>
          <Text style={styles.profileToggleSubtitle}>Email — fastest for billing or account issues</Text>
        </View>
      </View>
      <Pressable onPress={emailSupport} style={styles.profileSheetPrimary}>
        <Ionicons name="paper-plane-outline" color={colors.text} size={18} />
        <Text style={styles.profileSheetPrimaryText}>Email support</Text>
      </Pressable>
    </ProfileSheet>
  );
}
