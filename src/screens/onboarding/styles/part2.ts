import { StyleSheet } from "react-native";
import { colors } from "../../../styles/theme";

export const part2 = {
  connectActionPressed: {
    opacity: 0.78,
    transform: [{ scale: 0.99 }]
  },
  connectActionDisabled: {
    opacity: 0.7
  },
  connectActionStack: {
    gap: 10,
    marginTop: 12
  },
  connectActionTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "900"
  },
  connectApproval: {
    alignItems: "center",
    backgroundColor: colors.successSoft,
    borderColor: "rgba(55, 214, 122, 0.38)",
    borderRadius: 12,
    borderWidth: 1,
    gap: 9,
    marginTop: 8,
    padding: 12
  },
  connectApprovalTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "900",
    textAlign: "center"
  },
  connectCodeBlock: {
    backgroundColor: "rgba(255, 255, 255, 0.035)",
    borderColor: "rgba(255, 255, 255, 0.07)",
    borderRadius: 12,
    borderWidth: 1,
    padding: 10
  },
  connectCodeInput: {
    backgroundColor: "rgba(5, 4, 20, 0.74)",
    borderColor: "rgba(147, 57, 255, 0.46)",
    borderRadius: 16,
    color: colors.text,
    fontSize: 20,
    fontWeight: "900",
    letterSpacing: 5,
    minHeight: 54,
    textAlign: "center",
    textTransform: "uppercase"
  },
  connectCodeLabel: {
    color: "#A94BFF",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.7,
    marginLeft: 2,
    textTransform: "uppercase"
  },
  connectContent: {
    padding: 20,
    paddingBottom: 34
  },
  connectHeader: {
    alignItems: "center",
    paddingHorizontal: 4
  },
  connectGuideText: {
    color: "#9A4DFF",
    fontSize: 15,
    fontWeight: "900"
  },
  connectGuideBody: {
    color: "rgba(232, 226, 255, 0.82)",
    flex: 1,
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 19
  },
  connectGuideBulletDot: {
    backgroundColor: "#B96DFF",
    borderRadius: 999,
    height: 6,
    marginTop: 7,
    shadowColor: "#B96DFF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.7,
    shadowRadius: 8,
    width: 6
  },
  connectGuideBulletRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 10
  },
  connectGuideBullets: {
    gap: 8,
    marginTop: 14
  },
  connectGuideCard: {
    borderColor: "rgba(174, 98, 255, 0.34)",
    borderRadius: 22,
    borderWidth: 1,
    overflow: "hidden",
    shadowColor: "#8E35FF",
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.2,
    shadowRadius: 22
  },
  connectGuideCardFill: {
    paddingHorizontal: 16,
    paddingVertical: 16
  },
  connectGuideCardHeader: {
    flex: 1,
    minWidth: 0
  },
  connectGuideCardTop: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12
  },
  connectGuideClose: {
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.09)",
    borderColor: "rgba(255, 255, 255, 0.14)",
    borderRadius: 999,
    borderWidth: 1,
    height: 42,
    justifyContent: "center",
    position: "absolute",
    right: 14,
    top: 14,
    width: 42,
    zIndex: 2
  },
  connectGuideContent: {
    gap: 14,
    paddingHorizontal: 18
  },
};
