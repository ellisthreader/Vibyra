import { Platform, StyleSheet } from "react-native";
import { colors } from "../../../styles/theme";
import { communityDetailAccent, communityDetailAccentDark } from "../data/community";

export const part30 = {
  chatTopLeft: {
    alignItems: "center",
    flexDirection: "row",
    flexShrink: 0,
    gap: 7
  },
  chatTopTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "900",
    letterSpacing: 0,
    lineHeight: 22,
    minWidth: 0,
    textAlign: "center"
  },
  chatTopTitleWrap: {
    alignItems: "center",
    bottom: 0,
    justifyContent: "center",
    left: 94,
    paddingHorizontal: 6,
    position: "absolute",
    right: 94,
    top: 0
  },
  topBarChat: {
    borderBottomColor: "rgba(91, 91, 112, 0.26)",
    minHeight: 74,
    paddingHorizontal: 18
  },
  topLeft: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    gap: 11,
    minWidth: 0
  },
  topLeftPressed: {
    opacity: 0.74
  },
  topMachineCopy: {
    flex: 1,
    minWidth: 0
  },
  topConnectionRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8
  },
  topKicker: {
    color: "#9AE9B4",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0,
    textTransform: "uppercase"
  },
  topRight: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "flex-end"
  },
  topTitle: {
    color: colors.text,
    flexShrink: 1,
    fontSize: 18,
    fontWeight: "900",
    letterSpacing: 0,
    lineHeight: 22
  },
  topTitleRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 4,
    minWidth: 0
  },
  twoColumn: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16
  },
  welcomeBodyText: {
    color: "#B5B0CA",
    fontSize: 14,
    fontWeight: "800",
    lineHeight: 19,
    marginTop: 6,
    textAlign: "left"
  },
  welcomePanel: {
    minHeight: 182,
    overflow: "visible"
  },
  welcomePanelCompact: {
    minHeight: 158
  },
  welcomeBackdrop: {
    alignItems: "center",
    flexDirection: "row",
    gap: 18,
    justifyContent: "space-between",
    minHeight: "100%",
    overflow: "visible",
    paddingTop: 8,
    width: "100%"
  },
  welcomeHeroImage: {
    aspectRatio: 1,
    height: "100%",
    opacity: 0.92,
    width: "100%"
  },
  welcomeHeroImageWrap: {
    bottom: -18,
    height: 190,
    position: "absolute",
    right: -32,
    width: 212
  },
  welcomeHeroLeft: {
    maxWidth: 210,
    minWidth: 0,
    zIndex: 1
  },
  welcomeLiveDot: {
    backgroundColor: "#68F8A6",
    borderRadius: 999,
    height: 8,
    width: 8
  },
  welcomeLivePill: {
    alignItems: "center",
    alignSelf: "flex-start",
    flexDirection: "row",
    gap: 7,
    marginBottom: 14,
    paddingVertical: 2
  },
  welcomeLiveText: {
    color: "#D7D1E7",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0,
    textTransform: "uppercase"
  },
  welcomeTitle: {
    color: colors.text,
    fontSize: 28,
    fontWeight: "900",
    letterSpacing: 0,
    lineHeight: 32,
    textAlign: "left"
  },
  mobileConnectionCard: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: "rgba(55, 214, 122, 0.1)",
    borderColor: "rgba(55, 214, 122, 0.18)",
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    maxWidth: "100%",
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  mobileConnectionCopy: {
    minWidth: 0
  },
} as const;
