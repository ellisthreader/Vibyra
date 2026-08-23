import React from "react";
import { Linking, Pressable, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { LEGAL_URLS } from "../../../../utils/legalLinks";
import { styles } from "../../styles";
import { ProfileSheet } from "./ProfileSheet";

const LINKS: Array<{ url: string; icon: keyof typeof Ionicons.glyphMap; title: string; subtitle: string }> = [
  { url: LEGAL_URLS.terms, icon: "reader-outline", title: "Terms of service", subtitle: "How you can use Vibyra" },
  { url: LEGAL_URLS.privacy, icon: "lock-closed-outline", title: "Privacy policy", subtitle: "What we collect and how we use it" }
];

export function TermsSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  function open(url: string) {
    Linking.openURL(url).catch(() => undefined);
  }
  return (
    <ProfileSheet visible={visible} onClose={onClose} icon="document-text-outline" kicker="Support" title="Terms & policies">
      {LINKS.map((link) => (
        <Pressable key={link.url} onPress={() => open(link.url)} style={styles.profileToggleRow}>
          <View style={styles.profileToggleIcon}><Ionicons name={link.icon} color="#5B7CFA" size={20} /></View>
          <View style={styles.profileToggleCopy}>
            <Text style={styles.profileToggleTitle}>{link.title}</Text>
            <Text style={styles.profileToggleSubtitle}>{link.subtitle}</Text>
          </View>
          <Ionicons name="open-outline" color="#747C8A" size={18} />
        </Pressable>
      ))}
    </ProfileSheet>
  );
}
