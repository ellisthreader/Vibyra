import React from "react";
import { Image, Text, View } from "react-native";
import { usePreferences } from "../../../../context/PreferencesContext";
import { styles } from "../../styles";
import { BillingCycle, PlanKey, PlanTier } from "./types";
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
  const display = getDisplayPrice(tier, cycle);
  const creditValue = display.tokens.replace(" credits / month", "").replace(" credits/month", "");
  const light = prefs.effectiveScheme === "light";
  const accent = PLAN_ACCENTS[tier.key];
  const bullets = getHeroBullets(tier.key, creditValue);

  return (
    <View style={[styles.billingPlanHero, { backgroundColor: light ? prefs.colors.surface : "#0B0B12" }]}>
      <Image source={PLAN_ART[tier.key]} resizeMode="cover" style={styles.billingPlanHeroImage} />
      <View style={styles.billingPlanHeroShade} />

      <View style={styles.billingPlanHeroContent}>
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
      </View>
    </View>
  );
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
