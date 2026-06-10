import React from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";
import { emailStyles } from "./emailStyles";
import { styles } from "./styles";

export function AuthRecoveryForm({
  busy,
  email,
  message,
  mode,
  password,
  token,
  onBack,
  onEmailChange,
  onPasswordChange,
  onSubmit,
  onTokenChange
}: {
  busy: boolean;
  email: string;
  message: string;
  mode: "forgot" | "reset";
  password: string;
  token: string;
  onBack: () => void;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onSubmit: () => void;
  onTokenChange: (value: string) => void;
}) {
  const canSubmit = email.trim().length > 3 && (mode === "forgot" || (token.length > 10 && password.length >= 8));

  return (
    <View style={emailStyles.emailPanel}>
      <Text style={styles.recoveryTitle}>{mode === "forgot" ? "Reset password" : "Choose a new password"}</Text>
      <TextInput
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        onChangeText={onEmailChange}
        placeholder="Email address"
        placeholderTextColor="#8F84A8"
        style={emailStyles.emailInput}
        value={email}
      />
      {mode === "reset" ? (
        <>
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={onTokenChange}
            placeholder="Reset token"
            placeholderTextColor="#8F84A8"
            style={emailStyles.emailInput}
            value={token}
          />
          <TextInput
            autoCapitalize="none"
            autoComplete="new-password"
            onChangeText={onPasswordChange}
            placeholder="New password"
            placeholderTextColor="#8F84A8"
            secureTextEntry
            style={emailStyles.emailInput}
            value={password}
          />
        </>
      ) : null}
      {message ? <Text style={styles.recoveryMessage}>{message}</Text> : null}
      <Pressable
        disabled={!canSubmit || busy}
        onPress={onSubmit}
        style={[emailStyles.emailSubmitButton, !canSubmit || busy ? emailStyles.emailSubmitButtonDisabled : null]}
      >
        {busy ? <ActivityIndicator color="#FFFFFF" size="small" /> : (
          <Text style={emailStyles.emailSubmitText}>{mode === "forgot" ? "Send reset link" : "Reset password"}</Text>
        )}
      </Pressable>
      <Pressable disabled={busy} onPress={onBack}>
        <Text style={styles.recoveryLink}>Back to login</Text>
      </Pressable>
    </View>
  );
}
