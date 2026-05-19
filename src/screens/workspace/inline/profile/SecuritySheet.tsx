import React, { useEffect, useState } from "react";
import { Linking, Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as LocalAuthentication from "expo-local-authentication";
import { usePreferences } from "../../../../context/PreferencesContext";
import { styles } from "../../styles";
import { ProfileSheet } from "./ProfileSheet";
import { ToggleRow } from "./ToggleRow";

export function SecuritySheet({ visible, onClose }: {
  visible: boolean;
  onClose: () => void;
}) {
  const prefs = usePreferences();
  const [lockMessage, setLockMessage] = useState("");

  useEffect(() => {
    if (!visible) return;
    setLockMessage("");
  }, [visible]);

  function openPrivacyPolicy() {
    Linking.openURL("https://vibyra.app/legal/privacy").catch(() => undefined);
  }

  async function setAppLock(next: boolean) {
    setLockMessage("");
    if (!next) {
      prefs.setAppLockEnabled(false);
      return;
    }
    const available = await appLockAvailable();
    if (!available) {
      setLockMessage("Set up Face ID, Touch ID, or a device passcode to use App lock on this device.");
      return;
    }
    const result = await LocalAuthentication.authenticateAsync({
      cancelLabel: "Cancel",
      disableDeviceFallback: false,
      fallbackLabel: "Use passcode",
      promptMessage: "Enable Vibyra app lock"
    });
    if (result.success) prefs.setAppLockEnabled(true);
    else setLockMessage("App lock was not enabled.");
  }

  return (
    <ProfileSheet visible={visible} onClose={onClose} icon="shield-checkmark-outline" kicker="Preferences" title="Privacy & security">
      <SecurityInfoRow
        icon="phone-portrait-outline"
        subtitle="Cached chats, projects, desktop sessions, and generated files stay on this device until you clear cache."
        title="Local data"
      />
      <ToggleRow
        icon="analytics-outline"
        onChange={prefs.setImproveVibyra}
        subtitle="Share anonymous usage signals to help improve reliability and product decisions."
        title="Improve Vibyra"
        value={prefs.improveVibyra}
      />
      <ToggleRow
        icon="finger-print-outline"
        onChange={setAppLock}
        subtitle="Require Face ID, Touch ID, or device passcode when opening Vibyra."
        title="App lock"
        value={prefs.appLockEnabled}
      />
      {lockMessage ? <Text style={styles.profileSheetMuted}>{lockMessage}</Text> : null}
      <Pressable onPress={openPrivacyPolicy} style={({ pressed }) => [styles.profileToggleRow, pressed ? styles.securityRowPressed : null]}>
        <View style={styles.profileToggleIcon}><Ionicons name="lock-closed-outline" color="#C259FF" size={20} /></View>
        <View style={styles.profileToggleCopy}>
          <Text style={styles.profileToggleTitle}>Privacy policy</Text>
          <Text style={styles.profileToggleSubtitle}>What Vibyra collects and how it is used.</Text>
        </View>
        <Ionicons name="open-outline" color="#9C97AE" size={18} />
      </Pressable>
    </ProfileSheet>
  );
}

async function appLockAvailable() {
  const [hasHardware, isEnrolled] = await Promise.all([
    LocalAuthentication.hasHardwareAsync(),
    LocalAuthentication.isEnrolledAsync()
  ]);
  return hasHardware && isEnrolled;
}

function SecurityInfoRow({ icon, subtitle, title }: {
  icon: keyof typeof Ionicons.glyphMap;
  subtitle: string;
  title: string;
}) {
  return (
    <View style={styles.profileToggleRow}>
      <View style={styles.profileToggleIcon}><Ionicons name={icon} color="#C259FF" size={20} /></View>
      <View style={styles.profileToggleCopy}>
        <Text style={styles.profileToggleTitle}>{title}</Text>
        <Text style={styles.profileToggleSubtitle}>{subtitle}</Text>
      </View>
    </View>
  );
}
