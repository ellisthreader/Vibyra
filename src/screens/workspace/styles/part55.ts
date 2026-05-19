export const part55 = {
  chatMoreButton: {
    alignItems: "center",
    backgroundColor: "transparent",
    borderColor: "transparent",
    borderRadius: 999,
    borderWidth: 0,
    height: 38,
    justifyContent: "center",
    width: 38
  },
  chatMoreMenuWrap: {
    position: "relative"
  },
  chatOptionsLabel: {
    color: "#F6F2FF",
    flex: 1,
    fontSize: 15,
    fontWeight: "800",
    lineHeight: 20
  },
  chatOptionsLabelDelete: {
    color: "#FFB4C1"
  },
  chatOptionsMenu: {
    backgroundColor: "rgba(20, 21, 28, 0.98)",
    borderColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 14,
    borderWidth: 1,
    gap: 2,
    minWidth: 156,
    padding: 6,
    position: "absolute",
    right: 0,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.28,
    shadowRadius: 18,
    top: 44,
    zIndex: 30
  },
  chatOptionsRow: {
    alignItems: "center",
    borderRadius: 10,
    flexDirection: "row",
    gap: 10,
    minHeight: 38,
    paddingHorizontal: 10
  },
  chatOptionsRowPressed: {
    backgroundColor: "rgba(255, 255, 255, 0.08)"
  }
} as const;
