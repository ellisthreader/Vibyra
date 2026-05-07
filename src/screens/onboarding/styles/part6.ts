import { StyleSheet } from "react-native";
import { colors } from "../../../styles/theme";

export const part6 = {
  resultBackdropImage: {
    ...StyleSheet.absoluteFillObject
  },
  frequencyHeader: {
    alignSelf: "stretch",
    marginBottom: 18
  },
  frequencyHelper: {
    color: "rgba(226, 219, 255, 0.72)",
    fontSize: 15,
    fontWeight: "800",
    lineHeight: 21,
    marginTop: 10
  },
  frequencyOption: {
    alignItems: "center",
    backgroundColor: "rgba(8, 7, 28, 0.62)",
    borderColor: "rgba(171, 100, 255, 0.38)",
    borderRadius: 20,
    borderWidth: 1.4,
    height: 128,
    justifyContent: "center",
    overflow: "hidden",
    paddingHorizontal: 12,
    paddingTop: 18,
    position: "relative",
    shadowColor: "#8C2DFF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.34,
    shadowRadius: 22,
    width: "100%"
  },
  frequencyOptionGrid: {
    alignSelf: "stretch",
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 14
  },
  frequencyOptionIcon: {
    height: 54,
    marginBottom: 12,
    width: 54
  },
  frequencyOptionMotion: {
    shadowColor: "#A741FF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.18,
    shadowRadius: 18,
    width: "48%"
  },
  frequencyOptionPressed: {
    opacity: 0.86,
    transform: [{ scale: 0.985 }]
  },
  frequencyOptionSelected: {
    backgroundColor: "rgba(20, 9, 48, 0.78)",
    borderColor: "rgba(216, 134, 255, 0.95)",
    shadowOpacity: 0.5,
    shadowRadius: 28
  },
  frequencyOptionTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "900",
    lineHeight: 21,
    textAlign: "center",
    textShadowColor: "rgba(255, 255, 255, 0.18)",
    textShadowOffset: { width: 0, height: 6 },
    textShadowRadius: 12
  },
  frequencyProgressWrap: {
    paddingHorizontal: 4,
    paddingTop: 10
  },
  frequencyQuestion: {
    flex: 1,
    justifyContent: "center",
    paddingBottom: 0,
    position: "relative"
  },
  frequencySelectedGlow: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(151, 54, 255, 0.12)",
    borderRadius: 20
  },
  frequencyTitle: {
    color: colors.text,
    fontSize: 34,
    fontWeight: "900",
    letterSpacing: 0,
    lineHeight: 41,
    maxWidth: 330,
    textShadowColor: "rgba(255, 255, 255, 0.2)",
    textShadowOffset: { width: 0, height: 8 },
    textShadowRadius: 16
  },
  flow: {
    flex: 1,
    paddingHorizontal: 20,
    paddingBottom: 20,
    paddingTop: 14
  },
  flowFrequency: {
    flex: 1,
    paddingBottom: 8,
    paddingHorizontal: 24,
    paddingTop: 8
  },
  flowResult: {
    flex: 1,
    paddingBottom: 8,
    paddingHorizontal: 24,
    paddingTop: 8
  },
  flowPaywall: {
    paddingBottom: 0,
    paddingHorizontal: 0,
    paddingTop: 0
  },
  flowFullBleed: {
    paddingBottom: 0,
    paddingHorizontal: 0,
    paddingTop: 0
  },
  flowMoment: {
    paddingBottom: 0,
    paddingHorizontal: 0,
    paddingTop: 0
  },
  deviceChip: {
    alignItems: "center",
    backgroundColor: "rgba(10, 13, 28, 0.78)",
    borderColor: "rgba(255, 255, 255, 0.13)",
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    position: "absolute"
  },
  deviceChipDesktop: {
    bottom: 22,
    right: 24
  },
};
