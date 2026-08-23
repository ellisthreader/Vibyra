import "react-native-gesture-handler";
import { StatusBar } from "expo-status-bar";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Pressable, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as LocalAuthentication from "expo-local-authentication";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { AppProvider, useAppContext } from "./src/context/AppContext";
import { PreferencesProvider, usePreferences, LIGHT_SHELL_BG, DARK_SHELL_BG } from "./src/context/PreferencesContext";
import { LoadingScreen } from "./src/components/LoadingScreen";
import { AuthScreen } from "./src/screens/AuthScreen";
import { OnboardingScreen } from "./src/screens/OnboardingScreen";
import { WorkspaceScreen } from "./src/screens/WorkspaceScreen";
import { setStylesScheme } from "./src/screens/workspace/styles";

function AppContent() {
  const app = useAppContext();
  const prefs = usePreferences();
  const [appUnlocked, setAppUnlocked] = useState(false);
  const [authenticating, setAuthenticating] = useState(false);
  const appState = useRef(AppState.currentState);

  const unlockApp = useCallback(async () => {
    if (!prefs.appLockEnabled || !app.authenticated || authenticating) return;
    setAuthenticating(true);
    try {
      const available = await appLockAvailable();
      if (!available) {
        setAppUnlocked(true);
        return;
      }
      const result = await LocalAuthentication.authenticateAsync({
        cancelLabel: "Cancel",
        disableDeviceFallback: false,
        fallbackLabel: "Use passcode",
        promptMessage: "Unlock Vibyra"
      });
      if (result.success) setAppUnlocked(true);
    } finally {
      setAuthenticating(false);
    }
  }, [app.authenticated, authenticating, prefs.appLockEnabled]);

  useEffect(() => {
    if (!prefs.appLockEnabled || !app.authenticated) {
      setAppUnlocked(true);
      return;
    }
    if (!appUnlocked) void unlockApp();
  }, [app.authenticated, appUnlocked, prefs.appLockEnabled, unlockApp]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      const wasBackground = appState.current.match(/inactive|background/);
      appState.current = nextState;
      if (wasBackground && nextState === "active" && prefs.appLockEnabled && app.authenticated) {
        setAppUnlocked(false);
      }
    });
    return () => subscription.remove();
  }, [app.authenticated, prefs.appLockEnabled]);

  const isLight = prefs.effectiveScheme === "light";
  const shellBg = isLight ? LIGHT_SHELL_BG : DARK_SHELL_BG;
  setStylesScheme(prefs.effectiveScheme);

  if (!app.persistenceReady || !prefs.preferencesReady) {
    return (
      <SafeAreaView edges={["top", "left", "right"]} style={[styles.shell, { backgroundColor: shellBg }]}>
        <StatusBar style={isLight ? "dark" : "light"} />
        <LoadingScreen colors={prefs.colors} message="Preparing your workspace." scheme={prefs.effectiveScheme} />
      </SafeAreaView>
    );
  }

  if (!app.authenticated) {
    return <AuthScreen />;
  }

  if (!app.onboardingComplete || (!app.pcSetupComplete && !app.pcSetupSkipped)) {
    return <OnboardingScreen />;
  }

  if (prefs.appLockEnabled && !appUnlocked && authenticating) {
    return (
      <SafeAreaView edges={["top", "left", "right"]} style={[styles.shell, { backgroundColor: shellBg }]}>
        <StatusBar style={isLight ? "dark" : "light"} />
        <LoadingScreen colors={prefs.colors} message="Checking your device lock." scheme={prefs.effectiveScheme} />
      </SafeAreaView>
    );
  }

  if (prefs.appLockEnabled && !appUnlocked) {
    return (
      <SafeAreaView edges={["top", "left", "right"]} style={[styles.shell, styles.lockShell, { backgroundColor: shellBg }]}>
        <StatusBar style={isLight ? "dark" : "light"} />
        <View style={styles.lockContent}>
          <View style={[styles.lockIcon, { backgroundColor: prefs.colors.accentSoft }]}>
            <Ionicons name="lock-closed-outline" color={prefs.colors.accent} size={26} />
          </View>
          <Text style={[styles.lockTitle, { color: prefs.colors.text }]}>Vibyra is locked</Text>
          <Text style={[styles.lockText, { color: prefs.colors.muted }]}>Authenticate with Face ID, Touch ID, or your device passcode to continue.</Text>
          <Pressable onPress={() => { void unlockApp(); }} style={({ pressed }) => [styles.lockButton, { backgroundColor: pressed ? prefs.colors.actionPressed : prefs.colors.action }]}>
            <Ionicons name="finger-print-outline" color={prefs.colors.onAction} size={18} />
            <Text style={[styles.lockButtonText, { color: prefs.colors.onAction }]}>{authenticating ? "Checking..." : "Unlock"}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={["top", "left", "right"]} style={[styles.shell, { backgroundColor: shellBg }]}>
      <StatusBar style={isLight ? "dark" : "light"} />
      <WorkspaceScreen />
    </SafeAreaView>
  );
}

async function appLockAvailable() {
  const [hasHardware, isEnrolled] = await Promise.all([
    LocalAuthentication.hasHardwareAsync(),
    LocalAuthentication.isEnrolledAsync()
  ]);
  return hasHardware && isEnrolled;
}

export default function App() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <PreferencesProvider>
          <AppProvider>
            <AppContent />
          </AppProvider>
        </PreferencesProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1
  },
  shell: {
    flex: 1
  },
  lockShell: {
    justifyContent: "center"
  },
  lockContent: {
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 30
  },
  lockIcon: {
    alignItems: "center",
    borderRadius: 999,
    height: 58,
    justifyContent: "center",
    width: 58
  },
  lockTitle: {
    fontSize: 22,
    fontWeight: "900"
  },
  lockText: {
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 20,
    maxWidth: 300,
    textAlign: "center"
  },
  lockButton: {
    alignItems: "center",
    borderRadius: 14,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    marginTop: 8,
    minHeight: 50,
    minWidth: 148,
    paddingHorizontal: 18
  },
  lockButtonText: {
    fontSize: 15,
    fontWeight: "900"
  }
});
