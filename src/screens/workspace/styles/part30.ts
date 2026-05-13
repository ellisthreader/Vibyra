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
    fontSize: 16.5,
    fontWeight: "800",
    letterSpacing: 0,
    lineHeight: 20,
    minWidth: 0,
    textAlign: "center"
  },
  chatTopDirectory: {
    color: "#8F8A9E",
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
    fontSize: 11,
    fontWeight: "700",
    lineHeight: 15,
    marginTop: 1,
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
    backgroundColor: "rgba(12, 15, 28, 0.74)",
    borderColor: "rgba(119, 103, 157, 0.22)",
    borderRadius: 16,
    borderWidth: 1,
    minHeight: 118,
    overflow: "hidden"
  },
  welcomePanelCompact: {
    minHeight: 106
  },
  welcomeBackdrop: {
    alignItems: "center",
    flexDirection: "row",
    gap: 14,
    justifyContent: "space-between",
    minHeight: "100%",
    overflow: "visible",
    padding: 13,
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
    flex: 1,
    maxWidth: 178,
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
    backgroundColor: "rgba(55, 214, 122, 0.1)",
    borderColor: "rgba(95, 235, 154, 0.2)",
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    gap: 7,
    marginBottom: 9,
    paddingHorizontal: 10,
    paddingVertical: 5
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
    fontSize: 24,
    fontWeight: "900",
    letterSpacing: 0,
    lineHeight: 28,
    textAlign: "left"
  },
} as const;
