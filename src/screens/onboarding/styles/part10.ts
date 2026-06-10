import { StyleSheet } from "react-native";
import { colors } from "../../../styles/theme";

export const part10 = {
  navRowFrequency: {
    justifyContent: "space-between",
    paddingBottom: 20,
    paddingTop: 8
  },
  navRowMoment: {
    paddingHorizontal: 24,
    paddingTop: 8,
    position: "relative",
    width: "100%",
    zIndex: 3
  },
  nextButton: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    minHeight: 48,
    paddingHorizontal: 18
  },
  nextButtonFrequency: {
    backgroundColor: "transparent",
    borderColor: "rgba(214, 132, 255, 0.98)",
    borderRadius: 21,
    minHeight: 56,
    overflow: "hidden",
    paddingHorizontal: 0,
    shadowColor: "#C86DFF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.82,
    shadowRadius: 24,
    width: 148
  },
  nextButtonFrequencyGradient: {
    alignItems: "center",
    borderRadius: 21,
    flexDirection: "row",
    gap: 13,
    justifyContent: "center",
    minHeight: 56,
    paddingHorizontal: 14,
    shadowColor: "#D07CFF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.78,
    shadowRadius: 20,
    width: "100%"
  },
  nextButtonDisabled: {
    opacity: 0.45
  },
  nextText: { color: colors.text, fontSize: 15, fontWeight: "800" },
  nextTextFrequency: {
    fontSize: 18,
    fontWeight: "900"
  },
  onboarding: { alignItems: "center", flex: 1, justifyContent: "center", padding: 22 },
  onboardingFooter: { alignItems: "center", flexDirection: "row", gap: 8, marginTop: 18 },
  option: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 16,
    borderWidth: 1,
    gap: 8,
    justifyContent: "center",
    marginBottom: 12,
    minHeight: 124,
    padding: 12,
    position: "relative",
    width: "46%"
  },
  optionCheck: {
    position: "absolute",
    right: 10,
    top: 10
  },
  optionCopy: { alignItems: "center", minWidth: 0 },
  optionIcon: {
    height: 52,
    width: 52
  },
  persistentBackdrop: {
    ...StyleSheet.absoluteFill,
    overflow: "hidden"
  },
  optionIconShell: {
    alignItems: "center",
    height: 56,
    justifyContent: "center",
    width: 56
  },
  optionIconShellSelected: {
    transform: [{ scale: 1.04 }]
  },
  optionPressed: {
    transform: [{ scale: 0.98 }]
  },
  optionSelected: {
    backgroundColor: "#171722",
    borderColor: colors.accent
  },
  optionStack: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    marginTop: 26
  },
  optionTitle: { color: colors.text, fontSize: 15, fontWeight: "800", textAlign: "center" },
  outcomeNumber: {
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 999,
    borderWidth: 1,
    height: 30,
    justifyContent: "center",
    width: 30
  },
};
