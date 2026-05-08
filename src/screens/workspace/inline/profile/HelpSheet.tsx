import React from "react";
import { Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { styles } from "../../styles";
import { ProfileSheet } from "./ProfileSheet";
import { FAQS } from "./types";

export function HelpSheet({ visible, onClose, onOpenSupport }: {
  visible: boolean;
  onClose: () => void;
  onOpenSupport: () => void;
}) {
  return (
    <ProfileSheet visible={visible} onClose={onClose} icon="help-circle-outline" kicker="Support" title="Help center">
      {FAQS.map((item) => (
        <View key={item.q} style={styles.profileFaqRow}>
          <Text style={styles.profileFaqQuestion}>{item.q}</Text>
          <Text style={styles.profileFaqAnswer}>{item.a}</Text>
        </View>
      ))}
      <Pressable onPress={onOpenSupport} style={styles.profileSheetSecondary}>
        <Ionicons name="chatbubble-ellipses-outline" color="#E8E2F7" size={18} />
        <Text style={styles.profileSheetSecondaryText}>Still stuck? Contact support</Text>
      </Pressable>
    </ProfileSheet>
  );
}
