import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Platform, Pressable, Share, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../../../../styles/theme";
import { useAppContext } from "../../../../context/AppContext";
import { styles } from "../../styles";
import { ProfileSheet } from "./ProfileSheet";
import { buildReferralCode } from "./types";

export function ReferSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const app = useAppContext();
  const code = useMemo(() => buildReferralCode(app.authName, app.authEmail), [app.authName, app.authEmail]);
  const [copied, setCopied] = useState(false);

  useEffect(() => { if (!visible) setCopied(false); }, [visible]);

  const copy = useCallback(() => {
    setCopied(true);
    if (Platform.OS === "web" && typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(code).catch(() => undefined);
    }
  }, [code]);

  const share = useCallback(async () => {
    try {
      await Share.share({ message: `Build apps faster with Vibyra. Use my code ${code} for bonus tokens: https://vibyra.app/r/${code}` });
    } catch { /* user dismissed */ }
  }, [code]);

  return (
    <ProfileSheet visible={visible} onClose={onClose} icon="gift-outline" kicker="Refer & earn" title="Invite a friend, earn tokens">
      <Text style={styles.profileSheetText}>
        Share Vibyra with a friend. You both get 500 bonus tokens when they build their first project.
      </Text>
      <View style={styles.profileReferralBox}>
        <Text style={styles.profileReferralCode}>{code}</Text>
        <Pressable onPress={copy}>
          <Text style={styles.profileReferralCopy}>{copied ? "Copied!" : "Copy"}</Text>
        </Pressable>
      </View>
      <Pressable onPress={share} style={styles.profileSheetPrimary}>
        <Ionicons name="share-social-outline" color={colors.text} size={18} />
        <Text style={styles.profileSheetPrimaryText}>Share invite</Text>
      </Pressable>
      <Text style={styles.profileSheetMuted}>
        Bonus tokens land in your account within 24 hours of your friend's first build.
      </Text>
    </ProfileSheet>
  );
}
