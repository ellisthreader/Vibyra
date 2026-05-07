import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Animated, Easing, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { VibyraLogo } from "../../../components/VibyraLogo";
import { useAppContext } from "../../../context/AppContext";
import { colors } from "../../../styles/theme";
import { RememberedDesktop } from "../../../types/domain";
import { ConnectStep } from "../components/ConnectStep";
import { connectBackdrop } from "../data/options";
import { styles } from "../styles";
import { ConnectGuideModal } from "./ConnectGuideModal";
import { ConnectStepTwo } from "./ConnectStepTwo";

export function SetupScreen() {
  const app = useAppContext();
  const insets = useSafeAreaInsets();
  const [connectStep, setConnectStep] = useState<1 | 2 | 3 | 4>(1);
  const [connectMode, setConnectMode] = useState<"auto" | "manual">("auto");
  const [guideVisible, setGuideVisible] = useState(false);
  const [foundDesktops, setFoundDesktops] = useState<RememberedDesktop[]>(app.rememberedDesktops);
  const autoFindStartedRef = useRef(false);
  const ambientGlow = useRef(new Animated.Value(0)).current;
  const panelOpacity = useRef(new Animated.Value(1)).current;
  const panelTranslateY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (app.pendingPhoneApproval) setConnectStep(3);
  }, [app.pendingPhoneApproval]);

  useEffect(() => {
    if (app.rememberedDesktops.length > 0) setFoundDesktops(app.rememberedDesktops);
  }, [app.rememberedDesktops]);

  useEffect(() => {
    const glowLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(ambientGlow, { toValue: 1, duration: 2600, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }),
        Animated.timing(ambientGlow, { toValue: 0, duration: 2600, easing: Easing.inOut(Easing.cubic), useNativeDriver: true })
      ])
    );

    glowLoop.start();
    return () => glowLoop.stop();
  }, [ambientGlow]);

  useEffect(() => {
    panelOpacity.setValue(0);
    panelTranslateY.setValue(12);
    Animated.parallel([
      Animated.timing(panelOpacity, { toValue: 1, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(panelTranslateY, { toValue: 0, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true })
    ]).start();
  }, [connectMode, connectStep, panelOpacity, panelTranslateY]);

  const confirmConnection = () => {
    setConnectStep(4);
    setTimeout(() => app.confirmPhonePermission(), 900);
  };

  const findDesktops = useCallback(async () => {
    if (app.checkingHealth) return;
    setFoundDesktops([]);
    const results = await app.discoverPairableDesktops();
    setFoundDesktops(results);
  }, [app]);

  useEffect(() => {
    if (connectStep !== 2 || connectMode !== "auto" || autoFindStartedRef.current) return;
    autoFindStartedRef.current = true;
    void findDesktops();
  }, [connectMode, connectStep, findDesktops]);

  const logoTranslateY = ambientGlow.interpolate({ inputRange: [0, 1], outputRange: [0, -7] });

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.connectScreen}>
      <Image source={connectBackdrop} resizeMode="cover" style={styles.connectBackdropImage} />
      <ScrollView
        contentContainerStyle={[
          styles.connectScrollContent,
          { paddingBottom: Math.max(insets.bottom + 14, 22), paddingTop: Math.max(insets.top + 8, 18) }
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.connectHeader}>
          <Animated.View style={[styles.connectLogoWrap, { transform: [{ translateY: logoTranslateY }] }]}>
            <VibyraLogo style={styles.connectLogo} />
          </Animated.View>
          <Text style={styles.connectTitle}>
            <Text style={styles.connectTitleAccent}>Connect</Text> to your PC
          </Text>
          <Text style={styles.connectSubtitle}>One clear step at a time. Keep both devices on the same Wi-Fi.</Text>
        </View>

        <View style={styles.connectStepDots}>
          {[1, 2, 3, 4].map((step, index) => (
            <React.Fragment key={step}>
              <View style={[styles.connectStepDot, step <= connectStep ? styles.connectStepDotActive : null]}>
                <Text style={[styles.connectStepDotText, step <= connectStep ? styles.connectStepDotTextActive : null]}>{step}</Text>
              </View>
              {index < 3 ? <View style={[styles.connectStepRail, step < connectStep ? styles.connectStepRailActive : null]} /> : null}
            </React.Fragment>
          ))}
        </View>

        <Animated.View style={[styles.connectActivePanel, { opacity: panelOpacity, transform: [{ translateY: panelTranslateY }] }]}>
          {connectStep === 1 ? (
            <ConnectStep
              number={1}
              icon="download-outline"
              title="Download Vibyra Desktop"
              lines={["Download Vibyra Desktop at vibyra.ai.", "Available for Windows, Mac, and Linux."]}
            >
              <Pressable style={({ pressed }) => [styles.connectPrimaryAction, pressed ? styles.connectActionPressed : null]} onPress={() => setConnectStep(2)}>
                <LinearGradient colors={["#762CFF", "#9D35FF", "#B13CFF"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.connectPrimaryActionGradient}>
                  <Ionicons name="checkmark-circle-outline" color={colors.text} size={31} />
                  <Text style={styles.connectPrimaryActionText}>I downloaded Vibyra Desktop</Text>
                </LinearGradient>
              </Pressable>
            </ConnectStep>
          ) : null}

          {connectStep === 2 ? (
            <ConnectStepTwo connectMode={connectMode} setConnectMode={setConnectMode} foundDesktops={foundDesktops} findDesktops={findDesktops} />
          ) : null}

          {connectStep === 3 ? (
            <ConnectStep
              number={3}
              icon="shield-checkmark-outline"
              title="Approve the connection"
              lines={["Tap Allow on your computer.", "Then confirm on your phone."]}
            >
              <Pressable style={({ pressed }) => [styles.connectPrimaryAction, pressed ? styles.connectActionPressed : null]} onPress={confirmConnection}>
                <LinearGradient colors={["#762CFF", "#9D35FF", "#B13CFF"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.connectPrimaryActionGradient}>
                  <Ionicons name="checkmark-circle-outline" color={colors.text} size={31} />
                  <Text style={styles.connectPrimaryActionText}>Confirm on phone</Text>
                </LinearGradient>
              </Pressable>
            </ConnectStep>
          ) : null}

          {connectStep === 4 ? (
            <ConnectStep number={4} icon="sparkles-outline" title="You're connected" lines={["Start controlling your PC instantly."]} />
          ) : null}
        </Animated.View>
        <Pressable style={({ pressed }) => [styles.connectHelpRow, pressed ? styles.connectActionPressed : null]} onPress={() => setGuideVisible(true)}>
          <Ionicons name="shield-checkmark-outline" color="#9A4DFF" size={23} />
          <Text style={styles.connectHelpText}>Need help?</Text>
          <Text style={styles.connectGuideText}>View guide</Text>
          <Ionicons name="chevron-forward" color="#9A4DFF" size={19} />
        </Pressable>
      </ScrollView>
      <ConnectGuideModal visible={guideVisible} onClose={() => setGuideVisible(false)} />
    </KeyboardAvoidingView>
  );
}
