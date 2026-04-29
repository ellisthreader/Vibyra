import { StatusBar } from "expo-status-bar";
import React from "react";
import { StyleSheet } from "react-native";
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

  if (!app.paired) {
    return <OnboardingScreen />;
  }

  return (
    <SafeAreaView style={styles.shell}>
      <StatusBar style="light" />
      <WorkspaceScreen />
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AppProvider>
        <AppContent />
      </AppProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  shell: {
    backgroundColor: colors.background,
    flex: 1
  }
});
