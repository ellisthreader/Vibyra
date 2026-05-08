import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React, { useState } from "react";
import { Animated, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "../../../styles/theme";
import { plans } from "../data/plans";
import { getPlanTheme } from "../persona";
import { BillingPeriod, Plan, PersonaModel } from "../types";
import { styles } from "../styles";
import { usePricingMotion } from "./usePricingMotion";
import { usePricingPurchase } from "./usePricingPurchase";

export function PricingScreen({ persona, onClose }: { persona: PersonaModel; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const [selectedPlan, setSelectedPlan] = useState<Plan>(persona.recommendedPlan);
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>("annual");
  const motion = usePricingMotion(selectedPlan, persona.recommendedPlan, setSelectedPlan);
  const purchase = usePricingPurchase(selectedPlan, billingPeriod, onClose);
  const selected = plans.find((plan) => plan.name === selectedPlan) ?? plans[0];
  const theme = getPlanTheme(selected.name);
  const billingLabel = billingPeriod === "monthly" ? "Monthly" : "Annual";
  const selectedPrice = purchase.selectedStoreProduct?.displayPrice ?? (billingPeriod === "monthly" ? selected.monthlyPrice : selected.yearlyPrice);
  const contentPaddingTop = Math.max(insets.top + 12, 34);
  const footerPaddingBottom = Math.max(insets.bottom + 8, 14);

  return (
    <View style={styles.paywallShell}>
      <LinearGradient colors={theme.background} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.paywallBackground} />
      <Animated.View
        style={[
          styles.paywallAuraOne,
          { pointerEvents: "none" },
          { transform: [{ translateX: motion.auraOneTranslateX }, { translateY: motion.auraOneTranslateY }, { scale: motion.auraOneScale }] }
        ]}
      />
      <Animated.View
        style={[
          styles.paywallAuraTwo,
          { pointerEvents: "none" },
          { transform: [{ translateX: motion.auraTwoTranslateX }, { translateY: motion.auraTwoTranslateY }, { scale: motion.auraTwoScale }] }
        ]}
      />
      <View style={[styles.paywallNoise, { pointerEvents: "none" }]} />
      <ScrollView
        contentContainerStyle={[styles.paywallContent, { paddingBottom: footerPaddingBottom + 96, paddingTop: contentPaddingTop }]}
        scrollEnabled={false}
        showsVerticalScrollIndicator={false}
      >
        <Pressable style={styles.paywallClose} onPress={onClose}>
          <Ionicons name="close" color={colors.text} size={32} />
        </Pressable>

        <View style={styles.paywallHero}>
          <Text style={styles.paywallTitle}>Upgrade and get</Text>
          <Text style={[styles.paywallTitle, { color: theme.accent }]}>more credits</Text>
        </View>

        <View style={styles.paywallTabs}>
          {plans.map((plan) => {
            const planTheme = getPlanTheme(plan.name);
            const active = plan.name === selected.name;

            return (
              <Pressable
                key={plan.name}
                style={[styles.paywallTab, active ? styles.paywallTabActive : null]}
                onPress={() => setSelectedPlan(plan.name)}
              >
                <Text style={[styles.paywallTabText, active ? { color: planTheme.accent } : null]}>{plan.name}</Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.billingTabs}>
          {(["monthly", "annual"] as BillingPeriod[]).map((period) => {
            const active = billingPeriod === period;
            return (
              <Pressable
                key={period}
                style={[styles.billingTab, active ? styles.billingTabActive : null]}
                onPress={() => setBillingPeriod(period)}
              >
                <Text style={[styles.billingTabText, active ? { color: theme.accent } : null]}>
                  {period === "monthly" ? "Monthly" : "Annual"}
                </Text>
                {period === "annual" ? <Text style={styles.billingSave}>{selected.yearlySaving}</Text> : null}
              </Pressable>
            );
          })}
        </View>

        <Animated.View
          {...motion.cardPanResponder.panHandlers}
          style={[
            styles.paywallCard,
            { opacity: motion.cardOpacity, transform: [{ translateX: motion.cardSwipeX }, { rotate: motion.cardRotate }] }
          ]}
        >
          <View style={styles.paywallCardHeader}>
            <View>
              <Text style={[styles.paywallPlanName, { color: theme.accent }]}>{selected.name}</Text>
              <Text style={styles.paywallPlanPrice}>{selectedPrice}</Text>
              <Text style={styles.paywallYearly}>
                {billingPeriod === "monthly" ? `${selected.yearlyPrice} · ${selected.yearlySaving}` : "Best value for committed builders"}
              </Text>
            </View>
            {selected.name === persona.recommendedPlan || selected.name === "Builder" ? (
              <View style={[styles.paywallBadge, { backgroundColor: theme.accent }]}>
                <Text style={styles.paywallBadgeText}>{selected.name === "Builder" ? "Most Popular" : "Recommended"}</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.paywallDivider} />

          <View style={styles.paywallFeatureStack}>
            {selected.features.map((feature) => (
              <View key={feature} style={styles.paywallFeatureRow}>
                <Ionicons name="checkmark" color={theme.accent} size={28} />
                <Text style={styles.paywallFeatureText}>{feature}</Text>
              </View>
            ))}
          </View>
        </Animated.View>
      </ScrollView>

      <View style={[styles.paywallFooter, { paddingBottom: footerPaddingBottom }]}>
        <Pressable
          disabled={purchase.isPurchasing}
          style={({ pressed }) => [
            styles.paywallCtaWrap,
            pressed && !purchase.isPurchasing ? styles.planCtaPressed : null,
            purchase.isPurchasing ? styles.paywallCtaDisabled : null
          ]}
          onPress={purchase.buyMembership}
        >
          <LinearGradient colors={theme.button} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.paywallCta}>
            <Text style={styles.paywallCtaText}>
              {purchase.isPurchasing ? "Opening secure checkout..." : `Upgrade to ${selected.name} ${billingLabel}`}
            </Text>
          </LinearGradient>
        </Pressable>
        {purchase.purchaseError ? <Text style={styles.paywallErrorText}>{purchase.purchaseError}</Text> : null}
        {purchase.purchaseMessage ? <Text style={styles.paywallSuccessText}>{purchase.purchaseMessage}</Text> : null}
        <Text style={styles.paywallFooterText}>Subscribe for {selectedPrice}. Cancel anytime</Text>
      </View>
    </View>
  );
}
