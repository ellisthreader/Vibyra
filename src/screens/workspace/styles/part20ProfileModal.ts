import { colors } from "../../../styles/theme";

export const part20ProfileModal = {
  profileLevelMapRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 11,
    minHeight: 56,
    paddingHorizontal: 12
  },
  profileLevelMapRowCurrent: {
    backgroundColor: "rgba(221, 187, 255, 0.06)"
  },
  profileLevelMapTitle: {
    color: "#DAD6F6",
    fontSize: 14,
    fontWeight: "900",
    lineHeight: 18
  },
  profileLevelMapTitleCurrent: {
    color: "#FFFFFF"
  },
  profileLevelMapToggle: {
    alignItems: "center",
    backgroundColor: "transparent",
    borderColor: "transparent",
    borderRadius: 999,
    borderWidth: 0,
    flexDirection: "row",
    gap: 6,
    minHeight: 34,
    paddingHorizontal: 14
  },
  profileLevelMapToggleText: {
    color: "#EDE9FF",
    fontSize: 12,
    fontWeight: "900"
  },
  profileLevelPanel: {
    flex: 1,
    justifyContent: "center",
    overflow: "hidden",
    paddingHorizontal: 0,
    paddingVertical: 0
  },
  profileLevelReward: {
    color: "#FFD166",
    flexShrink: 1,
    fontSize: 11,
    fontWeight: "900",
    lineHeight: 14,
    textAlign: "right"
  },
  profileLevelRewardPill: {
    alignItems: "center",
    backgroundColor: "rgba(255, 179, 71, 0.13)",
    borderColor: "rgba(255, 179, 71, 0.3)",
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    flexShrink: 1,
    gap: 5,
    maxWidth: 116,
    paddingHorizontal: 7,
    paddingVertical: 5
  },
  profileLevelShell: {
    alignItems: "stretch",
    flexDirection: "row",
    gap: 7,
    paddingBottom: 5,
    paddingHorizontal: 6,
    paddingTop: 5
  },
  profileLevelStat: {
    alignItems: "center",
    backgroundColor: "rgba(18, 18, 26, 0.62)",
    borderColor: "rgba(221, 187, 255, 0.14)",
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    gap: 3,
    minWidth: 0,
    paddingHorizontal: 6,
    paddingVertical: 9
  },
  profileLevelStatsRow: {
    flexDirection: "row",
    gap: 8
  }
} as const;
