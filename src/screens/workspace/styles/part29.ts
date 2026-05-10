import { Platform, StyleSheet } from "react-native";
import { colors } from "../../../styles/theme";
import { communityDetailAccent, communityDetailAccentDark } from "../data/community";

export const part29 = {
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
  tokenSheetScroll: {
    flexShrink: 1
  },
  tokenSheetTitle: {
    color: "#F9F6FF",
    fontSize: 20,
    fontWeight: "900",
    letterSpacing: 0,
    lineHeight: 24
  },
  tokenText: {
    color: "#FFE76A",
    fontSize: 15,
    fontWeight: "900",
    lineHeight: 18
  },
  tokenSubtext: {
    color: "#BDB9C7",
    fontSize: 10,
    fontWeight: "900"
  },
  tokenTrack: {
    backgroundColor: "rgba(139, 53, 255, 0.34)",
    borderRadius: 999,
    height: 10,
    overflow: "hidden"
  },
  tokenTrackFill: {
    borderRadius: 999,
    height: 10
  },
  pageTopTitle: {
    color: colors.text,
    fontSize: 24,
    fontWeight: "900",
    letterSpacing: 0,
    lineHeight: 28
  },
  pageTopTitleBlock: {
    flex: 1,
    minWidth: 0
  },
  topBar: {
    alignItems: "center",
    backgroundColor: "#02030C",
    borderBottomColor: "rgba(91, 91, 112, 0.18)",
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between",
    minHeight: 74,
    paddingBottom: 10,
    paddingHorizontal: 16,
    paddingTop: 10,
    position: "relative"
  },
  chatTopActions: {
    alignItems: "center",
    flexDirection: "row",
    flexShrink: 1,
    gap: 7,
    justifyContent: "flex-end",
    minWidth: 0
  },
  chatTopBar: {
    backgroundColor: "#080A12",
    borderBottomColor: "rgba(176, 132, 255, 0.10)",
    borderBottomWidth: 1,
    gap: 8,
    justifyContent: "space-between",
    paddingHorizontal: 12
  },
  chatTopIconButton: {
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    borderColor: "rgba(176, 132, 255, 0.16)",
    borderRadius: 12,
    borderWidth: 1,
    height: 38,
    justifyContent: "center",
    width: 38
  },
} as const;
