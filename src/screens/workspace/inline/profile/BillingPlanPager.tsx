import React, { useEffect, useMemo, useRef, useState } from "react";
import { Dimensions, NativeScrollEvent, NativeSyntheticEvent, ScrollView, View } from "react-native";
import { BillingFeaturedPlan } from "./BillingFeaturedPlan";
import { BillingCycle, PLAN_TIERS, PlanKey } from "./types";

const HORIZONTAL_PADDING = 18;
const CARD_GAP = 14;

export function BillingPlanPager({ cycle, currentKey, recommendedKey, onSelect, busy }: {
  cycle: BillingCycle;
  currentKey: PlanKey;
  recommendedKey: PlanKey;
  onSelect: (key: PlanKey, cycle: BillingCycle) => void;
  busy?: boolean;
}) {
  const screenWidth = Dimensions.get("window").width;
  const cardWidth = Math.min(360, screenWidth - HORIZONTAL_PADDING * 2);
  const snapInterval = cardWidth + CARD_GAP;
  const sideInset = (screenWidth - cardWidth) / 2;
  const scrollRef = useRef<ScrollView | null>(null);

  const initialIndex = useMemo(() => {
    const idx = PLAN_TIERS.findIndex((t) => t.key === recommendedKey);
    return idx >= 0 ? idx : 0;
  }, [recommendedKey]);

  const [activeIndex, setActiveIndex] = useState(initialIndex);

  useEffect(() => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ x: initialIndex * snapInterval, animated: false });
    });
  }, [initialIndex, snapInterval]);

  function onScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const x = event.nativeEvent.contentOffset.x;
    const idx = Math.round(x / snapInterval);
    if (idx !== activeIndex && idx >= 0 && idx < PLAN_TIERS.length) {
      setActiveIndex(idx);
    }
  }

  return (
    <View>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={snapInterval}
        decelerationRate="fast"
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingHorizontal: sideInset, paddingVertical: 4 }}
      >
        {PLAN_TIERS.map((tier, index) => (
          <View
            key={tier.key}
            style={{
              width: cardWidth,
              marginRight: index === PLAN_TIERS.length - 1 ? 0 : CARD_GAP
            }}
          >
            <BillingFeaturedPlan
              tier={tier}
              cycle={cycle}
              onSelect={onSelect}
              busy={busy && tier.key === PLAN_TIERS[activeIndex].key}
              isCurrent={tier.key === currentKey}
              isRecommended={tier.key === recommendedKey}
            />
          </View>
        ))}
      </ScrollView>

      <View style={{ alignItems: "center", flexDirection: "row", gap: 6, justifyContent: "center", marginTop: 10 }}>
        {PLAN_TIERS.map((tier, index) => (
          <View
            key={tier.key}
            style={{
              backgroundColor: index === activeIndex ? "#C259FF" : "rgba(255, 255, 255, 0.18)",
              borderRadius: 999,
              height: 6,
              width: index === activeIndex ? 18 : 6
            }}
          />
        ))}
      </View>
    </View>
  );
}
