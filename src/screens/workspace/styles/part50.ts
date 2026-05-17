export const part50 = {
  topBar: {
    alignItems: "center",
    backgroundColor: "rgba(3, 4, 10, 0.98)",
    borderBottomColor: "rgba(255, 255, 255, 0.055)",
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between",
    minHeight: 62,
    paddingBottom: 8,
    paddingHorizontal: 12,
    paddingTop: 8,
    position: "relative"
  },
  workspaceConnectionRow: {
    alignItems: "center",
    backgroundColor: "transparent",
    borderColor: "transparent",
    borderRadius: 0,
    borderWidth: 0,
    flexDirection: "row",
    gap: 12,
    minHeight: 46,
    paddingHorizontal: 4
  },
  workspaceMenuPanel: {
    backgroundColor: "rgba(9, 10, 15, 0.98)",
    borderColor: "rgba(255, 255, 255, 0.08)",
    borderRightWidth: 1,
    borderTopRightRadius: 22,
    borderBottomRightRadius: 22,
    gap: 12,
    minHeight: "100%",
    paddingBottom: 22,
    paddingHorizontal: 12,
    shadowColor: "#000000",
    shadowOffset: { width: 10, height: 0 },
    shadowOpacity: 0.24,
    shadowRadius: 18,
    width: 292
  },
  workspaceMenuRow: {
    alignItems: "center",
    borderRadius: 14,
    flexDirection: "row",
    gap: 11,
    minHeight: 48,
    paddingHorizontal: 10
  },
  workspaceMenuRowActive: {
    backgroundColor: "rgba(255, 255, 255, 0.09)"
  },
  workspaceMenuTitle: {
    color: "#FFFFFF",
    fontSize: 30,
    fontWeight: "900",
    lineHeight: 34
  }
} as const;
