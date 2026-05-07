import { StyleSheet } from "react-native";
import { colors } from "../../../styles/theme";

export const part11 = {
  outcomeNumberText: { color: colors.amber, fontSize: 13, fontWeight: "900" },
  outcomeRow: {
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.035)",
    borderColor: "rgba(255, 255, 255, 0.06)",
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12
  },
  outcomeStack: { gap: 10, marginTop: 16, width: "100%" },
  outcomeText: { color: colors.text, flex: 1, fontSize: 15, fontWeight: "700", lineHeight: 21 },
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
    backgroundColor: "rgba(18, 18, 26, 0.94)",
    borderColor: colors.border,
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 34,
    padding: 20
  },
  phonePermission: {
    alignItems: "center",
    alignSelf: "stretch",
    backgroundColor: colors.elevated,
    borderColor: colors.border,
    borderRadius: 16,
    borderWidth: 1,
    gap: 10,
    marginTop: 4,
    padding: 14
  },
  planCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 16,
    borderWidth: 1,
    padding: 18
  },
  planCardRecommended: {
    backgroundColor: "rgba(23, 23, 34, 0.96)",
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
  },
};
