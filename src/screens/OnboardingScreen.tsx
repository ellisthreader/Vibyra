import { Ionicons } from "@expo/vector-icons";
import { StatusBar } from "expo-status-bar";
import React from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinkButton, PrimaryButton } from "../components/Buttons";
import { VibyraLogo } from "../components/VibyraLogo";
import { colors } from "../styles/theme";
import { useAppContext } from "../context/AppContext";

export function OnboardingScreen() {
  const app = useAppContext();

  return (
    <SafeAreaView style={styles.shell}>
      <StatusBar style="light" />
      <View style={styles.onboarding}>
        <VibyraLogo />
        <Text style={styles.promise}>Your AI software studio, anywhere.</Text>

        <View style={styles.pairPanel}>
          <View style={styles.prereqRow}>
            <Ionicons name="desktop-outline" color={colors.amber} size={19} />
            <View style={styles.rowContent}>
              <Text style={styles.rowTitle}>Open Vibyra Desktop</Text>
              <Text style={styles.rowMeta}>{app.pairingMessage}</Text>
            </View>
          </View>

          <View style={styles.codeHalo}>
            <Text style={styles.codeLabel}>Pairing key</Text>
          </View>
          <TextInput
            value={app.pairCode}
            onChangeText={(value) => app.setPairCode(value.toUpperCase())}
            placeholder="Pair code"
            placeholderTextColor={colors.dim}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={6}
            style={[styles.input, styles.pairInput, styles.pairCodeInput]}
          />

          <LinkButton
            icon="search-outline"
            label={app.checkingHealth ? "Finding Vibyra..." : "Find Vibyra"}
            onPress={app.testDesktopConnection}
          />
          {app.healthMessage ? <Text style={styles.healthText}>{app.healthMessage}</Text> : null}
          <PairCode code={app.pairCode} />
          {app.pairingError ? <Text style={styles.errorText}>{app.pairingError}</Text> : null}
          <PairAction />
        </View>

        <View style={styles.onboardingFooter}>
          <Ionicons name="shield-checkmark-outline" color={colors.success} size={18} />
          <Text style={styles.mutedText}>Trusted devices only via Vibyra pairing</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

function PairAction() {
  const app = useAppContext();
  if (!app.pendingPhoneApproval) {
    return (
      <PrimaryButton
        icon="link-outline"
        label={app.pairing ? "Finding Vibyra..." : "Pair phone"}
        onPress={app.pairMachine}
      />
    );
  }

  return (
    <View style={styles.phonePermission}>
      <Ionicons name="shield-checkmark-outline" color={colors.success} size={22} />
      <Text style={styles.rowTitle}>Allow {app.pendingPhoneApproval.machineName}?</Text>
      <Text style={styles.rowMeta}>
        Vibyra can show projects, receive prompts, run approved commands, and send live updates.
      </Text>
      <PrimaryButton icon="checkmark-circle-outline" label="Allow Vibyra" onPress={app.confirmPhonePermission} />
    </View>
  );
}

function PairCode({ code }: { code: string }) {
  return (
    <View style={styles.pairCodeRow}>
      {(code || "------").padEnd(6, "-").slice(0, 6).split("").map((char, index) => (
        <View key={`${char}-${index}`} style={styles.pairCodeCell}>
          <Text style={styles.pairCodeText}>{char === "-" ? "" : char}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  codeHalo: {
    alignItems: "center",
    backgroundColor: colors.magentaSoft,
    borderColor: colors.magenta,
    borderRadius: 8,
    borderWidth: 1,
    height: 38,
    justifyContent: "center",
    paddingHorizontal: 14
  },
  codeLabel: { color: colors.magenta, fontSize: 11, fontWeight: "900", textTransform: "uppercase" },
  errorText: { color: colors.error, fontSize: 13, fontWeight: "700", marginBottom: 10, textAlign: "center" },
  healthText: { color: colors.muted, fontSize: 12, fontWeight: "700", lineHeight: 17, marginTop: 8, textAlign: "center" },
  input: {
    backgroundColor: colors.elevated,
    borderColor: colors.borderStrong,
    borderRadius: 8,
    borderWidth: 1,
    color: colors.text,
    fontSize: 16,
    minHeight: 52,
    paddingHorizontal: 14,
    paddingVertical: 12
  },
  mutedText: { color: colors.muted, fontSize: 14, fontWeight: "600" },
  onboarding: { alignItems: "center", backgroundColor: colors.background, flex: 1, justifyContent: "center", padding: 22 },
  onboardingFooter: { alignItems: "center", flexDirection: "row", gap: 8, marginTop: 18 },
  pairCodeCell: {
    alignItems: "center",
    backgroundColor: colors.accentSoft,
    borderColor: colors.accent,
    borderRadius: 8,
    borderWidth: 1,
    height: 42,
    justifyContent: "center",
    width: 38
  },
  pairCodeInput: { fontSize: 18, fontWeight: "800", textAlign: "center" },
  pairCodeRow: { flexDirection: "row", gap: 8, marginBottom: 14, marginTop: 12 },
  pairCodeText: { color: colors.text, fontSize: 18, fontWeight: "800" },
  pairInput: { alignSelf: "stretch", marginTop: 12, width: "100%" },
  pairPanel: {
    alignItems: "center",
    alignSelf: "stretch",
    backgroundColor: "rgba(16, 16, 20, 0.94)",
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 34,
    padding: 20
  },
  phonePermission: {
    alignItems: "center",
    alignSelf: "stretch",
    backgroundColor: colors.elevated,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: 10,
    marginTop: 4,
    padding: 14
  },
  prereqRow: { alignItems: "center", alignSelf: "stretch", flexDirection: "row", gap: 10, marginBottom: 18 },
  promise: { color: colors.muted, fontSize: 18, fontWeight: "700", marginTop: -8, textAlign: "center" },
  rowContent: { flex: 1, minWidth: 0 },
  rowMeta: { color: colors.muted, fontSize: 13, fontWeight: "600", marginTop: 3, textAlign: "center" },
  rowTitle: { color: colors.text, fontSize: 15, fontWeight: "800", textAlign: "center" },
  shell: { backgroundColor: colors.background, flex: 1 }
});
