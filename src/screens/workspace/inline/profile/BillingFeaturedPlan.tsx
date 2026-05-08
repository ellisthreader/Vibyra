import React, { useEffect, useRef } from "react";
import { Animated, Easing, Image, Platform, Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { styles } from "../../styles";
import { billingPlanArt } from "../../data/assets";
import { BillingCycle, PlanKey, PlanTier } from "./types";

const PERKS: Array<{ icon: keyof typeof Ionicons.glyphMap; title: string; sub: string }> = [
  { icon: "flash", title: "Faster models", sub: "Priority processing" },
  { icon: "infinite", title: "No cap", sub: "Use without limits" },
  { icon: "trophy", title: "Priority", sub: "Top of the queue" }
];

export function BillingFeaturedPlan({ tier, cycle = "monthly", onSelect, busy, isCurrent, isRecommended }: {
  tier: PlanTier;
  cycle?: BillingCycle;
  onSelect: (key: PlanKey, cycle: BillingCycle) => void;
  busy?: boolean;
  isCurrent?: boolean;
  isRecommended?: boolean;
}) {
  const isAnnual = cycle === "annual";
  const displayPrice = isAnnual ? tier.annualPrice : tier.price;
  const displayCadence = (isAnnual ? tier.annualCadence : tier.cadence).replace("per ", "");
  const displayTokens = isAnnual && tier.annualTokens ? tier.annualTokens : tier.tokens;
  const annualNote = isAnnual && tier.key !== "free" ? tier.annualSubtext : null;
  const ribbonLabel = tier.badge ?? (isRecommended ? "Recommended" : null);
  const entrance = useRef(new Animated.Value(0)).current;
  const glow = useRef(new Animated.Value(0)).current;
  const press = useRef(new Animated.Value(1)).current;
  const native = Platform.OS !== "web";

  useEffect(() => {
    Animated.timing(entrance, { toValue: 1, duration: 520, delay: 80, easing: Easing.out(Easing.cubic), useNativeDriver: native }).start();
    Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 1600, easing: Easing.inOut(Easing.quad), useNativeDriver: native }),
        Animated.timing(glow, { toValue: 0, duration: 1600, easing: Easing.inOut(Easing.quad), useNativeDriver: native })
      ])
    ).start();
  }, [entrance, glow, native]);

  function pressIn() { Animated.spring(press, { toValue: 0.97, useNativeDriver: native, speed: 40, bounciness: 0 }).start(); }
  function pressOut() { Animated.spring(press, { toValue: 1, useNativeDriver: native, speed: 30, bounciness: 4 }).start(); }

  return (
    <Animated.View
      style={[
        styles.featuredPlanWrap,
        {
          opacity: entrance,
          transform: [
            { translateY: entrance.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) },
            { scale: entrance.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) }
          ]
        }
      ]}
    >
      <Animated.View pointerEvents="none" style={[styles.featuredPlanGlow, { opacity: glow.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0.7] }) }]} />
      <View style={styles.featuredPlanCard}>
        <LinearGradient
          colors={["#1F1140", "#15102A", "#0F0A20"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.featuredPlanGradient}
        >
          <Image source={billingPlanArt[tier.key]} style={styles.featuredPlanRocket} resizeMode="contain" />

          {ribbonLabel ? (
            <View style={styles.featuredPlanRibbon}>
              <Ionicons name="sparkles" color="#E8D6FF" size={11} />
              <Text style={styles.featuredPlanRibbonText}>{ribbonLabel}</Text>
            </View>
          ) : null}

          <Text style={styles.featuredPlanName}>{tier.name}</Text>
          <View style={styles.featuredPlanPriceRow}>
            <Text style={styles.featuredPlanPrice}>{displayPrice}</Text>
            <Text style={styles.featuredPlanCadence}>/ {displayCadence}</Text>
          </View>
          {annualNote ? (
            <Text style={[styles.featuredPlanCadence, { color: "#FFD166", marginTop: -4 }]}>{annualNote}</Text>
          ) : null}
          <View style={styles.featuredPlanTokensRow}>
            <Ionicons name="flash" color="#FFD166" size={14} />
            <Text style={styles.featuredPlanTokensText}>{displayTokens}</Text>
          </View>

          <View style={styles.featuredPlanPerks}>
            {PERKS.map((perk) => (
              <View key={perk.title} style={styles.featuredPlanPerk}>
                <Ionicons name={perk.icon} color="#C259FF" size={20} />
                <Text style={styles.featuredPlanPerkTitle}>{perk.title}</Text>
                <Text style={styles.featuredPlanPerkSub}>{perk.sub}</Text>
              </View>
            ))}
          </View>

          {isCurrent ? (
            <View style={styles.featuredPlanCtaCurrent}>
              <Ionicons name="checkmark-circle" color="#FFFFFF" size={18} />
              <Text style={styles.featuredPlanCtaCurrentText}>You're on this plan</Text>
            </View>
          ) : (
            <Animated.View style={{ transform: [{ scale: press }] }}>
              <Pressable disabled={busy} onPressIn={pressIn} onPressOut={pressOut} onPress={() => onSelect(tier.key, cycle)} style={styles.featuredPlanCta}>
                <Text style={styles.featuredPlanCtaText}>{busy ? "Opening…" : `Upgrade to ${tier.name}`}</Text>
                {busy ? null : <Ionicons name="arrow-forward" color="#1A0E33" size={18} />}
              </Pressable>
            </Animated.View>
          )}
        </LinearGradient>
      </View>
    </Animated.View>
  );
}
