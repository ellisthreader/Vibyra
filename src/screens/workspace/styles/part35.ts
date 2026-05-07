import { StyleSheet } from "react-native";
import { colors } from "../../../styles/theme";

export const part35 = {
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
  dashboardPage: {
    flex: 1,
    gap: 14,
    width: "100%"
  },
  dashboardPageCompact: {
    gap: 10
  },
  dashboardLogo: {
    height: 36,
    width: 52
  },
  dashboardLogoChat: {
    height: 38,
    width: 54
  },
  runningProjectCard: {
    backgroundColor: "rgba(8, 6, 20, 0.58)",
    borderRadius: 12,
    borderWidth: 1,
    height: 98,
    overflow: "hidden",
    paddingHorizontal: 10,
    position: "relative"
  },
  runningProjectCardRunning: {
    backgroundColor: "rgba(78, 20, 137, 0.14)",
    borderColor: "rgba(179, 91, 255, 0.58)",
    paddingBottom: 20,
    paddingTop: 13,
    shadowColor: "#7F24FF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.36,
    shadowRadius: 18
  },
};
