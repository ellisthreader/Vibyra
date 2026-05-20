import { colors } from "../../../styles/theme";

export const part20ProfileLevels = {
  profileLevelHelpBulletRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 9
  },
  profileLevelHelpIcon: {
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    borderColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 10,
    borderWidth: 1,
    height: 30,
    justifyContent: "center",
    width: 30
  },
  profileLevelHelpPanel: {
    backgroundColor: "rgba(15, 15, 24, 0.7)",
    borderColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 10,
    borderWidth: 1,
    padding: 13
  },
  profileLevelHelpRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  profileLevelHelpText: {
    color: "#C8C3D3",
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 16
  },
  profileLevelHelpTitle: {
    color: colors.text,
    fontSize: 12,
    fontWeight: "900",
    lineHeight: 16
  },
  profileLevelHeaderBadge: {
    alignItems: "center",
    backgroundColor: "rgba(139, 53, 255, 0.16)",
    borderColor: "rgba(194, 89, 255, 0.3)",
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 6
  },
  profileLevelHeaderBadgeText: {
    color: "#DDBBFF",
    fontSize: 12,
    fontWeight: "900"
  },
  profileLevelMeta: {
    color: "#AAA5B8",
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 16
  },
  profileLevelMap: {
    backgroundColor: "rgba(15, 15, 24, 0.62)",
    borderColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 10,
    borderWidth: 1,
    overflow: "hidden"
  },
  profileLevelMapBody: {
    flex: 1,
    minWidth: 0
  },
  profileLevelMapLine: {
    backgroundColor: "rgba(221, 187, 255, 0.28)",
    flex: 1,
    width: 2
  },
  profileLevelMapLineHidden: {
    opacity: 0
  },
  profileLevelMapMeta: {
    color: "#9C97AE",
    fontSize: 11,
    fontWeight: "800",
    lineHeight: 15
  },
  profileLevelMapRank: {
    color: "#DDBBFF",
    fontSize: 12,
    fontWeight: "900",
    lineHeight: 16,
    marginTop: 1
  },
  profileLevelMapFooter: {
    alignItems: "center",
    borderTopColor: "rgba(221, 187, 255, 0.12)",
    borderTopWidth: 1,
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 12
  },
  profileLevelMapFooterText: {
    color: "#9C97AE",
    fontSize: 11,
    fontWeight: "800",
    lineHeight: 15
  },
  profileLevelMapNoReward: {
    color: "#656073",
    flexShrink: 0,
    fontSize: 11,
    fontWeight: "900",
    minWidth: 42,
    textAlign: "right"
  },
  profileLevelMapNode: {
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderColor: "rgba(255, 255, 255, 0.12)",
    borderRadius: 999,
    borderWidth: 1,
    height: 22,
    justifyContent: "center",
    width: 22
  },
  profileLevelMapNodeComplete: {
    backgroundColor: "#56E6A5",
    borderColor: "#56E6A5"
  },
  profileLevelMapNodeCurrent: {
    backgroundColor: "#DDBBFF",
    borderColor: "#DDBBFF"
  },
  profileLevelMapReward: {
    alignItems: "center",
    backgroundColor: "rgba(194, 89, 255, 0.12)",
    borderColor: "rgba(194, 89, 255, 0.22)",
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    flexShrink: 0,
    gap: 4,
    minWidth: 68,
    paddingHorizontal: 8,
    paddingVertical: 5
  },
  profileLevelMapRewardText: {
    color: "#DDBBFF",
    fontSize: 11,
    fontWeight: "900"
  },
  profileLevelMapCollapse: {
    alignItems: "center",
    borderTopColor: "rgba(221, 187, 255, 0.12)",
    borderTopWidth: 1,
    flexDirection: "row",
    gap: 6,
    justifyContent: "center",
    paddingHorizontal: 12,
    paddingVertical: 12
  },
  profileLevelMapRoute: {
    alignItems: "center",
    alignSelf: "stretch",
    width: 28
  }
} as const;
