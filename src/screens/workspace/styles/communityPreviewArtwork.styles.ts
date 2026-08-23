import { Platform, StyleSheet } from "react-native";
import { colors } from "../../../styles/theme";
import { communityDetailAccent, communityDetailAccentDark } from "../data/community";

export const styleSource = {
  communityGeneratedLogo: {
      alignItems: "center",
      borderColor: "rgba(170, 83, 255, 0.34)",
      borderWidth: 1,
      justifyContent: "center",
      overflow: "hidden",
      shadowColor: "#4667E8",
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.18,
      shadowRadius: 16
    },
  communityGeneratedLogoInner: {
      alignItems: "center",
      backgroundColor: "rgba(22, 11, 43, 0.36)",
      height: "82%",
      justifyContent: "center",
      overflow: "hidden",
      position: "relative",
      width: "82%"
    },
  communityMiniCard: {
      backgroundColor: "rgba(255, 255, 255, 0.04)",
      borderColor: "rgba(255, 255, 255, 0.08)",
      borderRadius: 8,
      borderWidth: 1,
      flex: 1,
      gap: 7,
      minHeight: 112,
      minWidth: 150,
      padding: 14
    },
  communityPreviewGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10
    }
} as const;
