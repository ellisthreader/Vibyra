import { StyleSheet } from "react-native";
import { colors } from "../../styles/theme";

export const styles = StyleSheet.create({
  actions: {
    alignSelf: "center",
    gap: 11,
    paddingBottom: 0,
    width: "92.5%"
  },
  actionsExpanded: { marginTop: 22, width: "100%" },
  authChoice: {
    alignItems: "center",
    backgroundColor: "rgba(12, 5, 35, 0.34)",
    borderColor: "rgba(176, 70, 255, 0.82)",
    borderRadius: 999,
    borderWidth: 1.2,
    flexDirection: "row",
    gap: 28,
    height: 56,
    justifyContent: "center",
    overflow: "hidden",
    paddingHorizontal: 24,
    shadowColor: "#B141FF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.22,
    shadowRadius: 12,
    width: "100%"
  },
  authChoicePressed: {
    backgroundColor: "rgba(40, 17, 78, 0.62)",
    borderColor: "rgba(205, 103, 255, 0.94)",
    transform: [{ scale: 0.99 }]
  },
  authChoiceBusy: { opacity: 0.78 },
  authChoiceText: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "800",
    minWidth: 190
  },
  authError: {
    alignSelf: "center",
    color: "#FF8BA0",
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 18,
    maxWidth: "92%",
    textAlign: "center"
  },
  authIcon: { textAlign: "center", width: 40 },
  backgroundImage: {
    ...StyleSheet.absoluteFillObject,
    height: undefined,
    opacity: 1,
    width: undefined
  },
  backgroundOverlay: { ...StyleSheet.absoluteFillObject },
  content: { flexGrow: 1, justifyContent: "space-between", paddingHorizontal: 22 },
  contentExpanded: { justifyContent: "flex-start" },
  foreground: { flex: 1 },
  googleIcon: { alignItems: "center", height: 34, justifyContent: "center", width: 40 },
  gradientTitleFill: { height: "100%", minWidth: 112 },
  heroStack: { alignItems: "center", gap: 0 },
  legalBlock: { alignItems: "center", gap: 14, paddingTop: 21 },
  legalDivider: { backgroundColor: "rgba(212, 194, 255, 0.52)", height: 26, width: 1 },
  legalIntro: {
    color: "rgba(222, 213, 245, 0.62)",
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 20,
    textAlign: "center"
  },
  legalLink: { color: "#A855FF", fontSize: 15, fontWeight: "900", lineHeight: 20 },
  legalPressed: { opacity: 0.65 },
  legalRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 24,
    justifyContent: "center",
    paddingTop: 0
  },
  logoStage: { alignItems: "center", justifyContent: "center" },
  screen: { backgroundColor: colors.background, flex: 1 },
  title: { color: colors.text, fontWeight: "900", letterSpacing: 0, textAlign: "center" },
  titleRow: { alignItems: "center", flexDirection: "row", justifyContent: "center" },
  titleStage: { marginTop: 32 }
});
