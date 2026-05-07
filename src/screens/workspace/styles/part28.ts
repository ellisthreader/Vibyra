import { Platform, StyleSheet } from "react-native";
import { colors } from "../../../styles/theme";
import { communityDetailAccent, communityDetailAccentDark } from "../data/community";

export const part28 = {
  pcScanButton: {
    alignItems: "center",
    backgroundColor: "rgba(108, 49, 255, 0.88)",
    borderColor: "rgba(190, 150, 255, 0.42)",
    borderRadius: 13,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    justifyContent: "center",
    minHeight: 48,
    shadowColor: "#7334FF",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.24,
    shadowRadius: 18
  },
  pcScanButtonText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "900"
  },
  pcSwitcherClose: {
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 10,
    borderWidth: 1,
    height: 36,
    justifyContent: "center",
    width: 36
  },
  pcSwitcherError: {
    color: "#FF9DAE",
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 16
  },
  pcSwitcherHandle: {
    alignSelf: "center",
    backgroundColor: "rgba(207, 199, 226, 0.26)",
    borderRadius: 999,
    height: 4,
    width: 42
  },
  pcSwitcherHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 13
  },
  pcSwitcherHeaderCopy: {
    flex: 1,
    minWidth: 0
  },
  pcSwitcherHeaderIcon: {
    alignItems: "center",
    backgroundColor: "rgba(92, 47, 232, 0.34)",
    borderColor: "rgba(183, 124, 255, 0.34)",
    borderRadius: 14,
    borderWidth: 1,
    height: 48,
    justifyContent: "center",
    width: 48
  },
  pcSwitcherKicker: {
    color: "#9AE9B4",
    fontSize: 10,
    fontWeight: "900",
    textTransform: "uppercase"
  },
  pcSwitcherMessage: {
    color: "#B8B2C9",
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 16
  },
  pcSwitcherOverlay: {
    flex: 1,
    justifyContent: "flex-end"
  },
  pcSwitcherScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.58)"
  },
  pcSwitcherSheet: {
    backgroundColor: "rgba(6, 8, 18, 0.98)",
    borderColor: "rgba(126, 102, 190, 0.32)",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    gap: 15,
    paddingBottom: 28,
    paddingHorizontal: 18,
    paddingTop: 10,
    shadowColor: "#6E31FF",
    shadowOffset: { width: 0, height: -14 },
    shadowOpacity: 0.22,
    shadowRadius: 28
  },
  pcSwitcherTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "900",
    letterSpacing: 0,
    lineHeight: 24
  },
  tokenPill: {
    alignItems: "center",
    backgroundColor: "rgba(255, 232, 111, 0.08)",
    borderColor: "rgba(255, 232, 111, 0.2)",
    borderRadius: 13,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    minHeight: 38,
    paddingHorizontal: 10,
    paddingVertical: 5
  },
  tokenPillPressed: {
    opacity: 0.76,
    transform: [{ scale: 0.98 }]
  },
  tokenHeroLabel: {
    color: "#FFF200",
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase"
  },
  tokenHeroPanel: {
    gap: 14,
    paddingHorizontal: 2,
    paddingTop: 2
  },
  tokenHeroTop: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between"
  },
  tokenHeroValue: {
    color: "#F9F6FF",
    fontSize: 23,
    fontWeight: "900",
    letterSpacing: 0,
    lineHeight: 30,
    marginTop: 3
  },
  tokenManageButton: {
    borderRadius: 13,
    overflow: "hidden",
    shadowColor: "#FFF200",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.3,
    shadowRadius: 22
  },
  tokenManageButtonPressed: {
    opacity: 0.86,
    transform: [{ scale: 0.99 }]
  },
  tokenManageGradient: {
    alignItems: "center",
    flexDirection: "row",
    gap: 9,
    justifyContent: "center",
    minHeight: 48
  },
  tokenManageText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "900"
  },
} as const;
