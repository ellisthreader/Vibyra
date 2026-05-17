import LottieView from "lottie-react-native";
import React from "react";
import { Animated, Linking, Pressable, Text, View } from "react-native";
import { welcomeCopy } from "../data/welcomeCopy";
import { useDownloadIntro } from "../hooks/useDownloadIntro";
import { useReduceMotion } from "../hooks/useReduceMotion";
import { useTypewriter } from "../hooks/useTypewriter";
import { WelcomeFlow } from "../types";
import { styles } from "../styles";

// To swap the animation: replace src/assets/lottie/download.json with your chosen
// Lottie JSON (keep the same filename) and the rest of this file works unchanged.
const DOWNLOAD_LOTTIE = require("../../../assets/lottie/download.json");

const DOWNLOAD_URL = "https://vibyra.ai";

export function StepDownload({ flow }: { flow: WelcomeFlow }) {
  const intro = useDownloadIntro();
  const reduced = useReduceMotion();
  const typed = useTypewriter(welcomeCopy.download.title, { startDelay: 400, charDelay: 60, blinkAfter: 4 });

  const openSite = () => {
    Linking.openURL(DOWNLOAD_URL).catch(() => undefined);
  };

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.centerStack}>
        <Animated.Text style={[styles.eyebrow, { opacity: intro.eyebrow.opacity }]}>
          {welcomeCopy.download.eyebrow}
        </Animated.Text>
        <View style={styles.typewriterRow}>
          <Text style={styles.welcomeLine}>{typed.value}</Text>
          <View style={[styles.typewriterCaret, typed.caretVisible ? null : styles.typewriterCaretHidden]} />
        </View>
        <Animated.View
          style={[
            styles.downloadLottieWrap,
            { opacity: intro.icon.opacity, transform: [{ scale: intro.icon.scale }] }
          ]}
        >
          <LottieView
            autoPlay={!reduced}
            loop
            source={DOWNLOAD_LOTTIE}
            style={styles.downloadLottie}
          />
        </Animated.View>
        <Animated.View
          style={{ alignItems: "center", opacity: intro.url.opacity, transform: [{ translateY: intro.url.translateY }] }}
        >
          <Pressable accessibilityRole="link" hitSlop={10} onPress={openSite}>
            <Animated.Text style={styles.downloadUrl}>{welcomeCopy.download.url}</Animated.Text>
          </Pressable>
          <Animated.Text style={styles.downloadHelper}>{welcomeCopy.download.urlHelper}</Animated.Text>
        </Animated.View>
      </View>
      <Animated.View
        style={{
          alignSelf: "stretch",
          opacity: intro.cta.opacity,
          transform: [{ translateY: intro.cta.translateY }]
        }}
      >
        <Pressable
          accessibilityHint="Continue to find your PC"
          accessibilityLabel={welcomeCopy.download.cta}
          accessibilityRole="button"
          onPress={flow.goToSetup}
          style={({ pressed }) => [styles.ghostBtn, pressed ? styles.ghostBtnPressed : null]}
        >
          <Animated.Text style={styles.ghostBtnText}>{welcomeCopy.download.cta}</Animated.Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}
