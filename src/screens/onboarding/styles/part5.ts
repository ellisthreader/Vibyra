import { StyleSheet } from "react-native";
import { colors } from "../../../styles/theme";

export const part5 = {
  connectStep: {
    backgroundColor: "rgba(6, 5, 22, 0.72)",
    borderColor: "rgba(151, 54, 255, 0.54)",
    borderRadius: 24,
    borderWidth: 1.5,
    paddingBottom: 20,
    paddingHorizontal: 20,
    paddingTop: 20,
    shadowColor: "#9A35FF",
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.32,
    shadowRadius: 24
  },
  connectStepDot: {
    alignItems: "center",
    backgroundColor: "rgba(16, 14, 34, 0.88)",
    borderColor: "rgba(255, 255, 255, 0.12)",
    borderRadius: 999,
    borderWidth: 2,
    height: 34,
    justifyContent: "center",
    width: 34
  },
  connectStepDotActive: {
    backgroundColor: "#8F32FF",
    borderColor: "rgba(176, 95, 255, 0.92)",
    shadowColor: "#A741FF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.78,
    shadowRadius: 15
  },
  connectStepDots: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    marginBottom: 14,
    marginTop: 18
  },
  connectStepDotText: {
    color: "rgba(255, 255, 255, 0.48)",
    fontSize: 15,
    fontWeight: "900"
  },
  connectStepDotTextActive: {
    color: colors.text
  },
  connectStepIcon: {
    alignItems: "center",
    backgroundColor: "rgba(80, 34, 160, 0.28)",
    borderColor: "rgba(154, 77, 255, 0.28)",
    borderRadius: 14,
    borderWidth: 1,
    height: 48,
    justifyContent: "center",
    shadowColor: "#8A35FF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.26,
    shadowRadius: 18,
    width: 48
  },
  connectStepNumber: {
    alignItems: "center",
    backgroundColor: "rgba(12, 9, 38, 0.9)",
    borderColor: "rgba(151, 54, 255, 0.88)",
    borderRadius: 999,
    borderWidth: 2,
    height: 42,
    justifyContent: "center",
    width: 42
  },
  connectStepNumberText: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "900"
  },
  connectStepRail: {
    backgroundColor: "rgba(255, 255, 255, 0.12)",
    height: 3,
    width: 28
  },
  connectStepRailActive: {
    backgroundColor: "#9B40FF",
    shadowColor: "#A741FF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.7,
    shadowRadius: 8
  },
  connectSteps: {
    gap: 12,
    marginTop: 22
  },
  connectStepTitle: {
    color: colors.text,
    flex: 1,
    fontSize: 19,
    fontWeight: "900",
    lineHeight: 25
  },
  connectStepTop: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    marginBottom: 16
  },
  connectSimplePane: {
    gap: 10,
    marginTop: 10
  },
  connectSubtitle: {
    color: "rgba(226, 219, 255, 0.78)",
    fontSize: 14,
    fontWeight: "800",
    lineHeight: 20,
    marginTop: 4,
    maxWidth: 300,
    textAlign: "center"
  },
  connectTitle: {
    color: colors.text,
    fontSize: 33,
    fontWeight: "900",
    lineHeight: 44,
    marginTop: -5,
    textAlign: "center"
  },
  connectTitleAccent: {
    color: "#C241FF"
  },
  errorText: { color: colors.error, fontSize: 13, fontWeight: "700", marginBottom: 10, textAlign: "center" },
  frequencyCornerGlow: {
    backgroundColor: "rgba(163, 76, 255, 0.2)",
    borderRadius: 999,
    height: 92,
    left: -48,
    opacity: 0.64,
    position: "absolute",
    shadowColor: "#A741FF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.36,
    shadowRadius: 28,
    top: -44,
    width: 92
  },
  frequencyCornerGlowSelected: {
    opacity: 0.9
  },
  frequencyBackdropImage: {
    ...StyleSheet.absoluteFillObject
  },
  quizBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#04070D",
    overflow: "hidden"
  },
  quizBackdropShade: {
    ...StyleSheet.absoluteFillObject
  },
  quizBackdropVignette: {
    ...StyleSheet.absoluteFillObject
  },
};
