import "react-native-gesture-handler";
import { StatusBar } from "expo-status-bar";
import React from "react";
import { StyleSheet } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { AppProvider, useAppContext } from "./src/context/AppContext";
import { PreferencesProvider, usePreferences, LIGHT_SHELL_BG, DARK_SHELL_BG } from "./src/context/PreferencesContext";
import { AuthScreen } from "./src/screens/AuthScreen";
import { OnboardingScreen } from "./src/screens/OnboardingScreen";
import { WorkspaceScreen } from "./src/screens/WorkspaceScreen";
import { setStylesScheme } from "./src/screens/workspace/styles";

function AppContent() {
  const app = useAppContext();
  const prefs = usePreferences();

  // FORCE_LOGOUT_ONCE: temporary — clears persisted session on app boot so the login screen shows.
  // Remove this effect once you've reached the Google/Apple/email screen.
  React.useEffect(() => {
    if (app.persistenceReady && app.authenticated) {
      app.signOut();
    }
  }, [app.persistenceReady]);

  if (!app.persistenceReady || !prefs.preferencesReady) return null;

  setStylesScheme(prefs.effectiveScheme);
  const isLight = prefs.effectiveScheme === "light";
  const shellBg = isLight ? LIGHT_SHELL_BG : DARK_SHELL_BG;

  if (!app.authenticated) {
    return <AuthScreen key={prefs.effectiveScheme} />;
  }

  // QUIZ_TEMP_DISABLED: original gate was `!app.onboardingComplete || !app.pcSetupComplete`.
  // While the quiz is bypassed we only gate on PC setup so fresh users land directly on WelcomeConnect.
  if (!app.pcSetupComplete) {
    return <OnboardingScreen key={prefs.effectiveScheme} />;
  }

  return (
    <SafeAreaView edges={["top", "left", "right"]} style={[styles.shell, { backgroundColor: shellBg }]}>
      <StatusBar style={isLight ? "dark" : "light"} />
      <WorkspaceScreen key={prefs.effectiveScheme} />
    </SafeAreaView>
  );
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
  }
});
