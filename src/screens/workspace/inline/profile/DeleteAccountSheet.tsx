import React, { useEffect, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useAccountActions, useAccountSession } from "../../../../context/AccountContexts";
import { usePreferences, useThemedColor } from "../../../../context/PreferencesContext";
import { appApiRequest, RemoteUser } from "../../../../utils/appApi";
import { styles } from "../../styles";
import { ProfileSheet } from "./ProfileSheet";

export function DeleteAccountSheet({ visible, onCancel }: { visible: boolean; onCancel: () => void }) {
  const account = useAccountSession();
  const actions = useAccountActions();
  const prefs = usePreferences();
  const dangerIconColor = useThemedColor("#FF6478");
  const [confirmation, setConfirmation] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [provider, setProvider] = useState<RemoteUser["provider"]>("email");
  const requiresPassword = provider === "email";
  const canDelete = confirmation.trim().toUpperCase() === "DELETE"
    && (!requiresPassword || password.length > 0)
    && !deleting;
  const email = account.authEmail.trim() || "your Vibyra account";

  useEffect(() => {
    if (!visible) return;
    setConfirmation("");
    setPassword("");
    setError("");
    setDeleting(false);
    appApiRequest<{ user: RemoteUser }>("/api/session", {}, account.authToken)
      .then((result) => setProvider(result.user.provider ?? "email"))
      .catch(() => setProvider("email"));
  }, [account.authToken, visible]);

  async function confirm() {
    if (!canDelete || !account.authToken) return;
    setDeleting(true);
    setError("");
    try {
      await actions.deleteAccount(requiresPassword ? password : undefined);
      onCancel();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Could not delete account.";
      setError(message);
      setDeleting(false);
    }
  }

  return (
    <ProfileSheet visible={visible} onClose={onCancel} icon="person-remove-outline" kicker="Account" title="Delete account?">
      <Text style={styles.profileSheetText}>
        This permanently deletes <Text style={{ color: prefs.colors.text, fontWeight: "900" }}>{email}</Text>, including synced Vibyra app data.
      </Text>
      <Text style={styles.profileSheetMuted}>
        This cannot be undone. If you have an active subscription, manage cancellation from Billing before deleting your account.
      </Text>
      <Field label="Type DELETE to confirm" value={confirmation} onChange={setConfirmation} placeholder="DELETE" />
      {requiresPassword ? (
        <Field label="Password" value={password} onChange={setPassword} placeholder="Account password" secure />
      ) : (
        <Text style={styles.profileSheetMuted}>
          You will confirm with {provider === "apple" ? "Apple" : "Google"} before deletion.
        </Text>
      )}
      {error ? <Text style={styles.profileSheetMuted}>{error}</Text> : null}
      <View style={styles.profileSheetActionsStack}>
        <Pressable disabled={!canDelete} onPress={confirm} style={[styles.profileSheetDanger, { opacity: canDelete ? 1 : 0.42 }]}>
          <Ionicons name="person-remove-outline" color={dangerIconColor} size={18} />
          <Text style={styles.profileSheetDangerText}>{deleting ? "Deleting account..." : "Delete account"}</Text>
        </Pressable>
        <Pressable disabled={deleting} onPress={onCancel} style={styles.profileSheetSecondary}>
          <Text style={styles.profileSheetSecondaryText}>Keep account</Text>
        </Pressable>
      </View>
    </ProfileSheet>
  );
}

function Field({ label, value, onChange, placeholder, secure }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  secure?: boolean;
}) {
  return (
    <View style={styles.profileSheetField}>
      <Text style={styles.profileSheetFieldLabel}>{label}</Text>
      <TextInput
        autoCapitalize="none"
        autoCorrect={false}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor="#747C8A"
        secureTextEntry={secure}
        style={styles.profileSheetInput}
        value={value}
      />
    </View>
  );
}
