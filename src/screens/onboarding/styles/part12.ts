import { StyleSheet } from "react-native";
import { colors } from "../../../styles/theme";

export const part12 = {
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
  planTitleRow: { alignItems: "center", flexDirection: "row", gap: 8 },
  paywallBackground: {
    ...StyleSheet.absoluteFill
  },
  paywallBackgroundImage: {
    ...StyleSheet.absoluteFill
  },
  paywallBackgroundShade: {
    ...StyleSheet.absoluteFill
  },
  paywallAuraOne: {
    backgroundColor: "rgba(109, 59, 255, 0.08)",
    borderRadius: 999,
    height: 220,
    position: "absolute",
    right: -160,
    top: -20,
    width: 220
  },
  paywallAuraTwo: {
    backgroundColor: "rgba(242, 58, 205, 0.08)",
    borderRadius: 999,
    bottom: 80,
    height: 220,
    left: -160,
    position: "absolute",
    width: 220
  },
  paywallNoise: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(255, 255, 255, 0.012)"
  },
  paywallBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5
  },
  paywallBadgeText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "900"
  },
  paywallCard: {
    backgroundColor: "rgba(8, 7, 18, 0.82)",
    borderColor: "rgba(216, 134, 255, 0.34)",
    borderRadius: 24,
    borderWidth: 1.2,
    marginTop: 12,
    padding: 16,
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.2,
    shadowRadius: 26,
    width: "100%"
  },
  paywallCardHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12
  },
  paywallClose: {
    alignItems: "center",
    alignSelf: "flex-end",
    backgroundColor: "rgba(255, 255, 255, 0.12)",
    borderColor: "rgba(255, 255, 255, 0.16)",
    borderWidth: 1,
    borderRadius: 14,
    height: 40,
    justifyContent: "center",
    width: 40
  },
  paywallContent: {
    flexGrow: 1,
    justifyContent: "space-between",
    minHeight: "100%",
    paddingHorizontal: 20,
    paddingTop: 34
  },
  paywallCta: {
    alignItems: "center",
    borderRadius: 999,
    minHeight: 52,
    justifyContent: "center"
  },
  paywallCtaText: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "900"
  },
};
