import "react-native-gesture-handler";
import { StatusBar } from "expo-status-bar";
import React from "react";
import { StyleSheet } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { AppProvider, useAppContext } from "./src/context/AppContext";
import { AuthScreen } from "./src/screens/AuthScreen";
import { OnboardingScreen } from "./src/screens/OnboardingScreen";
import { WorkspaceScreen } from "./src/screens/WorkspaceScreen";
import { colors } from "./src/styles/theme";

function AppContent() {
  const app = useAppContext();

  if (!app.authenticated) {
    return <AuthScreen />;
  }

  if (!app.onboardingComplete) {
    return <OnboardingScreen />;
  }

  return (
    <SafeAreaView edges={["top", "left", "right"]} style={styles.shell}>
      <StatusBar style="light" />
      <WorkspaceScreen />
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <AppProvider>
          <AppContent />
        </AppProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1
  },
  shell: {
    backgroundColor: colors.background,
    flex: 1
  }
});
