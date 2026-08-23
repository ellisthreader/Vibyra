import { StyleSheet } from "react-native";
import { colors } from "../../../styles/theme";

export const styleSource = {
  planIconRecommended: {
      transform: [{ scale: 1.05 }]
    },
  planIconImage: { height: 56, width: 56 },
  planCta: {
      alignItems: "center",
      backgroundColor: colors.accent,
      borderRadius: 12,
      flexDirection: "row",
      gap: 8,
      justifyContent: "center",
      marginTop: 16,
      minHeight: 46
    },
  planCtaPressed: {
      opacity: 0.82,
      transform: [{ scale: 0.99 }]
    },
  planCtaText: { color: colors.text, fontSize: 15, fontWeight: "900" },
  planPrice: { color: colors.amber, fontSize: 14, fontWeight: "900" },
  planName: { color: colors.text, fontSize: 18, fontWeight: "900" },
  planStack: { gap: 14, marginTop: 28 },
  planSummary: { color: colors.muted, fontSize: 14, fontWeight: "600", lineHeight: 20, marginTop: 14 },
  planTitleRow: { alignItems: "center", flexDirection: "row", gap: 8 }
} as const;
