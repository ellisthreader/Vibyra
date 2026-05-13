import { StyleSheet } from "react-native";
import { colors } from "../../../styles/theme";

export const part14 = {
  personaHeroOrbit: {
    borderColor: "rgba(104, 52, 255, 0.24)",
    borderRadius: 999,
    borderWidth: 1,
    height: 176,
    position: "absolute",
    width: 176
  },
  personaIcon: {
    height: 140,
    width: 140
  },
  profileLabel: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "800",
    marginTop: 22,
    textAlign: "center"
  },
  pricingContent: { flexGrow: 1, justifyContent: "center", paddingBottom: 18, paddingTop: 16 },
  prereqRow: { alignItems: "center", alignSelf: "stretch", flexDirection: "row", gap: 10, marginBottom: 18 },
  progressFill: {
    borderRadius: 999,
    height: "100%"
  },
  progressRail: {
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 999,
    height: 7,
    overflow: "hidden"
  },
  progressWrap: {
    alignSelf: "stretch",
    paddingHorizontal: 2,
    paddingTop: 6
  },
  promise: { color: colors.muted, fontSize: 18, fontWeight: "700", marginTop: -8, textAlign: "center" },
  questionHelper: { color: colors.dim, fontSize: 14, fontWeight: "700", lineHeight: 20, marginTop: 8 },
  question: {
    flex: 1,
    justifyContent: "center",
    paddingBottom: 10
  },
  resultContent: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    paddingBottom: 4,
    paddingTop: 0
  },
  resultProgressWrap: {
    paddingHorizontal: 8,
    paddingTop: 8
  },
  resultTitleBlock: {
    alignItems: "center",
    width: "100%"
  },
  resultTitleGradientFill: {
    height: 40,
    width: "100%"
  },
  resultTitleGradientMask: {
    alignSelf: "center",
    height: 40,
    justifyContent: "flex-start",
    overflow: "visible",
    width: "100%"
  },
  resultTitleGradientText: {
    color: colors.text,
    fontSize: 31,
    fontWeight: "900",
    letterSpacing: 0,
    lineHeight: 37,
    textAlign: "center"
  },
  resultTitlePrimary: {
    color: colors.text,
    fontSize: 29,
    fontWeight: "900",
    letterSpacing: 0,
    lineHeight: 35,
    textAlign: "center",
    textShadow: "0px 0px 14px rgba(255, 255, 255, 0.22)",
    width: "100%"
  },
  resultTitle: { textAlign: "center", width: "100%" },
  rowContent: { flex: 1, minWidth: 0 },
  rowMeta: { color: colors.muted, fontSize: 13, fontWeight: "600", marginTop: 3, textAlign: "center" },
  rowTitle: { color: colors.text, fontSize: 15, fontWeight: "800", textAlign: "center" },
};
