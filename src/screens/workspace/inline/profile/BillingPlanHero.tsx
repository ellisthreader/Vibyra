import React, { useLayoutEffect, useRef, useState } from "react";
import { Animated, Easing, Image, Text, View } from "react-native";
import { usePreferences } from "../../../../context/PreferencesContext";
import { styles } from "../../styles";
import { BillingCycle, PLAN_ORDER, PLAN_TIERS, PlanKey, PlanTier } from "./types";
import { getDisplayPrice } from "./billingUtils";

const PLAN_ART: Record<PlanKey, number> = {
  free: require("../../../../assets/billing-plans/free-card.png"),
  starter: require("../../../../assets/billing-plans/starter-card.png"),
  builder: require("../../../../assets/billing-plans/builder-card.png"),
  pro: require("../../../../assets/billing-plans/pro-card.png")
};

const PLAN_ACCENTS: Record<PlanKey, { main: string; soft: string; dim: string; wash: string; border: string }> = {
  free: { main: "#4ADE80", soft: "#D5FFE3", dim: "#A7F3D0", wash: "rgba(74, 222, 128, 0.14)", border: "rgba(74, 222, 128, 0.32)" },
  starter: { main: "#C259FF", soft: "#F1DEFF", dim: "#D8B4FE", wash: "rgba(194, 89, 255, 0.15)", border: "rgba(194, 89, 255, 0.34)" },
  builder: { main: "#38BDF8", soft: "#DDF5FF", dim: "#BAE6FD", wash: "rgba(56, 189, 248, 0.15)", border: "rgba(56, 189, 248, 0.34)" },
  pro: { main: "#FFD166", soft: "#FFF2C7", dim: "#FDE68A", wash: "rgba(255, 209, 102, 0.15)", border: "rgba(255, 209, 102, 0.34)" }
};

export function BillingPlanHero({
  cycle,
  tier
}: {
  cycle: BillingCycle;
  tier: PlanTier;
}) {
  const prefs = usePreferences();
  const progress = useRef(new Animated.Value(1)).current;
  const lastTierKey = useRef<PlanKey>(tier.key);
  const [previous, setPrevious] = useState<{ direction: number; tier: PlanTier } | null>(null);
  const light = prefs.effectiveScheme === "light";

  useLayoutEffect(() => {
    if (lastTierKey.current === tier.key) return;
    const fromIndex = PLAN_ORDER.indexOf(lastTierKey.current);
    const toIndex = PLAN_ORDER.indexOf(tier.key);
    setPrevious({ direction: toIndex >= fromIndex ? 1 : -1, tier: getTierByKey(lastTierKey.current) });
    lastTierKey.current = tier.key;
    progress.setValue(0);
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: 460,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true
    });
    animation.start(({ finished }) => {
      if (finished) setPrevious(null);
    });
    return () => animation.stop();
  }, [progress, tier.key]);

  const direction = previous?.direction ?? 1;
  const enteringStyle = {
    opacity: progress.interpolate({ inputRange: [0, 0.24, 1], outputRange: [0, 1, 1] }),
    transform: [
      { perspective: 900 },
      { translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [direction * 34, 0] }) },
      { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) },
      { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.975, 1] }) },
      { rotateY: progress.interpolate({ inputRange: [0, 1], outputRange: [`${direction * -4}deg`, "0deg"] }) }
    ]
  };
  const exitingStyle = previous ? {
    opacity: progress.interpolate({ inputRange: [0, 0.74, 1], outputRange: [1, 0.18, 0] }),
    transform: [
      { perspective: 900 },
      { translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [0, direction * -24] }) },
      { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [0, 6] }) },
      { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [1, 0.982] }) },
      { rotateY: progress.interpolate({ inputRange: [0, 1], outputRange: ["0deg", `${direction * 3}deg`] }) }
    ]
  } : null;
  const copyStyle = previous ? {
    opacity: progress.interpolate({ inputRange: [0, 0.18, 1], outputRange: [0, 0.88, 1] }),
    transform: [
      { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) },
      { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.992, 1] }) }
    ]
  } : null;
  return (
    <View style={[styles.billingPlanHero, { backgroundColor: light ? prefs.colors.surface : "#0B0B12" }]}>
      {previous ? (
        <Animated.View pointerEvents="none" style={[styles.billingPlanHeroLayer, exitingStyle]}>
          <BillingPlanHeroArtLayer tier={previous.tier} />
        </Animated.View>
      ) : null}
      <Animated.View style={[styles.billingPlanHeroLayer, previous ? enteringStyle : null]}>
        <BillingPlanHeroArtLayer tier={tier} />
      </Animated.View>
      <Animated.View pointerEvents="none" style={[styles.billingPlanHeroContent, copyStyle]}>
        <BillingPlanHeroCopy cycle={cycle} tier={tier} />
      </Animated.View>
    </View>
  );
}

function BillingPlanHeroArtLayer({ tier }: { tier: PlanTier }) {
  return (
    <View style={styles.billingPlanHeroLayerInner}>
      <Image source={PLAN_ART[tier.key]} resizeMode="cover" style={styles.billingPlanHeroImage} />
      <View style={styles.billingPlanHeroShade} />
    </View>
  );
}

function BillingPlanHeroCopy({ cycle, tier }: { cycle: BillingCycle; tier: PlanTier }) {
  const display = getDisplayPrice(tier, cycle);
  const creditValue = display.tokens.replace(" credits / month", "").replace(" credits/month", "");
  const accent = PLAN_ACCENTS[tier.key];
  const bullets = getHeroBullets(tier.key, creditValue);

  return (
    <>
      <View style={styles.billingPlanHeroTop}>
        <View style={styles.billingPlanHeroTitleBlock}>
          <Text style={[styles.billingPlanHeroName, { color: accent.soft }]}>{tier.name}</Text>
          <Text style={[styles.billingPlanHeroTagline, { color: accent.dim }]}>{tier.tagline}</Text>
        </View>
      </View>

      <View style={styles.billingPlanHeroBody}>
        <View style={styles.billingPlanHeroPriceRow}>
          <Text style={[styles.billingPlanHeroPrice, { color: accent.soft }]}>{display.price}</Text>
          <Text style={[styles.billingPlanHeroCadence, { color: accent.dim }]}>/{display.cadence}</Text>
        </View>

        <View style={styles.billingPlanHeroBullets}>
          {bullets.map((bullet) => <HeroBullet key={bullet} accent={accent.main} text={bullet} textColor={accent.dim} />)}
        </View>
      </View>
    </>
  );
}

function getTierByKey(key: PlanKey) {
  return PLAN_TIERS.find((item) => item.key === key) ?? PLAN_TIERS[0];
}

function HeroBullet({ accent, text, textColor }: { accent: string; text: string; textColor: string }) {
  return (
    <View style={styles.billingPlanHeroBullet}>
      <View style={[styles.billingPlanHeroBulletDot, { backgroundColor: accent }]} />
      <Text style={[styles.billingPlanHeroBulletText, { color: textColor }]}>{text}</Text>
    </View>
  );
}

function getHeroBullets(key: PlanKey, credits: string) {
  if (key === "free") return [`${credits} credits each month`, "Try Vibyra on one project", "Join the community"];
  if (key === "starter") return [`${credits} credits each month`, "Unlock every AI model", "Ship your first real build"];
  if (key === "builder") return [`${credits} credits each month`, "Build more projects at once", "Get priority when busy"];
  return [`${credits} credits each month`, "Run more agents at once", "Get the fastest priority access"];
}
