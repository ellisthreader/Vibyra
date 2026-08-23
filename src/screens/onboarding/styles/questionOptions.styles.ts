import { StyleSheet } from "react-native";
import { colors } from "../../../styles/theme";

export const styleSource = {
  option: {
      alignItems: "center",
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: 16,
      borderWidth: 1,
      gap: 8,
      justifyContent: "center",
      marginBottom: 12,
      minHeight: 124,
      padding: 12,
      position: "relative",
      width: "46%"
    },
  optionCheck: {
      position: "absolute",
      right: 10,
      top: 10
    },
  optionCopy: { alignItems: "center", minWidth: 0 },
  optionIcon: {
      height: 52,
      width: 52
    },
  persistentBackdrop: {
      ...StyleSheet.absoluteFillObject,
      overflow: "hidden"
    },
  optionIconShell: {
      alignItems: "center",
      height: 56,
      justifyContent: "center",
      width: 56
    },
  optionIconShellSelected: {
      transform: [{ scale: 1.04 }]
    },
  optionPressed: {
      transform: [{ scale: 0.98 }]
    },
  optionSelected: {
      backgroundColor: "#181A20",
      borderColor: colors.accent
    },
  optionStack: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "space-between",
      marginTop: 26
    },
  optionTitle: { color: colors.text, fontSize: 15, fontWeight: "800", textAlign: "center" }
} as const;
