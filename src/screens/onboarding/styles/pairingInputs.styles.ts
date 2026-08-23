import { StyleSheet } from "react-native";
import { colors } from "../../../styles/theme";

export const styleSource = {
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
      backgroundColor: "rgba(24, 26, 32, 0.94)",
      borderColor: colors.border,
      borderRadius: 16,
      borderWidth: 1,
      marginTop: 34,
      padding: 20
    }
} as const;
