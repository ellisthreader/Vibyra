import React from "react";
import { Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../../../../styles/theme";
import { styles } from "../../styles";
import { ProfileSheet } from "./ProfileSheet";

export function ReferSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  return (
    <ProfileSheet visible={visible} onClose={onClose} icon="gift-outline" kicker="Refer & earn" title="Referral data unavailable">
      <Text style={styles.profileSheetText}>
        Referral codes and rewards are not available from the account API yet.
      </Text>
      <Text style={styles.profileSheetMuted}>
        This screen will show your real invite code once the backend returns referral data.
      </Text>
      <View style={styles.profileSheetPrimary}>
        <Ionicons name="share-social-outline" color={colors.text} size={18} />
        <Text style={styles.profileSheetPrimaryText}>Invite unavailable</Text>
      </View>
    </ProfileSheet>
  );
}
