import React from "react";
import { ActivityIndicator, Pressable, Text } from "react-native";
import { AuthProviderIcon } from "./AuthProviderIcon";
import { AuthMethod, IconName } from "./types";
import { styles } from "./styles";

export function AuthChoice({
  busy,
  icon,
  label,
  method,
  scale,
  onSelect
}: {
  busy?: boolean;
  icon: IconName;
  label: string;
  method: AuthMethod;
  scale: number;
  onSelect: (method: AuthMethod) => void | Promise<void>;
}) {
  const buttonHeight = Math.max(48, 56 * scale);
  const labelSize = Math.max(14.5, 17 * scale);

  return (
    <Pressable
      disabled={busy}
      style={({ pressed }) => [
        styles.authChoice,
        { gap: 28 * scale, height: buttonHeight, paddingHorizontal: 24 * scale },
        pressed ? styles.authChoicePressed : null,
        busy ? styles.authChoiceBusy : null
      ]}
      onPress={() => onSelect(method)}
    >
      {busy ? (
        <ActivityIndicator color="#E8D8FF" size="small" style={{ width: 40 * scale }} />
      ) : (
        <AuthProviderIcon icon={icon} method={method} scale={scale} />
      )}
      <Text style={[styles.authChoiceText, { fontSize: labelSize, minWidth: 190 * scale }]}>{label}</Text>
    </Pressable>
  );
}
