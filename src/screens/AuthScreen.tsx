import { Asset } from "expo-asset";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import React, { useEffect, useMemo, useState } from "react";
import { Animated, Image, Pressable, Text, useWindowDimensions, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { VibyraLogo } from "../components/VibyraLogo";
import { useAppContext } from "../context/AppContext";
import { AuthChoice } from "./auth/AuthChoice";
import { EmailAuthForm } from "./auth/EmailAuthForm";
import { FeatureStrip } from "./auth/FeatureStrip";
import { GradientTitleWord } from "./auth/GradientTitleWord";
import { AuthMethod, logoAspectRatio } from "./auth/types";
import { styles } from "./auth/styles";
import { useAuthEntrance } from "./auth/useAuthEntrance";

const frontPageBackground = require("../assets/front-auth.jpg");

export function AuthScreen() {
  const app = useAppContext();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [backgroundSource, setBackgroundSource] = useState(() => frontPageBackground);
  const [authBusy, setAuthBusy] = useState<AuthMethod | null>(null);
  const [authError, setAuthError] = useState("");
  const [emailFormVisible, setEmailFormVisible] = useState(false);
  const entrance = useAuthEntrance();
  const availableHeight = height - insets.top - insets.bottom;
  const fitScale = Math.min(1, Math.max(0.82, availableHeight / 790));
  const compact = availableHeight < 735;
  const logoWidth = Math.min(width * (compact ? 0.51 : 0.58), 250) * fitScale;
  const titleFontSize = Math.min(width * (compact ? 0.075 : 0.082), 34) * Math.max(fitScale, 0.88);
  const contentSpacing = useMemo(() => ({
    paddingBottom: Math.max(insets.bottom + 8, compact ? 10 : 22),
    paddingTop: Math.max(insets.top + (compact ? 42 : 78), availableHeight * (compact ? 0.075 : 0.115))
  }), [availableHeight, compact, insets.bottom, insets.top]);

  useEffect(() => {
    let cancelled = false;

    async function loadBackground() {
      const asset = Asset.fromModule(frontPageBackground);
      if (!asset.localUri) {
        await asset.downloadAsync();
      }
      if (!cancelled && asset.localUri) {
        setBackgroundSource({ uri: asset.localUri });
      }
    }

    loadBackground().catch(() => {
      // Keep the static require fallback if the asset resolver fails.
    });

    return () => {
      cancelled = true;
    };
  }, []);

  async function runAuth(method: AuthMethod, accountStatus: "new" | "existing") {
    setAuthBusy(method);
    setAuthError("");
    try {
      await app.authenticateWith(method, accountStatus);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Could not sign in. Try again.");
    } finally {
      setAuthBusy(null);
    }
  }

  async function submitEmailAuth() {
    await runAuth("email", app.authMode === "login" ? "existing" : "new");
  }

  return (
    <SafeAreaView edges={[]} style={styles.screen}>
      <StatusBar style="light" />
      <View style={styles.screen}>
        <Image source={backgroundSource} resizeMode="cover" style={styles.backgroundImage} />
        <LinearGradient colors={["rgba(3, 2, 18, 0.12)", "rgba(7, 3, 26, 0.2)", "rgba(2, 1, 14, 0.48)"]} style={styles.backgroundOverlay} />
        <View style={[styles.content, contentSpacing]}>
          <View style={styles.heroStack}>
            <Animated.View
              style={[
                styles.logoStage,
                {
                  opacity: entrance.logoOpacity,
                  transform: [{ translateY: entrance.logoTranslateY }, { scale: entrance.logoScale }]
                }
              ]}
            >
              <VibyraLogo style={{ height: logoWidth / logoAspectRatio, width: logoWidth }} />
            </Animated.View>
            <Animated.View
              style={[
                styles.titleStage,
                {
                  opacity: entrance.titleOpacity,
                  marginTop: 32 * fitScale,
                  transform: [{ translateY: entrance.titleTranslateY }]
                }
              ]}
            >
              <View style={styles.titleRow}>
                <Text style={[styles.title, { fontSize: titleFontSize, lineHeight: titleFontSize * 1.16 }]}>Welcome to </Text>
                <GradientTitleWord fontSize={titleFontSize} text="Vibyra" />
              </View>
            </Animated.View>
          </View>

          <Animated.View
            style={[
              styles.actions,
              {
                gap: 11 * fitScale,
                opacity: entrance.restOpacity,
                transform: [{ translateY: entrance.restTranslateY }]
              }
            ]}
          >
            <FeatureStrip scale={fitScale} />
            <AuthChoice busy={authBusy === "google"} icon="logo-google" label="Continue with Google" method="google" scale={fitScale} onSelect={(method) => runAuth(method, "new")} />
            <AuthChoice busy={authBusy === "apple"} icon="logo-apple" label="Continue with Apple" method="apple" scale={fitScale} onSelect={(method) => runAuth(method, "new")} />
            <AuthChoice
              busy={authBusy === "email"}
              icon="mail-outline"
              label={emailFormVisible ? "Hide email form" : "Continue with email"}
              method="email"
              scale={fitScale}
              onSelect={() => {
                setAuthError("");
                setEmailFormVisible((visible) => !visible);
              }}
            />
            {emailFormVisible ? (
              <EmailAuthForm
                busy={authBusy === "email"}
                email={app.authEmail}
                error={authError}
                mode={app.authMode}
                name={app.authName}
                onEmailChange={app.setAuthEmail}
                onModeChange={app.setAuthMode}
                onNameChange={app.setAuthName}
                onPasswordChange={app.setAuthPassword}
                onSubmit={submitEmailAuth}
                password={app.authPassword}
                scale={fitScale}
              />
            ) : authError ? (
              <Text style={styles.authError}>{authError}</Text>
            ) : null}
            <View style={[styles.legalBlock, { gap: 14 * fitScale, paddingTop: 21 * fitScale }]}>
              <Text style={[styles.legalIntro, { fontSize: 14 * fitScale, lineHeight: 20 * fitScale }]}>By continuing, you agree to our</Text>
              <View style={[styles.legalRow, { gap: 24 * fitScale }]}>
                <Pressable style={({ pressed }) => pressed ? styles.legalPressed : null}>
                  <Text style={[styles.legalLink, { fontSize: 15 * fitScale, lineHeight: 20 * fitScale }]}>Privacy Policy</Text>
                </Pressable>
                <View style={[styles.legalDivider, { height: 26 * fitScale }]} />
                <Pressable style={({ pressed }) => pressed ? styles.legalPressed : null}>
                  <Text style={[styles.legalLink, { fontSize: 15 * fitScale, lineHeight: 20 * fitScale }]}>Terms of Service</Text>
                </Pressable>
              </View>
            </View>
          </Animated.View>
        </View>
      </View>
    </SafeAreaView>
  );
}
