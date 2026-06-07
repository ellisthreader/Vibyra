export const part51 = {
  workspaceConnectionIconTile: {
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    borderColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 13,
    borderWidth: 1,
    height: 42,
    justifyContent: "center",
    position: "relative",
    width: 42
  },
  workspaceConnectionStatusBadge: {
    backgroundColor: "#7CF1B3",
    borderColor: "rgba(8, 10, 18, 0.99)",
    borderRadius: 999,
    borderWidth: 2,
    bottom: -3,
    height: 14,
    position: "absolute",
    right: -3,
    width: 14
  },
  workspaceConnectionStatusBadgeOffline: {
    backgroundColor: "#FF9DAE"
  },
  workspaceConnectionLabel: {
    color: "#9EA3B2",
    fontSize: 10.5,
    fontWeight: "900",
    letterSpacing: 0,
    textTransform: "uppercase"
  },
  workspaceConnectionLabelOnline: {
    color: "#7CF1B3"
  },
  workspaceConnectionName: {
    color: "#F4F6FB",
    fontSize: 14,
    fontWeight: "900",
    lineHeight: 18,
    marginTop: 1
  },
  workspaceMenuDivider: {
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    height: 1,
    marginVertical: 4
  },
  workspaceMenuHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4
  },
  workspaceMenuIconButton: {
    alignItems: "center",
    backgroundColor: "transparent",
    borderColor: "transparent",
    borderRadius: 999,
    borderWidth: 0,
    height: 40,
    justifyContent: "center",
    width: 40
  },
  workspaceMenuList: {
    gap: 7
  },
  workspaceMenuPanel: {
    backgroundColor: "rgba(8, 10, 18, 0.99)",
    borderColor: "rgba(255, 255, 255, 0.08)",
    borderRightWidth: 1,
    borderTopRightRadius: 24,
    borderBottomRightRadius: 24,
    gap: 16,
    minHeight: "100%",
    paddingBottom: 24,
    paddingHorizontal: 12,
    shadowColor: "#000000",
    shadowOffset: { width: 10, height: 0 },
    shadowOpacity: 0.32,
    shadowRadius: 24,
    width: 300
  },
  workspaceMenuRowIcon: {
    alignItems: "center",
    height: 30,
    justifyContent: "center",
    width: 30
  },
  workspaceMenuRowIconActive: {
    backgroundColor: "transparent",
    borderRadius: 11
  },
  workspaceMenuRowLabel: {
    color: "#D5D9E4",
    flex: 1,
    fontSize: 14,
    fontWeight: "800",
    lineHeight: 18
  },
  workspaceMenuRowMeta: {
    color: "#8F94A3",
    fontSize: 11,
    fontWeight: "900"
  },
  workspaceMenuRowLabelActive: {
    color: "#FFFFFF",
    fontWeight: "900"
  },
  workspaceMenuRowMetaActive: {
    color: "#C8CBD6"
  },
  workspaceMenuSectionLabel: {
    color: "#8F94A3",
    fontSize: 10.5,
    fontWeight: "900",
    letterSpacing: 0,
    marginLeft: 4,
    textTransform: "uppercase"
  }
} as const;
