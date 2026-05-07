import { StyleSheet } from "react-native";
import { colors } from "../../../styles/theme";

export const part3 = {
  connectGuideDone: {
    borderColor: "rgba(255, 255, 255, 0.24)",
    borderRadius: 18,
    borderWidth: 1,
    overflow: "hidden",
    shadowColor: "#B63AFF",
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.42,
    shadowRadius: 24
  },
  connectGuideDonePressable: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    justifyContent: "center",
    minHeight: 56,
    paddingHorizontal: 16
  },
  connectGuideDoneText: {
    color: colors.text,
    flexShrink: 1,
    fontSize: 15,
    fontWeight: "900",
    lineHeight: 20,
    textAlign: "center"
  },
  connectGuideHero: {
    alignItems: "center",
    backgroundColor: "rgba(6, 5, 22, 0.72)",
    borderColor: "rgba(174, 98, 255, 0.42)",
    borderRadius: 26,
    borderWidth: 1.5,
    overflow: "hidden",
    paddingBottom: 22,
    paddingHorizontal: 18,
    paddingTop: 26,
    shadowColor: "#A741FF",
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.28,
    shadowRadius: 28
  },
  connectGuideHeroIcon: {
    alignItems: "center",
    backgroundColor: "rgba(149, 60, 255, 0.2)",
    borderColor: "rgba(201, 123, 255, 0.42)",
    borderRadius: 18,
    borderWidth: 1,
    height: 58,
    justifyContent: "center",
    shadowColor: "#C97BFF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.58,
    shadowRadius: 18,
    width: 58
  },
  connectGuideInfoBlock: {
    gap: 5,
    marginTop: 12
  },
  connectGuideInfoCard: {
    backgroundColor: "rgba(6, 5, 22, 0.7)",
    borderColor: "rgba(174, 98, 255, 0.26)",
    borderRadius: 20,
    borderWidth: 1,
    padding: 16
  },
  connectGuideInfoGrid: {
    gap: 12
  },
  connectGuideInfoTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "900",
    lineHeight: 22
  },
  connectGuideIntro: {
    color: "rgba(226, 219, 255, 0.78)",
    fontSize: 14,
    fontWeight: "800",
    lineHeight: 20,
    marginTop: 8,
    maxWidth: 310,
    textAlign: "center"
  },
  connectGuideKicker: {
    color: "#C97BFF",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.8,
    marginBottom: 3,
    textTransform: "uppercase"
  },
  connectGuideOverlay: {
    backgroundColor: colors.background,
    flex: 1,
    overflow: "hidden"
  },
  connectGuideQuestion: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "900",
    lineHeight: 19
  },
  connectGuideScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(2, 1, 12, 0.32)"
  },
  connectGuideSectionTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "900",
    lineHeight: 22
  },
  connectGuideSmallLine: {
    color: "rgba(232, 226, 255, 0.8)",
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 19,
    marginTop: 5
  },
  connectGuideStepIcon: {
    alignItems: "center",
    backgroundColor: "rgba(149, 60, 255, 0.18)",
    borderColor: "rgba(201, 123, 255, 0.34)",
    borderRadius: 14,
    borderWidth: 1,
    height: 44,
    justifyContent: "center",
    shadowColor: "#C97BFF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 14,
    width: 44
  },
  connectGuideStepStack: {
    gap: 12
  },
  connectGuideTitle: {
    color: colors.text,
    fontSize: 26,
    fontWeight: "900",
    lineHeight: 32,
    marginTop: 16,
    maxWidth: 310,
    textAlign: "center"
  },
  connectHelpRow: {
    alignItems: "center",
    alignSelf: "center",
    flexDirection: "row",
    gap: 9,
    justifyContent: "center",
    marginTop: 18,
    minHeight: 28,
    paddingHorizontal: 14
  },
  connectHelpText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "800"
  },
  connectLine: {
    color: "rgba(227, 222, 255, 0.78)",
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 20,
    marginTop: 3
  },
};
