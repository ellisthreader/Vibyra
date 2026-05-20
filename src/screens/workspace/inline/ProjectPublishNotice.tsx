import React, { useEffect, useRef } from "react";
import { Animated, Easing, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { PublishFlowResult } from "./ProjectPublishResult";
import { modalStyles } from "./ProjectPublishModal.styles";

export function ProjectPublishNotice({ notice, onDone }: { notice: PublishFlowResult; onDone: () => void }) {
  const onDoneRef = useRef(onDone);
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-8)).current;

  useEffect(() => { onDoneRef.current = onDone; }, [onDone]);

  useEffect(() => {
    if (!notice) return;
    opacity.setValue(0);
    translateY.setValue(-8);
    Animated.parallel([
      Animated.timing(opacity, { duration: 180, easing: Easing.out(Easing.quad), toValue: 1, useNativeDriver: true }),
      Animated.timing(translateY, { duration: 180, easing: Easing.out(Easing.quad), toValue: 0, useNativeDriver: true })
    ]).start();
    const timeout = setTimeout(() => {
      Animated.parallel([
        Animated.timing(opacity, { duration: 180, easing: Easing.in(Easing.quad), toValue: 0, useNativeDriver: true }),
        Animated.timing(translateY, { duration: 180, easing: Easing.in(Easing.quad), toValue: -6, useNativeDriver: true })
      ]).start(({ finished }) => { if (finished) onDoneRef.current(); });
    }, 5200);
    return () => {
      clearTimeout(timeout);
      opacity.stopAnimation();
      translateY.stopAnimation();
    };
  }, [notice, opacity, translateY]);

  if (!notice) return null;

  return (
    <Animated.View style={[modalStyles.publishNotice, { opacity, transform: [{ translateY }] }]}>
      <View style={[modalStyles.publishNoticeIcon, notice.tone === "success" ? modalStyles.publishNoticeIconSuccess : notice.tone === "danger" ? modalStyles.publishNoticeIconDanger : null]}>
        <Ionicons name={notice.tone === "danger" ? "alert-circle-outline" : notice.tone === "success" ? "checkmark-circle" : "time-outline"} color={notice.tone === "danger" ? "#FF9AAD" : notice.tone === "success" ? "#7CF1B3" : "#D9CBFF"} size={19} />
      </View>
      <View style={modalStyles.publishNoticeCopy}>
        <Text style={modalStyles.publishNoticeTitle}>{notice.title}</Text>
        <Text style={modalStyles.publishNoticeText}>{notice.message}</Text>
      </View>
    </Animated.View>
  );
}
