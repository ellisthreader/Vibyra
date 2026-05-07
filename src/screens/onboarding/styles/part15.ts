import { StyleSheet } from "react-native";
import { colors } from "../../../styles/theme";

export const part15 = {
  sectionTitle: { alignSelf: "flex-start", color: colors.text, fontSize: 18, fontWeight: "900", lineHeight: 24, marginTop: 26 },
  shell: { backgroundColor: colors.background, flex: 1 },
  sliderDot: {
    backgroundColor: "rgba(8, 7, 28, 0.95)",
    borderColor: "rgba(186, 170, 255, 0.62)",
    borderRadius: 999,
    borderWidth: 2,
    height: 17,
    width: 17
  },
  sliderDotActive: {
    backgroundColor: "#B15CFF",
    borderColor: "#D48AFF",
    shadowColor: "#B33BFF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.72,
    shadowRadius: 9
  },
  sliderFill: {
    backgroundColor: "#C56BFF",
    borderRadius: 999,
    height: 6,
    left: 0,
    position: "absolute",
    shadowColor: "#C56BFF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.95,
    shadowRadius: 10,
    top: 21
  },
  sliderIcon: {
    height: 44,
    opacity: 0.78,
    width: 44
  },
  sliderIconActive: {
    opacity: 1
  },
  sliderOption: {
    alignItems: "center",
    backgroundColor: "transparent",
    borderColor: "transparent",
    borderRadius: 18,
    borderWidth: 0,
    gap: 7,
    height: 112,
    justifyContent: "center",
    overflow: "hidden",
    paddingHorizontal: 6,
    position: "relative",
    width: "23%"
  },
  sliderOptionActive: {},
  sliderOptionPressed: {
    opacity: 0.92
  },
  sliderOptions: {
    alignSelf: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 4,
    width: "100%"
  },
  sliderOptionText: { color: "rgba(226, 219, 255, 0.72)", fontSize: 11, fontWeight: "900", lineHeight: 14, textAlign: "center", textShadowColor: "rgba(181, 92, 255, 0.12)", textShadowOffset: { width: 0, height: 4 }, textShadowRadius: 12 },
  sliderOptionTextActive: { color: colors.text, textShadowColor: "rgba(212, 124, 255, 0.42)", textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 12 },
  sliderStop: {
    alignItems: "center",
    height: 48,
    justifyContent: "center",
    marginLeft: -24,
    position: "absolute",
    top: 0,
    width: 48
  },
  sliderThumb: {
    backgroundColor: colors.text,
    borderColor: "#CD79FF",
    borderRadius: 999,
    borderWidth: 3,
    height: 26,
    marginLeft: -13,
    position: "absolute",
    shadowColor: "#D07CFF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.95,
    shadowRadius: 16,
    top: 11,
    width: 26
  },
  sliderTrack: {
    backgroundColor: "rgba(255, 255, 255, 0.14)",
    borderRadius: 999,
    height: 6,
    left: 0,
    position: "absolute",
    right: 0,
    top: 21
  },
  sliderTrackWrap: {
    alignSelf: "center",
    height: 48,
    marginTop: 22,
    width: "88%"
  },
  stepBody: {
    flex: 1,
    justifyContent: "center",
    paddingTop: 10
  },
  stepBodyFullBleed: {
    justifyContent: "flex-start",
    paddingTop: 0
  },
  syncAuraCyan: {
    backgroundColor: "rgba(46, 235, 255, 0.16)",
    borderRadius: 999,
    height: 360,
    left: -150,
    position: "absolute",
    top: 36,
    width: 360
  },
  syncAuraPurple: {
    backgroundColor: "rgba(109, 59, 255, 0.18)",
    borderRadius: 999,
    bottom: 86,
    height: 380,
    position: "absolute",
    right: -150,
    width: 380
  },
  syncAuroraBand: {
    borderRadius: 999,
    height: 260,
    left: -70,
    position: "absolute",
    right: -90,
    top: 82,
    transform: [{ rotate: "11deg" }]
  },
};
