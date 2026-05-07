import { StyleSheet } from "react-native";
import { colors } from "../../../styles/theme";

export const part1 = {
  backButton: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
    height: 48,
    paddingHorizontal: 4
  },
  backButtonArt: {
    gap: 8,
    height: 62
  },
  backIconArt: {
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.07)",
    borderRadius: 999,
    height: 56,
    justifyContent: "center",
    shadowColor: "#8158FF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.28,
    shadowRadius: 18,
    width: 56
  },
  backText: { color: colors.muted, fontSize: 15, fontWeight: "700" },
  backTextArt: {
    color: "#D8CAFF",
    fontSize: 20,
    fontWeight: "900"
  },
  billingSave: {
    color: colors.muted,
    fontSize: 8,
    fontWeight: "900",
    marginTop: 0
  },
  billingTab: {
    alignItems: "center",
    borderRadius: 999,
    flex: 1,
    justifyContent: "center",
    minHeight: 34
  },
  billingTabActive: {
    backgroundColor: "rgba(109, 59, 255, 0.16)",
    borderColor: "rgba(139, 92, 255, 0.34)",
    borderWidth: 1
  },
  billingTabs: {
    alignSelf: "center",
    backgroundColor: "rgba(255, 255, 255, 0.07)",
    borderColor: "rgba(255, 255, 255, 0.12)",
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    gap: 4,
    marginTop: 6,
    padding: 3,
    width: "72%"
  },
  billingTabText: {
    color: "rgba(255, 255, 255, 0.58)",
    fontSize: 12,
    fontWeight: "900"
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    overflow: "hidden"
  },
  backdropLayer: {
    ...StyleSheet.absoluteFillObject
  },
  backdropBand: {
    borderRadius: 999,
    height: 190,
    position: "absolute"
  },
  backdropBandBottom: {
    bottom: 70,
    left: -100,
    right: -70,
    transform: [{ rotate: "-14deg" }]
  },
  backdropBandTop: {
    left: -80,
    right: -120,
    top: 64,
    transform: [{ rotate: "12deg" }]
  },
  backdropGrid: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(7, 7, 10, 0.38)"
  },
  badge: {
    alignSelf: "flex-start",
    backgroundColor: colors.accentSoft,
    borderColor: colors.accent,
    borderRadius: 999,
    borderWidth: 1,
    marginBottom: 14,
    paddingHorizontal: 12,
    paddingVertical: 6
  },
  badgeText: { color: colors.text, fontSize: 12, fontWeight: "800" },
  codeHalo: {
    alignItems: "center",
    backgroundColor: colors.magentaSoft,
    borderColor: colors.magenta,
    borderRadius: 8,
    borderWidth: 1,
    height: 38,
    justifyContent: "center",
    paddingHorizontal: 14
  },
  codeLabel: { color: colors.magenta, fontSize: 11, fontWeight: "900", textTransform: "uppercase" },
  connectActionCopy: {
    flex: 1,
    minWidth: 0
  },
  connectActionMeta: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 18,
    marginTop: 3
  },
};
