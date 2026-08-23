import { Asset } from "expo-asset";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Image, KeyboardAvoidingView, Platform, ScrollView, Text, useWindowDimensions, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useAccountActions, useAccountSession } from "../context/AccountContexts";
import { AppleAuthChoice } from "./auth/AppleAuthChoice";
import { AuthChoice } from "./auth/AuthChoice";
import { AuthHero } from "./auth/AuthHero";
import { AuthLegalLinks } from "./auth/AuthLegalLinks";
import { AuthRecoveryForm } from "./auth/AuthRecoveryForm";
import { EmailAuthForm } from "./auth/EmailAuthForm";
import { FeatureStrip } from "./auth/FeatureStrip";
import { AuthMethod } from "./auth/types";
import { styles } from "./auth/styles";
import { useAuthEntrance } from "./auth/useAuthEntrance";
import { useAuthRecovery } from "./auth/useAuthRecovery";
import { formatAuthError } from "./auth/authErrors";

const frontPageBackground = require("../assets/front-auth-desktop-4k.webp");

export function AuthScreen() {
  const account = useAccountSession();
  const actions = useAccountActions();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [backgroundSource, setBackgroundSource] = useState(() => frontPageBackground);
  const [authBusy, setAuthBusy] = useState<AuthMethod | null>(null);
  const [authError, setAuthError] = useState("");
  const [emailFormVisible, setEmailFormVisible] = useState(false);
  const recovery = useAuthRecovery({ email: account.authEmail, setEmail: actions.setAuthEmail });
  const entrance = useAuthEntrance();
  const scrollRef = useRef<ScrollView>(null);
  const availableHeight = height - insets.top - insets.bottom;
  const fitScale = Math.min(1, Math.max(emailFormVisible ? 0.74 : 0.82, availableHeight / (emailFormVisible ? 870 : 790)));
  const compact = emailFormVisible || availableHeight < 735;
  const logoWidth = Math.min(width * (emailFormVisible ? 0.44 : compact ? 0.51 : 0.58), emailFormVisible ? 202 : 250) * fitScale;
  const titleFontSize = Math.min(width * (emailFormVisible ? 0.068 : compact ? 0.075 : 0.082), emailFormVisible ? 29 : 34) * Math.max(fitScale, 0.88);
  const contentSpacing = useMemo(() => ({
    paddingBottom: Math.max(insets.bottom + (emailFormVisible ? 16 : 8), compact ? 10 : 22),
    paddingTop: emailFormVisible
      ? Math.max(insets.top + 22, availableHeight * 0.042)
      : Math.max(insets.top + (compact ? 42 : 78), availableHeight * (compact ? 0.075 : 0.115))
  }), [availableHeight, compact, emailFormVisible, insets.bottom, insets.top]);

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

  useEffect(() => {
    if (!emailFormVisible) {
      return;
    }
    const handle = setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    }, 80);
    return () => clearTimeout(handle);
  }, [emailFormVisible]);

  useEffect(() => {
    if (recovery.mode) setEmailFormVisible(true);
  }, [recovery.mode]);

  async function runAuth(method: AuthMethod, accountStatus: "new" | "existing") {
    setAuthBusy(method);
    setAuthError("");
    try {
      await actions.authenticateWith(method, accountStatus);
    } catch (error) {
      setAuthError(formatAuthError(error));
    } finally {
      setAuthBusy(null);
    }
  }

  async function submitEmailAuth() {
    await runAuth("email", account.authMode === "login" ? "existing" : "new");
  }

  async function resendVerification() {
    setAuthError("");
    try {
      setAuthError(await recovery.resendVerification());
    } catch (error) {
      setAuthError(formatAuthError(error));
    }
  }

  return (
    <SafeAreaView edges={[]} style={styles.screen}>
      <StatusBar style="light" />
      <View style={styles.screen}>
        <Image source={backgroundSource} resizeMode="cover" style={styles.backgroundImage} />
        <LinearGradient colors={["rgba(24, 26, 32, 0.12)", "rgba(24, 26, 32, 0.2)", "rgba(24, 26, 32, 0.48)"]} style={styles.backgroundOverlay} />
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.foreground}>
          <ScrollView
            ref={scrollRef}
            bounces={false}
            contentContainerStyle={[styles.content, emailFormVisible ? styles.contentExpanded : null, contentSpacing, { minHeight: availableHeight }]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            style={styles.foreground}
          >
          <AuthHero
            emailFormVisible={emailFormVisible}
            entrance={entrance}
            fitScale={fitScale}
            logoWidth={logoWidth}
            titleFontSize={titleFontSize}
          />

          <Animated.View
            style={[
              styles.actions,
              emailFormVisible ? styles.actionsExpanded : null,
              {
                gap: 11 * fitScale,
                opacity: entrance.restOpacity,
                transform: [{ translateY: entrance.restTranslateY }]
              }
            ]}
          >
            {emailFormVisible ? null : <FeatureStrip scale={fitScale} />}
            <AuthChoice busy={authBusy === "google"} icon="logo-google" label="Continue with Google" method="google" scale={fitScale} onSelect={(method) => runAuth(method, "new")} />
            <AppleAuthChoice busy={authBusy === "apple"} scale={fitScale} onPress={() => runAuth("apple", "new")} />
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
            {emailFormVisible && recovery.mode ? (
              <AuthRecoveryForm
                busy={recovery.busy}
                email={account.authEmail}
                message={recovery.message}
                mode={recovery.mode}
                onBack={recovery.close}
                onEmailChange={actions.setAuthEmail}
                onPasswordChange={recovery.setPassword}
                onSubmit={recovery.submit}
                onTokenChange={recovery.setToken}
                password={recovery.password}
                token={recovery.token}
              />
            ) : emailFormVisible ? (
              <EmailAuthForm
                busy={authBusy === "email"}
                email={account.authEmail}
                error={authError}
                mode={account.authMode}
                name={account.authName}
                onEmailChange={actions.setAuthEmail}
                onForgotPassword={recovery.openForgot}
                onModeChange={actions.setAuthMode}
                onNameChange={actions.setAuthName}
                onPasswordChange={actions.setAuthPassword}
                onReferralCodeChange={actions.setAuthReferralCode}
                onResendVerification={resendVerification}
                onSubmit={submitEmailAuth}
                password={account.authPassword}
                referralCode={account.authReferralCode}
                scale={fitScale}
              />
            ) : authError ? (
              <Text style={styles.authError}>{authError}</Text>
            ) : null}
            <AuthLegalLinks scale={fitScale} />
          </Animated.View>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </SafeAreaView>
  );
}
