import { StyleSheet } from "react-native";
import { colors } from "../../../styles/theme";

export const part17 = {
  syncPillText: {
    color: "#8AF7FF",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.7,
    textTransform: "uppercase"
  },
  syncProgress: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    gap: 10,
    justifyContent: "center",
    paddingHorizontal: 18
  },
  syncProgressDash: {
    backgroundColor: "rgba(255, 255, 255, 0.24)",
    borderRadius: 999,
    height: 6,
    width: 34
  },
  syncProgressDashActive: {
    backgroundColor: "#2EEBFF"
  },
  syncScreen: {
    flex: 1,
    overflow: "hidden"
  },
  syncSkipButton: {
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderColor: "rgba(255, 255, 255, 0.12)",
    borderRadius: 20,
    borderWidth: 1,
    height: 52,
    justifyContent: "center",
    paddingHorizontal: 20
  },
  syncSkipText: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "900"
  },
  syncStarOne: {
    backgroundColor: "#8AF7FF",
    borderRadius: 999,
    height: 4,
    position: "absolute",
    right: 34,
    top: 250,
    width: 4
  },
  syncStarTwo: {
    backgroundColor: colors.magenta,
    borderRadius: 999,
    bottom: 224,
    height: 4,
    left: 34,
    position: "absolute",
    width: 4
  },
  syncSubtitle: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 20,
    marginTop: 8,
    maxWidth: 318,
    textAlign: "center"
  },
  syncGradientFill: {
    height: 42,
    width: "100%"
  },
  syncGradientMask: {
    height: 42,
    justifyContent: "flex-start",
    overflow: "visible",
    width: 176
  },
  syncTitle: {
    color: colors.text,
    fontSize: 30,
    fontWeight: "900",
    letterSpacing: 0,
    lineHeight: 38,
    marginTop: 14,
    textAlign: "center"
  },
  syncTitleBlock: {
    alignItems: "center",
    marginTop: 14
  },
  syncTitleGradientMaskText: {
    lineHeight: 38,
    marginTop: 0,
    textAlign: "left"
  },
  syncTitleInline: {
    color: colors.text,
    fontSize: 30,
    fontWeight: "900",
    letterSpacing: 0,
    lineHeight: 38,
    marginTop: 0,
    textAlign: "center"
  },
  syncTitleLine: {
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "center",
    minHeight: 38
  },
  syncTopBar: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 18
  },
  subtitle: { color: colors.muted, fontSize: 15, fontWeight: "600", lineHeight: 22, marginTop: 12 },
  title: { color: colors.text, fontSize: 31, fontWeight: "900", lineHeight: 38 },
  trialRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    marginTop: 18,
    paddingHorizontal: 4
  },
  trialText: { color: colors.muted, flex: 1, fontSize: 13, fontWeight: "700", lineHeight: 18 }
};
