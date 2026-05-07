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
    ...StyleSheet.absoluteFillObject
  },
  paywallAuraOne: {
    backgroundColor: "rgba(109, 59, 255, 0.28)",
    borderRadius: 999,
    height: 260,
    position: "absolute",
    right: -90,
    top: 60,
    width: 260
  },
  paywallAuraTwo: {
    backgroundColor: "rgba(242, 58, 205, 0.18)",
    borderRadius: 999,
    bottom: 120,
    height: 280,
    left: -120,
    position: "absolute",
    width: 280
  },
  paywallNoise: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255, 255, 255, 0.025)"
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
    backgroundColor: "rgba(13, 13, 18, 0.88)",
    borderColor: "rgba(139, 92, 255, 0.32)",
    borderRadius: 22,
    borderWidth: 1,
    marginTop: 8,
    padding: 13,
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.12,
    shadowRadius: 22,
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
    paddingHorizontal: 22,
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
