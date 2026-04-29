import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { StyleSheet, Text, TouchableOpacity } from "react-native";
import { colors } from "../styles/theme";

type IconName = keyof typeof Ionicons.glyphMap;

type ButtonProps = {
  icon: IconName;
  label: string;
  onPress: () => void;
};

export function PrimaryButton({ icon, label, onPress }: ButtonProps) {
  return (
    <TouchableOpacity style={styles.primaryButton} onPress={onPress} activeOpacity={0.86}>
      <LinearGradient
        colors={[colors.accent, colors.magenta, colors.amber]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.primaryFill}
      >
        <Ionicons name={icon} color={colors.text} size={19} />
        <Text style={styles.primaryButtonText}>{label}</Text>
      </LinearGradient>
    </TouchableOpacity>
  );
}

export function IconButton({ icon, label, onPress }: ButtonProps) {
  return (
    <TouchableOpacity
      accessibilityLabel={label}
      style={styles.iconButton}
      onPress={onPress}
      activeOpacity={0.86}
    >
      <Ionicons name={icon} color={colors.text} size={18} />
    </TouchableOpacity>
  );
}

export function LinkButton({ icon, label, onPress }: ButtonProps) {
  return (
    <TouchableOpacity style={styles.linkButton} onPress={onPress} activeOpacity={0.86}>
      <Ionicons name={icon} color={colors.text} size={18} />
      <Text style={styles.linkButtonText}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  iconButton: {
    alignItems: "center",
    backgroundColor: colors.elevated,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    height: 40,
    justifyContent: "center",
    width: 40
  },
  linkButton: {
    alignItems: "center",
    alignSelf: "stretch",
    backgroundColor: colors.magentaSoft,
    borderColor: colors.magenta,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    height: 44,
    justifyContent: "center",
    marginTop: 10
  },
  linkButtonText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "800"
  },
  primaryButton: {
    borderRadius: 8,
    height: 52,
    overflow: "hidden",
    width: "100%"
  },
  primaryFill: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    height: "100%",
    justifyContent: "center",
    width: "100%"
  },
  primaryButtonText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "800"
  }
});
