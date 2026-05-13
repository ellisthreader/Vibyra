import { Platform, StyleSheet } from "react-native";
import { colors } from "../../../styles/theme";
import { communityDetailAccent, communityDetailAccentDark } from "../data/community";

export const part43 = {
  communityAnalytics: {
    flex: 1,
    padding: 11
  },
  communityAnalyticsLogoBar: {
    borderRadius: 999,
    width: 5
  },
  communityAnalyticsLogoBars: {
    alignItems: "flex-end",
    flexDirection: "row",
    gap: 4,
    height: "78%"
  },
  communityAuthorAvatar: {
    alignItems: "center",
    borderWidth: 1,
    justifyContent: "center",
    overflow: "hidden"
  },
  communityAuthorAvatarText: {
    fontWeight: "900"
  },
  communityAvatar: {
    alignItems: "center",
    borderRadius: 9,
    height: 40,
    justifyContent: "center",
    width: 40
  },
  communityAvatarText: {
    fontSize: 18,
    fontWeight: "900"
  },
} as const;
