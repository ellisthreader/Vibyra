import { StyleSheet } from "react-native";
import { colors } from "../../../styles/theme";

export const styleSource = {
  planCard: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: 16,
      borderWidth: 1,
      padding: 18
    },
  planCardRecommended: {
      backgroundColor: "rgba(24, 26, 32, 0.96)",
      borderColor: colors.amber,
      borderWidth: 1.5
    },
  planCardSelected: {
      borderColor: colors.accent,
      transform: [{ scale: 1.01 }]
    },
  planCopy: { flex: 1, gap: 3, minWidth: 0 },
  planDetailLabel: { color: colors.dim, fontSize: 12, fontWeight: "800", textTransform: "uppercase" },
  planDetailRow: {
      alignItems: "flex-start",
      borderTopColor: "rgba(255, 255, 255, 0.06)",
      borderTopWidth: 1,
      gap: 4,
      paddingTop: 10
    },
  planDetails: {
      backgroundColor: "rgba(255, 255, 255, 0.035)",
      borderColor: "rgba(255, 255, 255, 0.07)",
      borderRadius: 14,
      borderWidth: 1,
      gap: 10,
      marginTop: 14,
      padding: 14
    },
  planDetailsTitle: { color: colors.text, fontSize: 14, fontWeight: "900", marginBottom: 2 },
  planDetailValue: { color: colors.text, fontSize: 14, fontWeight: "800", lineHeight: 19 },
  planHeader: { alignItems: "center", flexDirection: "row", gap: 12 },
  planIcon: {
      alignItems: "center",
      height: 58,
      justifyContent: "center",
      width: 58
    }
} as const;
