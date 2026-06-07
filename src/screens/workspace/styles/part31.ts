import { Platform, StyleSheet } from "react-native";
import { colors } from "../../../styles/theme";
import { communityDetailAccent, communityDetailAccentDark } from "../data/community";

export const part31 = {
  dashboardPage: {
    flex: 1,
    gap: 12,
    width: "100%"
  },
  dashboardPageCompact: {
    gap: 10
  },
  dashboardLogo: {
    height: 36,
    width: 52
  },
  dashboardLogoChat: {
    height: 38,
    width: 54
  },
} as const;
