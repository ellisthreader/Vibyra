import { StyleSheet } from "react-native";
import { colors } from "../../../styles/theme";

export const part6 = {
  resultBackdropImage: {
    ...StyleSheet.absoluteFill
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
    marginTop: 10,
    maxWidth: 320
  },
  frequencyOption: {
    alignItems: "center",
    backgroundColor: "rgba(5, 9, 20, 0.72)",
    borderColor: "rgba(171, 100, 255, 0.32)",
    borderRadius: 18,
    borderWidth: 1,
    height: 132,
    justifyContent: "center",
    overflow: "hidden",
    paddingHorizontal: 10,
    paddingTop: 12,
    position: "relative",
    shadowColor: "#8C2DFF",
    shadowOffset: { width: 0, height: 7 },
    shadowOpacity: 0.05,
    shadowRadius: 9,
    width: "100%"
  },
  frequencyOptionCheck: {
    alignItems: "center",
    backgroundColor: "#C77DFF",
    borderColor: "rgba(255, 211, 255, 0.72)",
    borderRadius: 999,
    borderWidth: 1,
    height: 23,
    justifyContent: "center",
    position: "absolute",
    right: 12,
    shadowColor: "#C77DFF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.24,
    shadowRadius: 5,
    top: 12,
    width: 23,
    zIndex: 2
  },
  frequencyOptionGrid: {
    alignSelf: "stretch",
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 14
  },
  frequencyOptionIcon: {
    height: 56,
    marginBottom: 12,
    width: 56
  },
  frequencyOptionMotion: {
    shadowColor: "#A741FF",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.02,
    shadowRadius: 6,
    width: "48%"
  },
  frequencyOptionPressed: {
    opacity: 0.86,
    transform: [{ scale: 0.985 }]
  },
  frequencyOptionSelected: {
    backgroundColor: "rgba(8, 18, 34, 0.86)",
    borderColor: "rgba(216, 134, 255, 0.72)",
    shadowColor: "#C77DFF",
    shadowOpacity: 0.08,
    shadowRadius: 10
  },
  frequencyOptionTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "900",
    lineHeight: 20,
    textAlign: "center",
    textShadow: "0px 3px 7px rgba(181, 92, 255, 0.06)"
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
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(151, 54, 255, 0.04)",
    borderRadius: 18
  },
  frequencyTitle: {
    color: colors.text,
    fontSize: 33,
    fontWeight: "900",
    letterSpacing: 0,
    lineHeight: 41,
    maxWidth: 330,
    textShadow: "0px 8px 18px rgba(181, 92, 255, 0.2)"
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
    justifyContent: "space-between",
    overflow: "hidden",
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
