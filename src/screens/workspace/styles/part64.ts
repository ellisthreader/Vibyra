import { colors } from "../../../styles/theme";

export const part64 = {
  sidePanelRoot: {
    flex: 1
  },
  sidePanelScrim: {
    backgroundColor: "rgba(0, 0, 0, 0.62)",
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0
  },
  sidePanelScrimFill: {
    flex: 1
  },
  sidePanelSheet: {
    backgroundColor: colors.background,
    bottom: 0,
    position: "absolute",
    shadowColor: "#000000",
    shadowOffset: { width: 12, height: 0 },
    shadowOpacity: 0.28,
    shadowRadius: 26,
    top: 0,
    width: "100%"
  },
  sidePanelSheetLeft: {
    borderRightColor: "rgba(139, 92, 255, 0.18)",
    borderRightWidth: 1,
    left: 0
  },
  sidePanelSheetRight: {
    borderLeftColor: "rgba(139, 92, 255, 0.18)",
    borderLeftWidth: 1,
    right: 0
  },
  menuPage: {
    flex: 1,
    gap: 16,
    overflow: "hidden",
    paddingHorizontal: 18
  },
  menuPageScroll: {
    flex: 1
  },
  menuPageScrollContent: {
    gap: 14,
    paddingBottom: 28
  },
  menuPageHeaderRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  menuPageAccount: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    gap: 12,
    minWidth: 0
  },
  menuHeaderAvatar: {
    alignItems: "center",
    backgroundColor: "rgba(109, 59, 255, 0.08)",
    borderColor: "rgba(139, 92, 255, 0.32)",
    borderRadius: 999,
    borderWidth: 1,
    height: 34,
    justifyContent: "center",
    width: 34
  },
  menuHeaderAvatarPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.92 }]
  }
} as const;
