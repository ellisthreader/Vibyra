import React, { useEffect, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { colors } from "../../../../styles/theme";
import { useAccountActions, useAccountSession } from "../../../../context/AccountContexts";
import { useDesktopConnection } from "../../../../context/DesktopContexts";
import { styles } from "../../styles";
import { ProfileSheet } from "./ProfileSheet";

export function EditProfileSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const account = useAccountSession();
  const { updateProfile } = useAccountActions();
  const desktop = useDesktopConnection();
  const [name, setName] = useState(account.authName);
  const [email, setEmail] = useState(account.authEmail);
  const [machine, setMachine] = useState(desktop.machineName);

  useEffect(() => {
    if (!visible) return;
    setName(account.authName === "Vibyra User" ? "" : account.authName);
    setEmail(account.authEmail);
    setMachine(desktop.machineName);
  }, [visible, account.authName, account.authEmail, desktop.machineName]);

  const canSave = name.trim().length > 0 && /.+@.+\..+/.test(email.trim());

  function save() {
    updateProfile({ name: name.trim(), email: email.trim(), machineName: machine.trim() || "iPhone" });
    onClose();
  }

  return (
    <ProfileSheet visible={visible} onClose={onClose} icon="person-circle-outline" kicker="Account" title="Profile information">
      <Field label="Display name" value={name} onChange={setName} placeholder="Your name" autoCapitalize="words" />
      <Field label="Email" value={email} onChange={setEmail} placeholder="you@vibyra.app" keyboardType="email-address" autoCapitalize="none" />
      <Field label="Device label" value={machine} onChange={setMachine} placeholder="iPhone" />
      <View style={styles.profileSheetActions}>
        <Pressable onPress={onClose} style={[styles.profileSheetSecondary, { flex: 1 }]}>
          <Text style={styles.profileSheetSecondaryText}>Cancel</Text>
        </Pressable>
        <Pressable disabled={!canSave} onPress={save} style={[styles.profileSheetPrimary, { flex: 1, opacity: canSave ? 1 : 0.4 }]}>
          <Ionicons name="checkmark" color={colors.text} size={18} />
          <Text style={styles.profileSheetPrimaryText}>Save changes</Text>
        </Pressable>
      </View>
    </ProfileSheet>
  );
}

function Field({ label, value, onChange, placeholder, keyboardType, autoCapitalize }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  keyboardType?: "default" | "email-address";
  autoCapitalize?: "none" | "words";
}) {
  return (
    <View style={styles.profileSheetField}>
      <Text style={styles.profileSheetFieldLabel}>{label}</Text>
      <TextInput
        autoCapitalize={autoCapitalize ?? "sentences"}
        autoCorrect={autoCapitalize === "none" ? false : undefined}
        keyboardType={keyboardType ?? "default"}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor="#747C8A"
        style={styles.profileSheetInput}
        value={value}
      />
    </View>
  );
}
