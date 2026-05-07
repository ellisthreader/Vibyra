import { StyleSheet } from "react-native";
import { colors } from "../../../styles/theme";

export const part4 = {
  chatHistoryHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 2
  },
  chatHistoryIcon: {
    alignItems: "center",
    backgroundColor: "rgba(55, 56, 76, 0.62)",
    borderRadius: 8,
    height: 30,
    justifyContent: "center",
    width: 30
  },
  chatHistoryIconActive: {
    backgroundColor: "rgba(96, 42, 168, 0.58)"
  },
  chatHistoryRail: {
    gap: 9,
    paddingHorizontal: 2,
    paddingRight: 14
  },
  chatHistoryTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "900"
  },
  chatLauncherCopy: {
    flex: 1,
    minWidth: 0
  },
  chatLauncherHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between"
  },
  chatLauncherKicker: {
    color: "#B64FFF",
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase"
  },
  chatLauncherTitle: {
    color: colors.text,
    fontSize: 24,
    fontWeight: "900",
    letterSpacing: 0,
    lineHeight: 29,
    marginTop: 3
  },
  chatList: {
    backgroundColor: "#101219",
    borderColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 8,
    borderWidth: 1,
    gap: 10,
    padding: 12
  },
  chatListHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  chatPage: {
    backgroundColor: "#02030C",
    flex: 1,
    flexDirection: "column",
    gap: 10,
    minHeight: 0,
    width: "100%"
  },
  chatPageHost: {
    backgroundColor: "#080A12",
    flex: 1,
    minHeight: 0,
    paddingHorizontal: 14,
    paddingTop: 0
  },
  chatNewButton: {
    alignItems: "center",
    borderColor: "#8F35FF",
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    minHeight: 34,
    paddingHorizontal: 12
  },
  chatNewButtonText: {
    color: "#B64FFF",
    fontSize: 13,
    fontWeight: "900"
  },
  chatLandingArt: {
    height: 174,
    position: "absolute",
    right: -20,
    top: 4,
    width: 198
  },
  chatLandingArtImage: {
    height: "100%",
    width: "100%"
  },
  chatLandingCopy: {
    maxWidth: 235,
    minWidth: 0,
    paddingTop: 14,
    zIndex: 2
  },
  chatLandingHero: {
    minHeight: 188,
    position: "relative"
  },
  chatLandingKicker: {
    color: "#B934FF",
    fontSize: 15,
    fontWeight: "900",
    letterSpacing: 0,
    textTransform: "uppercase"
  },
  chatLandingLight: {
    height: 260,
    position: "absolute",
    right: -48,
    top: 26,
    width: 250
  },
  chatLandingPrimary: {
    borderColor: "rgba(195, 75, 255, 0.8)",
    borderRadius: 17,
    borderWidth: 2,
    marginTop: -6,
    overflow: "hidden",
    shadowColor: "#9B34FF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.72,
    shadowRadius: 18
  },
};
