export const part56 = {
  chatEffortInlineButton: {
    alignItems: "center",
    flexDirection: "row",
    gap: 5,
    height: 34,
    justifyContent: "center",
    paddingLeft: 8,
    paddingRight: 10
  },
  chatEffortInlineLabel: {
    color: "#DAD6E7",
    fontSize: 12.5,
    fontWeight: "900",
    lineHeight: 16
  },
  chatModelEffortControl: {
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.045)",
    borderColor: "rgba(176, 132, 255, 0.16)",
    borderRadius: 13,
    borderWidth: 1,
    flexDirection: "row",
    gap: 7,
    height: 36,
    overflow: "hidden",
    paddingHorizontal: 10
  },
  chatModelEffortChoice: {
    alignItems: "center",
    borderColor: "rgba(176, 132, 255, 0.14)",
    borderRadius: 9,
    borderWidth: 1,
    flexDirection: "row",
    gap: 4,
    minHeight: 30,
    paddingHorizontal: 8
  },
  chatModelEffortChoiceActive: {
    backgroundColor: "rgba(176, 132, 255, 0.16)",
    borderColor: "rgba(176, 132, 255, 0.36)"
  },
  chatModelEffortChoices: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6
  },
  chatModelEffortChoiceText: {
    color: "#C9C2D6",
    fontSize: 11,
    fontWeight: "900",
    lineHeight: 14
  },
  chatModelEffortChoiceTextActive: {
    color: "#FFFFFF"
  },
  chatModelEffortDivider: {
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    height: 20,
    width: 1
  },
  chatModelEffortHeader: {
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    borderColor: "rgba(176, 132, 255, 0.16)",
    borderRadius: 12,
    borderWidth: 1,
    gap: 9,
    marginBottom: 4,
    padding: 9
  },
  chatModelEffortHeaderTop: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8
  },
  chatModelEffortMeta: {
    color: "#8F8A9E",
    fontSize: 10,
    fontWeight: "900",
    textTransform: "uppercase"
  },
  chatModelEffortTitle: {
    color: "#F3F1FA",
    flex: 1,
    fontSize: 13,
    fontWeight: "900",
    lineHeight: 17
  },
  chatModelLogoButton: {
    alignItems: "center",
    flexDirection: "row",
    gap: 3,
    height: 34,
    justifyContent: "center",
    paddingLeft: 10,
    paddingRight: 8
  }
} as const;
