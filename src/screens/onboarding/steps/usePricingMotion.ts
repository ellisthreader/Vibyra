import { useEffect, useMemo, useRef } from "react";
import { Animated, Easing, PanResponder } from "react-native";
import { supportsNativeAnimation } from "../../../utils/nativeAnimation";
import { plans } from "../data/plans";
import { getPlanMotionValue } from "../persona";
import { Plan } from "../types";

export function usePricingMotion(selectedPlan: Plan, recommendedPlan: Plan, setSelectedPlan: (plan: Plan) => void) {
  const auraMotion = useRef(new Animated.Value(getPlanMotionValue(recommendedPlan))).current;
  const cardSwipeX = useRef(new Animated.Value(0)).current;
  const selectedPlanIndex = Math.max(plans.findIndex((plan) => plan.name === selectedPlan), 0);

  useEffect(() => {
    Animated.timing(auraMotion, {
      toValue: getPlanMotionValue(selectedPlan),
      duration: 520,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: supportsNativeAnimation
    }).start();
  }, [auraMotion, selectedPlan]);

  const settleCard = () => {
    Animated.spring(cardSwipeX, { toValue: 0, damping: 22, mass: 0.8, stiffness: 210, useNativeDriver: supportsNativeAnimation }).start();
  };

  const switchPlanBySwipe = (direction: 1 | -1) => {
    const nextIndex = selectedPlanIndex + direction;

    if (nextIndex < 0 || nextIndex >= plans.length) {
      settleCard();
      return;
    }

    Animated.timing(cardSwipeX, {
      toValue: direction === 1 ? -420 : 420,
      duration: 180,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: supportsNativeAnimation
    }).start(() => {
      setSelectedPlan(plans[nextIndex].name);
      cardSwipeX.setValue(direction === 1 ? 420 : -420);
      Animated.spring(cardSwipeX, { toValue: 0, damping: 24, mass: 0.85, stiffness: 190, useNativeDriver: supportsNativeAnimation }).start();
    });
  };

  const cardPanResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_event, gesture) => Math.abs(gesture.dx) > 10 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.25,
    onPanResponderMove: (_event, gesture) => {
      const boundedX = Math.max(Math.min(gesture.dx, 140), -140);
      cardSwipeX.setValue(boundedX);
    },
    onPanResponderRelease: (_event, gesture) => {
      if (Math.abs(gesture.dx) < 58 && Math.abs(gesture.vx) < 0.45) {
        settleCard();
        return;
      }

      switchPlanBySwipe(gesture.dx < 0 ? 1 : -1);
    },
    onPanResponderTerminate: settleCard
  }), [cardSwipeX, selectedPlanIndex]);

  const auraOneTranslateX = auraMotion.interpolate({ inputRange: [0, 1, 2], outputRange: [-24, 0, 26] });
  const auraOneTranslateY = auraMotion.interpolate({ inputRange: [0, 1, 2], outputRange: [18, 0, -14] });
  const auraOneScale = auraMotion.interpolate({ inputRange: [0, 1, 2], outputRange: [0.9, 1.08, 1.18] });
  const auraTwoTranslateX = auraMotion.interpolate({ inputRange: [0, 1, 2], outputRange: [28, 0, -30] });
  const auraTwoTranslateY = auraMotion.interpolate({ inputRange: [0, 1, 2], outputRange: [-16, 0, 20] });
  const auraTwoScale = auraMotion.interpolate({ inputRange: [0, 1, 2], outputRange: [1.12, 1, 0.92] });
  const cardRotate = cardSwipeX.interpolate({ inputRange: [-220, 0, 220], outputRange: ["-2.5deg", "0deg", "2.5deg"], extrapolate: "clamp" });
  const cardOpacity = cardSwipeX.interpolate({ inputRange: [-260, 0, 260], outputRange: [0.7, 1, 0.7], extrapolate: "clamp" });

  return {
    auraOneTranslateX, auraOneTranslateY, auraOneScale,
    auraTwoTranslateX, auraTwoTranslateY, auraTwoScale,
    cardRotate, cardOpacity, cardSwipeX, cardPanResponder
  };
}
