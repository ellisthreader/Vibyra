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

  useEffect(() => {
    if (!visible || !app.authToken) return;
    let cancelled = false;
    setLoading(true);
    setError("");
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

  const signupReward = referral?.rewards.referrer_signup_credits ?? 50;
  const paidReward = referral?.rewards.referrer_paid_credits ?? 150;

  async function shareLink() {
    if (referral) await Share.share({ message: `Try Vibyra with my invite link: ${referral.link}` });
  }

  async function shareCode() {
    if (referral) await Share.share({ message: `Use my Vibyra invite code: ${referral.code}` });
  }

  return (
    <ProfileSheet visible={visible} onClose={onClose} icon="gift-outline" kicker="Refer & earn" title="Share Vibyra">
      <Text style={styles.referralIntro}>Invite a friend. They get credits to start, and you earn more when they become a member.</Text>

      <View style={styles.referralHero}>
        {loading ? (
          <View style={{ alignItems: "center", justifyContent: "center", minHeight: 150 }}>
            <ActivityIndicator color="#A855FF" />
          </View>
        ) : referral ? (
          <>
            <View style={styles.referralHeroTop}>
              <View style={styles.referralHeroCopy}>
                <Text style={styles.referralEyebrow}>Your invite</Text>
                <Text style={styles.referralHeroTitle}>Give {referral.rewards.referred_signup_credits} credits. Earn up to {signupReward + paidReward}.</Text>
              </View>
              <View style={styles.referralCodeBox}>
                <Text selectable style={styles.referralCodeText}>{referral.code}</Text>
              </View>
            </View>
            <Text selectable numberOfLines={1} style={styles.referralLink}>{referral.link}</Text>
            <View style={styles.referralRewards}>
              <RewardPill label="per signup" value={`+${signupReward}`} />
              <RewardPill label="first membership" value={`+${paidReward}`} />
            </View>
            <View style={styles.referralStats}>
              <Stat label="Joined" value={String(referral.stats.signedUp)} />
              <Stat label="Members" value={String(referral.stats.paid)} />
              <Stat label="Earned" value={`${referral.stats.earnedCredits}`} />
            </View>
          </>
        ) : (
          <Text style={styles.profileSheetMuted}>{error || "Sign in to load your invite code."}</Text>
        )}
      </View>

      <View style={styles.referralActions}>
        <Pressable disabled={!referral} onPress={shareLink} style={[styles.profileSheetPrimary, { flex: 1, opacity: referral ? 1 : 0.45 }]}>
          <Ionicons name="share-social-outline" color="#FFFFFF" size={18} />
          <Text style={styles.profileSheetPrimaryText}>Share link</Text>
        </Pressable>
        <Pressable disabled={!referral} onPress={shareCode} style={[styles.profileSheetSecondary, { flex: 1, opacity: referral ? 1 : 0.45 }]}>
          <Ionicons name="ticket-outline" color="#E8E2F7" size={18} />
          <Text style={styles.profileSheetSecondaryText}>Share code</Text>
        </Pressable>
      </View>

      <Text style={styles.referralFinePrint}>One reward per new account. Self-referrals and duplicate accounts do not qualify.</Text>
    </ProfileSheet>
  );
}

function RewardPill({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.referralRewardPill}>
      <Text style={styles.referralRewardValue}>{value}</Text>
      <Text style={styles.referralRewardLabel}>{label}</Text>
    </View>
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
