import React, { useEffect, useRef } from "react";
import { Animated, Easing, Platform, Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { styles } from "../../styles";
import { usePreferences, useThemedColor } from "../../../../context/PreferencesContext";
import { BillingCycle, PlanKey, PlanTier } from "./types";

type Accent = {
  cardBg: string;
  cardBorder: string;
  glowBorder: string;
  iconBg: string;
  iconColor: string;
  ribbonBg: string;
  ribbonBorder: string;
  ribbonText: string;
  ribbonIcon: string;
};

const ACCENTS: Record<PlanKey, Accent> = {
  free: {
    cardBg: "#16181F",
    cardBorder: "rgba(255, 255, 255, 0.08)",
    glowBorder: "rgba(255, 255, 255, 0.12)",
    iconBg: "rgba(74, 222, 128, 0.16)",
    iconColor: "#4ADE80",
    ribbonBg: "rgba(255, 255, 255, 0.06)",
    ribbonBorder: "rgba(255, 255, 255, 0.18)",
    ribbonText: "#E8E2F7",
    ribbonIcon: "#E8E2F7"
  },
  starter: {
    cardBg: "rgba(126, 30, 188, 0.18)",
    cardBorder: "rgba(194, 89, 255, 0.55)",
    glowBorder: "rgba(194, 89, 255, 0.55)",
    iconBg: "rgba(194, 89, 255, 0.22)",
    iconColor: "#C259FF",
    ribbonBg: "rgba(194, 89, 255, 0.28)",
    ribbonBorder: "rgba(194, 89, 255, 0.6)",
    ribbonText: "#E8D6FF",
    ribbonIcon: "#E8D6FF"
  },
  builder: {
    cardBg: "rgba(58, 96, 198, 0.20)",
    cardBorder: "rgba(120, 160, 255, 0.45)",
    glowBorder: "rgba(120, 160, 255, 0.50)",
    iconBg: "rgba(120, 160, 255, 0.22)",
    iconColor: "#7DA3FF",
    ribbonBg: "rgba(120, 160, 255, 0.28)",
    ribbonBorder: "rgba(120, 160, 255, 0.55)",
    ribbonText: "#D4E2FF",
    ribbonIcon: "#D4E2FF"
  },
  pro: {
    cardBg: "rgba(60, 50, 22, 0.32)",
    cardBorder: "rgba(255, 209, 102, 0.32)",
    glowBorder: "rgba(255, 209, 102, 0.40)",
    iconBg: "rgba(250, 204, 21, 0.18)",
    iconColor: "#FACC15",
    ribbonBg: "rgba(250, 204, 21, 0.20)",
    ribbonBorder: "rgba(250, 204, 21, 0.45)",
    ribbonText: "#FFE89A",
    ribbonIcon: "#FFE89A"
  }
};

const CHECK_COLOR = "#4ADE80";

export function BillingFeaturedPlan({ tier, cycle = "monthly", onSelect, busy, disabled, isCurrent, isRecommended }: {
  tier: PlanTier;
  cycle?: BillingCycle;
  onSelect: (key: PlanKey, cycle: BillingCycle) => void;
  busy?: boolean;
  disabled?: boolean;
  isCurrent?: boolean;
  isRecommended?: boolean;
}) {
  const { t } = usePreferences();
  const isAnnual = cycle === "annual";
  const displayPrice = isAnnual ? tier.annualPrice : tier.price;
  const displayCadence = (isAnnual ? tier.annualCadence : tier.cadence).replace("per ", "");
  const displayTokens = isAnnual && tier.annualTokens ? tier.annualTokens : tier.tokens;
  const annualNote = isAnnual && tier.key !== "free" ? tier.annualSubtext : null;
  const ribbonLabel = tier.badge ? (tier.badge.toLowerCase().includes("popular") ? null : tier.badge) : null;
  const computedRibbon = tier.badge && tier.badge.toLowerCase().includes("popular")
    ? t("billing.mostPopular")
    : (ribbonLabel ?? (isRecommended && !isCurrent ? t("billing.recommended") : null));
  const showRibbon = !!computedRibbon && !isCurrent;
  const showGlow = isRecommended && !isCurrent;
  const accent = ACCENTS[tier.key];
  const currentChipIconColor = useThemedColor("#E8E2F7");

  const glow = useRef(new Animated.Value(0)).current;
  const press = useRef(new Animated.Value(1)).current;
  const native = Platform.OS !== "web";

  useEffect(() => {
    if (!showGlow) return;
    Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 1700, easing: Easing.inOut(Easing.quad), useNativeDriver: native }),
        Animated.timing(glow, { toValue: 0, duration: 1700, easing: Easing.inOut(Easing.quad), useNativeDriver: native })
      ])
    ).start();
  }, [glow, native, showGlow]);

  function pressIn() { Animated.spring(press, { toValue: 0.985, useNativeDriver: native, speed: 40, bounciness: 0 }).start(); }
  function pressOut() { Animated.spring(press, { toValue: 1, useNativeDriver: native, speed: 30, bounciness: 4 }).start(); }

  return (
    <Animated.View style={[styles.featuredPlanWrap, { transform: [{ scale: press }] }]}>
      {showGlow ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.featuredPlanGlow,
            { borderColor: accent.glowBorder, opacity: glow.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0.7] }) }
          ]}
        />
      ) : null}
      <Pressable
        disabled={isCurrent || busy || disabled}
        onPressIn={pressIn}
        onPressOut={pressOut}
        onPress={() => onSelect(tier.key, cycle)}
        style={[styles.featuredPlanCard, { backgroundColor: accent.cardBg, borderColor: accent.cardBorder }, disabled && !isCurrent ? { opacity: 0.62 } : null]}
      >
        <View style={styles.featuredPlanInner}>
          <View style={styles.featuredPlanHead}>
            <View style={[styles.featuredPlanIcon, { backgroundColor: accent.iconBg }]}>
              <Ionicons name={tier.pillIcon} color={accent.iconColor} size={20} />
            </View>

            <View style={styles.featuredPlanHeadCopy}>
              <View style={styles.featuredPlanNameRow}>
                <Text style={styles.featuredPlanName}>{tier.name}</Text>
                {showRibbon ? (
                  <View style={[styles.featuredPlanRibbon, { backgroundColor: accent.ribbonBg, borderColor: accent.ribbonBorder, borderWidth: 1 }]}>
                    <Ionicons name="sparkles" color={accent.ribbonIcon} size={9} />
                    <Text style={[styles.featuredPlanRibbonText, { color: accent.ribbonText }]}>{computedRibbon}</Text>
                  </View>
                ) : null}
              </View>
              <Text style={styles.featuredPlanTokens} numberOfLines={1}>{displayTokens}</Text>
            </View>

            <View style={styles.featuredPlanRight}>
              <View style={styles.featuredPlanPriceRow}>
                <Text style={styles.featuredPlanPrice}>{displayPrice}</Text>
                <Text style={styles.featuredPlanCadence}>/{displayCadence}</Text>
              </View>
              {annualNote ? <Text style={styles.featuredPlanAnnualNote} numberOfLines={1}>{annualNote}</Text> : null}
              {isCurrent ? (
                <View style={styles.featuredPlanCurrentChip}>
                  <Ionicons name="checkmark" color={currentChipIconColor} size={11} />
                  <Text style={styles.featuredPlanCurrentChipText}>{t("billing.current")}</Text>
                </View>
              ) : null}
            </View>
          </View>

          <View style={styles.featuredPlanPerks}>
            {tier.perks.map((perk) => (
              <View key={perk} style={styles.featuredPlanPerk}>
                <Ionicons name="checkmark-circle" color={CHECK_COLOR} size={14} />
                <Text style={styles.featuredPlanPerkText} numberOfLines={1}>{perk}</Text>
              </View>
            ))}
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}
