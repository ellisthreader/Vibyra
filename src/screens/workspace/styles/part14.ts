import { Platform, StyleSheet } from "react-native";
import { colors } from "../../../styles/theme";
import { communityDetailAccent, communityDetailAccentDark } from "../data/community";

export const part14 = {
  communityMakerMiniAvatar: {
    alignItems: "center",
    borderRadius: 999,
    height: 22,
    justifyContent: "center",
    width: 22
  },
  communityMakerMiniAvatarText: {
    fontSize: 11,
    fontWeight: "900"
  },
  communityMakerMiniDot: {
    color: "#6F6A80",
    fontSize: 11,
    fontWeight: "900"
  },
  communityMakerMiniName: {
    color: "#DAD6EA",
    fontSize: 12,
    fontWeight: "900",
    maxWidth: 118
  },
  communityMakerMiniRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 7
  },
  communityMakerMiniTime: {
    color: "#9D98AD",
    fontSize: 11,
    fontWeight: "800"
  },
  communityDetailMakerLine: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    minHeight: 44
  },
  communityMakerRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12
  },
  communityOpenedNotice: {
    alignItems: "flex-start",
    backgroundColor: "rgba(126, 72, 255, 0.1)",
    borderColor: "rgba(183, 139, 255, 0.24)",
    borderRadius: 13,
    borderWidth: 1,
    flexDirection: "row",
    gap: 9,
    padding: 12
  },
  communityOpenedText: {
    color: "#CFC8DE",
    flex: 1,
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 18
  },
  communityOpenButton: {
    borderRadius: 13,
    flex: 1,
    overflow: "hidden"
  },
  communityOpenGradient: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    height: 44,
    justifyContent: "center",
    paddingHorizontal: 14
  },
  communityOpenText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "900"
  },
  communityPrimaryOpenButton: {
    borderRadius: 10,
    flex: 1,
    height: 44,
    minWidth: 0,
    overflow: "hidden"
  },
  communityPrimaryOpenGradient: {
    alignItems: "center",
    flexDirection: "row",
    gap: 9,
    height: "100%",
    justifyContent: "center",
    paddingHorizontal: 14
  },
  communityPrimaryOpenText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "900"
  },
  communitySmallAction: {
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.055)",
    borderColor: "rgba(255, 255, 255, 0.09)",
    borderRadius: 10,
    borderWidth: 1,
    height: 44,
    justifyContent: "center",
    width: 44
  },
  communitySmallActionText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "900"
  },
  communityLikeButton: {
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.055)",
    borderColor: "rgba(255, 255, 255, 0.09)",
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: "row",
    gap: 5,
    height: 44,
    justifyContent: "center",
    minWidth: 56,
    paddingHorizontal: 10
  },
  communityDetailActions: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8
  },
  communityDetailIconText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "900"
  },
  communityAboutBlock: {
    gap: 8,
    paddingTop: 0
  },
  communityPictureCard: {
    backgroundColor: "rgba(16, 18, 30, 0.78)",
    borderRadius: 13,
    borderWidth: 1,
    flex: 1,
    gap: 8,
    minWidth: 142,
    padding: 10
  },
  communityPictureGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10
  },
  communityDetailScreenshots: {
    gap: 9
  },
  communityScreenshotGrid: {
    flexDirection: "row",
    gap: 9
  },
  communityScreenshotLabel: {
    color: "#D8D3E4",
    fontSize: 12,
    fontWeight: "900"
  },
  communityScreenshotPreview: {
    flex: 1,
    gap: 7,
    minWidth: 0
  },
  communityPostBadge: {
    borderRadius: 999,
    fontSize: 10,
    fontWeight: "900",
    overflow: "hidden",
    paddingHorizontal: 9,
    paddingVertical: 5
  },
  communityPostBadgeBlue: {
    backgroundColor: "rgba(37, 88, 178, 0.32)",
    color: "#5792FF"
  },
  communityPostBadgeGreen: {
    backgroundColor: "rgba(45, 177, 106, 0.2)",
    color: "#51E895"
  },
  communityPostBadgePurple: {
    backgroundColor: "rgba(83, 31, 150, 0.52)",
    color: "#C975FF"
  },
} as const;
