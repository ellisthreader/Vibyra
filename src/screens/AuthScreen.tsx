import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import React from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { PrimaryButton } from "../components/Buttons";
import { SegmentedControl } from "../components/SegmentedControl";
import { VibyraLogo } from "../components/VibyraLogo";
import { useAppContext } from "../context/AppContext";
import { colors } from "../styles/theme";

export function AuthScreen() {
  const app = useAppContext();
  const title = app.authMode === "login" ? "Welcome back" : "Create your account";
  const subtitle = app.authMode === "login"
    ? "Sign in to continue building with Vibyra."
    : "Start with Apple, Google, or your email.";

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar style="light" />
      <LinearGradient colors={["#120F1A", "#07070A", "#07070A"]} style={styles.screen}>
        <View style={styles.content}>
          <View style={styles.hero}>
            <VibyraLogo />
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.subtitle}>{subtitle}</Text>
          </View>

          <View style={styles.card}>
            <SegmentedControl
              selected={app.authMode}
              values={["login", "signup"]}
              onChange={app.setAuthMode}
            />
            <View style={styles.socialStack}>
              <AuthProviderButton icon="logo-apple" label="Continue with Apple" onPress={() => app.authenticateWith("apple")} />
              <AuthProviderButton icon="logo-google" label="Continue with Google" onPress={() => app.authenticateWith("google")} />
            </View>
            <View style={styles.dividerRow}>
              <View style={styles.divider} />
              <Text style={styles.dividerText}>or use email</Text>
              <View style={styles.divider} />
            </View>
            {app.authMode === "signup" ? (
              <AuthInput label="Full name" value={app.authName} onChangeText={app.setAuthName} placeholder="Your name" />
            ) : null}
            <AuthInput label="Email" value={app.authEmail} onChangeText={app.setAuthEmail} placeholder="name@example.com" />
            <AuthInput label="Password" value={app.authPassword} onChangeText={app.setAuthPassword} placeholder="Password" secureTextEntry />
            <PrimaryButton
              icon={app.authMode === "login" ? "log-in-outline" : "person-add-outline"}
              label={app.authMode === "login" ? "Sign in" : "Create account"}
              onPress={() => app.authenticateWith("email")}
            />
            <Text style={styles.caption}>
              By continuing, you agree to the Terms and acknowledge the Privacy Policy.
            </Text>
          </View>
        </View>
      </LinearGradient>
    </SafeAreaView>
  );
}

function AuthInput(props: { label: string; value: string; onChangeText: (value: string) => void; placeholder: string; secureTextEntry?: boolean; }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{props.label}</Text>
      <TextInput
        value={props.value}
        onChangeText={props.onChangeText}
        placeholder={props.placeholder}
        placeholderTextColor={colors.dim}
        autoCapitalize="none"
        secureTextEntry={props.secureTextEntry}
        style={styles.input}
      />
    </View>
  );
}

function AuthProviderButton(props: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; }) {
  return (
    <Pressable onPress={props.onPress} style={styles.providerButton}>
      <Ionicons name={props.icon} size={18} color={colors.text} />
      <Text style={styles.providerText}>{props.label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  caption: { color: colors.dim, fontSize: 12, lineHeight: 18, textAlign: "center" },
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 16, borderWidth: 1, gap: 16, padding: 20 },
  content: { flex: 1, justifyContent: "center", padding: 20 },
  divider: { backgroundColor: colors.border, flex: 1, height: 1 },
  dividerRow: { alignItems: "center", flexDirection: "row", gap: 10 },
  dividerText: { color: colors.dim, fontSize: 12, fontWeight: "600" },
  field: { gap: 8 },
  hero: { alignItems: "center", gap: 8, marginBottom: 28 },
  input: {
    backgroundColor: colors.elevated,
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    color: colors.text,
    fontSize: 15,
    minHeight: 48,
    paddingHorizontal: 14
  },
  label: { color: colors.muted, fontSize: 13, fontWeight: "700" },
  providerButton: {
    alignItems: "center",
    backgroundColor: "#171722",
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    height: 48,
    justifyContent: "center"
  },
  providerText: { color: colors.text, fontSize: 15, fontWeight: "700" },
  screen: { backgroundColor: colors.background, flex: 1 },
  socialStack: { gap: 10 },
  subtitle: { color: colors.muted, fontSize: 15, lineHeight: 22, textAlign: "center" },
  title: { color: colors.text, fontSize: 30, fontWeight: "700" }
});
