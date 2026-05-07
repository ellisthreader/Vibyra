import { StyleSheet } from "react-native";
import { colors } from "../../../styles/theme";

export const part16 = {
  communityPrimaryOpenText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "900"
  },
  communitySmallAction: {
    alignItems: "center",
    backgroundColor: "rgba(12, 15, 24, 0.5)",
    borderColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: "row",
    gap: 7,
    height: 46,
    justifyContent: "center",
    minWidth: 78,
    paddingHorizontal: 10
  },
  communitySmallActionText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "900"
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
  communityPostBody: {
    flex: 1,
    gap: 8,
    minWidth: 0
  },
  communityPostCard: {
    backgroundColor: "rgba(8, 13, 24, 0.86)",
    borderColor: "rgba(128, 106, 180, 0.26)",
    borderRadius: 14,
    borderWidth: 1,
    gap: 12,
    minHeight: 142,
    padding: 13
  },
  communityPostCardPressed: {
    borderColor: "rgba(183, 139, 255, 0.54)",
    opacity: 0.88,
    transform: [{ scale: 0.99 }]
  },
  communityPostDescription: {
    color: "#B2AFC1",
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 16,
    marginTop: 4
  },
  communityPostBottom: {
    alignItems: "center",
    flexDirection: "row",
    gap: 9,
    justifyContent: "space-between"
  },
  communityPostLeft: {
    flex: 1,
    flexDirection: "row",
    gap: 10,
    minWidth: 0
  },
  communityPostStat: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6
  },
  communityPostStats: {
    alignItems: "center",
    flexDirection: "row",
    flex: 1,
    gap: 14
  },
  communityPostStatText: {
    color: "#B7B4C8",
    fontSize: 12,
    fontWeight: "900"
  },
};
