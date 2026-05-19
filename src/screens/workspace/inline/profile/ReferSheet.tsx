import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Share, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAppContext } from "../../../../context/AppContext";
import { fetchReferralSummary } from "../../../../utils/referralsApi";
import type { ReferralSummary } from "../../../../utils/appApi";
import { styles } from "../../styles";
import { ProfileSheet } from "./ProfileSheet";

export function ReferSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const app = useAppContext();
  const [referral, setReferral] = useState<ReferralSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!visible || !app.authToken) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    setCopied(false);
    fetchReferralSummary(app.authToken)
      .then((result) => {
        if (!cancelled) setReferral(result.referral);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load your referral code.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [app.authToken, visible]);

  async function shareInvite() {
    if (referral) await Share.share({ message: "Try Vibyra with my invite link: " + referral.link });
  }

  async function copyCode() {
    if (!referral) return;
    const clipboard = (globalThis.navigator as { clipboard?: { writeText?: (text: string) => Promise<void> } } | undefined)?.clipboard;
    if (clipboard?.writeText) {
      await clipboard.writeText(referral.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
      return;
    }
    await Share.share({ message: referral.code });
  }

  return (
    <ProfileSheet visible={visible} onClose={onClose} icon="gift-outline" kicker="Refer & earn" title="Invite code">
      {loading ? (
        <View style={styles.referralLoading}>
          <ActivityIndicator color="#A855FF" />
        </View>
      ) : referral ? (
        <>
          <View style={styles.referralHero}>
            <Text selectable style={styles.referralCodeText}>{referral.code}</Text>
            <Text selectable numberOfLines={1} style={styles.referralLink}>{referral.link}</Text>
          </View>

          <View style={styles.referralActions}>
            <Pressable disabled={!referral} onPress={shareInvite} style={({ pressed }) => [styles.referralActionButton, pressed ? styles.referralActionButtonPressed : null]}>
              <Ionicons name="share-social-outline" color="#C7B6FF" size={18} />
              <Text style={styles.referralActionText}>Share</Text>
            </Pressable>
            <Pressable disabled={!referral} onPress={copyCode} style={({ pressed }) => [styles.referralActionButton, pressed ? styles.referralActionButtonPressed : null]}>
              <Ionicons name={copied ? "checkmark-circle-outline" : "copy-outline"} color="#C7B6FF" size={18} />
              <Text style={styles.referralActionText}>{copied ? "Copied" : "Copy"}</Text>
            </Pressable>
          </View>

          <View style={styles.referralStats}>
            <Stat label="Joined" value={String(referral.stats.signedUp)} />
            <Stat label="Members" value={String(referral.stats.paid)} />
            <Stat label="Earned" value={String(referral.stats.earnedCredits)} />
          </View>
        </>
      ) : (
        <Text style={styles.profileSheetMuted}>{error || "Sign in to load your invite code."}</Text>
      )}
    </ProfileSheet>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.referralStat}>
      <Text style={styles.referralStatValue}>{value}</Text>
      <Text style={styles.referralStatLabel}>{label}</Text>
    </View>
  );
}
