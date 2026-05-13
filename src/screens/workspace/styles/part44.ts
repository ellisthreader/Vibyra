import { colors } from "../../../styles/theme";

export const part44 = {
  projectBriefBackButton: {
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.045)",
    borderColor: "rgba(176, 132, 255, 0.18)",
    borderRadius: 12,
    borderWidth: 1,
    height: 34,
    justifyContent: "center",
    width: 34
  },
  projectBriefCustomButton: {
    alignItems: "center",
    backgroundColor: "#7A3DFF",
    borderRadius: 12,
    flexDirection: "row",
    gap: 7,
    justifyContent: "center",
    minHeight: 42,
    paddingHorizontal: 13
  },
  projectBriefCustomButtonText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "900"
  },
  projectBriefCustomInput: {
    backgroundColor: "rgba(255, 255, 255, 0.045)",
    borderColor: "rgba(176, 132, 255, 0.18)",
    borderRadius: 12,
    borderWidth: 1,
    color: colors.text,
    flex: 1,
    fontSize: 14,
    fontWeight: "800",
    minHeight: 42,
    paddingHorizontal: 12
  },
  projectBriefCustomPanel: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    width: "100%"
  },
  projectBriefFramework: {
    alignItems: "center",
    backgroundColor: "rgba(15, 17, 26, 0.92)",
    borderColor: "rgba(176, 132, 255, 0.18)",
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    minHeight: 70,
    padding: 12
  },
  projectBriefFrameworkDescription: {
    color: "#B9B5C8",
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 16
  },
  projectBriefFrameworkRecommended: {
    borderColor: "rgba(176, 132, 255, 0.34)"
  },
  projectBriefFrameworkText: {
    flex: 1,
    gap: 3
  },
  projectBriefFrameworkTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "900"
  },
  projectBriefFrameworks: {
    gap: 10
  },
  projectBriefGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10
  },
  projectBriefKicker: {
    color: "#B084FF",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0,
    textTransform: "uppercase"
  },
  projectBriefOption: {
    backgroundColor: "rgba(15, 17, 26, 0.92)",
    borderColor: "rgba(176, 132, 255, 0.18)",
    borderRadius: 14,
    borderWidth: 1,
    flexBasis: "47.5%",
    flexGrow: 1,
    gap: 7,
    minHeight: 118,
    padding: 12
  },
  projectBriefOptionIcon: {
    alignItems: "center",
    backgroundColor: "rgba(176, 132, 255, 0.12)",
    borderRadius: 12,
    height: 34,
    justifyContent: "center",
    width: 34
  },
  projectBriefOptionPressed: {
    opacity: 0.82,
    transform: [{ scale: 0.98 }]
  },
  projectBriefOptionText: {
    color: "#B9B5C8",
    fontSize: 11.5,
    fontWeight: "700",
    lineHeight: 16
  },
  projectBriefOptionTitle: {
    color: colors.text,
    fontSize: 13.5,
    fontWeight: "900"
  },
  projectBriefRecommendedPill: {
    backgroundColor: "rgba(124, 241, 179, 0.12)",
    borderColor: "rgba(124, 241, 179, 0.26)",
    borderRadius: 999,
    borderWidth: 1,
    color: "#B7FBD0",
    fontSize: 10.5,
    fontWeight: "900",
    overflow: "hidden",
    paddingHorizontal: 8,
    paddingVertical: 4
  },
  projectBriefShell: {
    gap: 16,
    paddingVertical: 2
  },
  projectBriefStepRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10
  },
  projectBriefStepTitle: {
    color: colors.text,
    flex: 1,
    fontSize: 15,
    fontWeight: "900"
  }
} as const;
