import React from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";
import { emailStyles } from "./emailStyles";
import { styles } from "./styles";

export function EmailAuthForm({
  busy,
  email,
  error,
  mode,
  name,
  onEmailChange,
  onForgotPassword,
  onModeChange,
  onNameChange,
  onPasswordChange,
  onReferralCodeChange,
  onResendVerification,
  onSubmit,
  password,
  referralCode,
  scale
}: {
  busy: boolean;
  email: string;
  error: string;
  mode: "login" | "signup";
  name: string;
  onEmailChange: (value: string) => void;
  onForgotPassword: () => void;
  onModeChange: (mode: "login" | "signup") => void;
  onNameChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onReferralCodeChange: (value: string) => void;
  onResendVerification: () => void;
  onSubmit: () => void | Promise<void>;
  password: string;
  referralCode: string;
  scale: number;
}) {
  const inputHeight = Math.max(46, 50 * scale);
  const canSubmit = email.trim().length > 3 && password.length >= 6 && (mode === "login" || name.trim().length > 0);

  return (
    <View style={emailStyles.emailPanel}>
      <View style={emailStyles.emailModeRow}>
        {(["signup", "login"] as const).map((item) => {
          const active = mode === item;
          return (
            <Pressable
              key={item}
              onPress={() => onModeChange(item)}
              style={[emailStyles.emailModeButton, active ? emailStyles.emailModeButtonActive : null]}
            >
              <Text style={[emailStyles.emailModeText, active ? emailStyles.emailModeTextActive : null]}>{item === "signup" ? "Sign up" : "Log in"}</Text>
            </Pressable>
          );
        })}
      </View>
      {mode === "signup" ? (
        <TextInput
          autoCapitalize="words"
          autoComplete="name"
          onChangeText={onNameChange}
          placeholder="Your name"
          placeholderTextColor="#8F84A8"
          style={[emailStyles.emailInput, { height: inputHeight }]}
          value={name}
        />
      ) : null}
      <TextInput
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        onChangeText={onEmailChange}
        placeholder="Email address"
        placeholderTextColor="#8F84A8"
        style={[emailStyles.emailInput, { height: inputHeight }]}
        value={email}
      />
      <TextInput
        autoCapitalize="none"
        autoComplete={mode === "login" ? "current-password" : "new-password"}
        onChangeText={onPasswordChange}
        onSubmitEditing={canSubmit ? onSubmit : undefined}
        placeholder="Password"
        placeholderTextColor="#8F84A8"
        secureTextEntry
        style={[emailStyles.emailInput, { height: inputHeight }]}
        value={password}
      />
      {mode === "login" ? (
        <View style={emailStyles.emailModeRow}>
          <Pressable onPress={onForgotPassword}>
            <Text style={styles.recoveryLink}>Forgot password?</Text>
          </Pressable>
          <Pressable onPress={onResendVerification}>
            <Text style={styles.recoveryLink}>Resend verification</Text>
          </Pressable>
        </View>
      ) : null}
      {mode === "signup" ? (
        <TextInput
          autoCapitalize="characters"
          autoComplete="off"
          onChangeText={onReferralCodeChange}
          placeholder="Invite code (optional)"
          placeholderTextColor="#8F84A8"
          style={[emailStyles.emailInput, { height: inputHeight }]}
          value={referralCode}
        />
      ) : null}
      {error ? <Text style={styles.authError}>{error}</Text> : null}
      <Pressable
        disabled={!canSubmit || busy}
        onPress={onSubmit}
        style={[emailStyles.emailSubmitButton, !canSubmit || busy ? emailStyles.emailSubmitButtonDisabled : null]}
      >
        {busy ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Text style={emailStyles.emailSubmitText}>{mode === "signup" ? "Create account" : "Log in"}</Text>}
      </Pressable>
    </View>
  );
}
