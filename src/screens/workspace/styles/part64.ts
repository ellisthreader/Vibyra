import { colors } from "../../../styles/theme";

export const part64 = {
  sidePanelRoot: {
    flex: 1
  },
  sidePanelScrim: {
    backgroundColor: "rgba(0, 0, 0, 0.5)",
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
    top: 0,
    width: "100%"
  },
  sidePanelSheetLeft: {
    left: 0
  },
  sidePanelSheetRight: {
    right: 0
  },
  menuPage: {
    flex: 1,
    gap: 16,
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
    borderRadius: 999,
    height: 32,
    justifyContent: "center",
    width: 32
  },
  menuHeaderAvatarPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.92 }]
  }
} as const;
