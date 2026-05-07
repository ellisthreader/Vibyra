import { StyleSheet } from "react-native";
import { colors } from "../../../styles/theme";

export const part33 = {
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
  tokenRenewalBadge: {
    alignItems: "center",
    backgroundColor: "rgba(255, 242, 0, 0.12)",
    borderColor: "rgba(255, 242, 0, 0.36)",
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 9,
    paddingVertical: 6
  },
  tokenRenewalText: {
    color: "#FFF200",
    fontSize: 11,
    fontWeight: "900"
  },
  tokenSheet: {
    backgroundColor: "rgba(6, 8, 18, 0.98)",
    borderColor: "rgba(126, 102, 190, 0.32)",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    gap: 15,
    paddingBottom: 28,
    paddingHorizontal: 18,
    paddingTop: 10,
    shadowColor: "#FFF200",
    shadowOffset: { width: 0, height: -14 },
    shadowOpacity: 0.18,
    shadowRadius: 30
  },
  tokenSheetClose: {
    alignItems: "center",
    backgroundColor: "rgba(139, 53, 255, 0.18)",
    borderColor: "rgba(255, 242, 0, 0.16)",
    borderRadius: 10,
    borderWidth: 1,
    height: 36,
    justifyContent: "center",
    width: 36
  },
  tokenSheetContent: {
    gap: 13,
    paddingBottom: 2
  },
  tokenSheetHandle: {
    alignSelf: "center",
    backgroundColor: "rgba(255, 242, 0, 0.42)",
    borderRadius: 999,
    height: 4,
    width: 42
  },
  tokenSheetHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 13
  },
  tokenSheetHeaderCopy: {
    flex: 1,
    minWidth: 0
  },
  tokenSheetHeaderIcon: {
    alignItems: "center",
    backgroundColor: "rgba(255, 242, 0, 0.14)",
    borderColor: "rgba(255, 242, 0, 0.42)",
    borderRadius: 14,
    borderWidth: 1,
    height: 48,
    justifyContent: "center",
    shadowColor: "#FFF200",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.22,
    shadowRadius: 14,
    width: 48
  },
  tokenSheetKicker: {
    color: "#FFF200",
    fontSize: 10,
    fontWeight: "900",
    textTransform: "uppercase"
  },
  tokenSheetOverlay: {
    flex: 1,
    justifyContent: "flex-end"
  },
  tokenSheetScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.58)"
  },
};
