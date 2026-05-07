import { Platform, StyleSheet } from "react-native";
import { colors } from "../../../styles/theme";
import { communityDetailAccent, communityDetailAccentDark } from "../data/community";

export const part15 = {
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
  communityPostStatLiked: {
    color: "#FF9DBB"
  },
  communityPostTag: {
    borderRadius: 999,
    fontSize: 10,
    fontWeight: "900",
    overflow: "hidden",
    paddingHorizontal: 9,
    paddingVertical: 5
  },
  communityPostTagBlue: {
    backgroundColor: "rgba(37, 88, 178, 0.32)",
    color: "#5792FF"
  },
  communityPostTagGreen: {
    backgroundColor: "rgba(45, 177, 106, 0.18)",
    color: "#51E895"
  },
  communityPostTagPurple: {
    backgroundColor: "rgba(83, 31, 150, 0.52)",
    color: "#B96DFF"
  },
  communityPostTags: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6
  },
  communityPostTime: {
    color: "#A9A5B8",
    fontSize: 12,
    fontWeight: "800",
    marginTop: 2
  },
  communityPostTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "900",
    letterSpacing: 0,
    lineHeight: 20
  },
  communityPostTitleBlock: {
    flex: 1,
    minWidth: 0
  },
  communityPostTop: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 12
  },
  communityPostOpenButton: {
    alignItems: "center",
    backgroundColor: "rgba(126, 72, 255, 0.18)",
    borderColor: "rgba(183, 139, 255, 0.36)",
    borderRadius: 10,
    borderWidth: 1,
    height: 32,
    justifyContent: "center",
    paddingHorizontal: 14
  },
  communityPostOpenText: {
    color: "#D8C8FF",
    fontSize: 12,
    fontWeight: "900"
  },
  communityPostUser: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "900",
    lineHeight: 17
  },
  communityPostSide: {
    alignItems: "flex-end",
    gap: 10,
    justifyContent: "space-between"
  },
  communityPreview: {
    backgroundColor: "rgba(10, 14, 25, 0.96)",
    borderRadius: 7,
    borderWidth: 1,
    flexDirection: "row",
    height: 84,
    overflow: "hidden",
    width: 122
  },
  communityPreviewContent: {
    flex: 1,
    padding: 8
  },
  communityPreviewRow: {
    backgroundColor: "rgba(255, 255, 255, 0.11)",
    borderRadius: 999,
    height: 5,
    marginTop: 5,
    width: "86%"
  },
  communityPreviewRows: {
    marginTop: 6
  },
  communityPreviewRowShort: {
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 999,
    height: 5,
    marginTop: 5,
    width: "62%"
  },
  communityPreviewSidebar: {
    backgroundColor: "rgba(15, 14, 28, 0.92)",
    gap: 6,
    paddingHorizontal: 7,
    paddingTop: 9,
    width: 32
  },
} as const;
