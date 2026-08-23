import { Platform, StyleSheet } from "react-native";
import { colors } from "../../../styles/theme";
import { communityDetailAccent, communityDetailAccentDark } from "../data/community";

export const styleSource = {
  chatArtPanel: {
      backgroundColor: "rgba(26, 12, 70, 0.5)",
      borderColor: "rgba(156, 50, 255, 0.72)",
      borderRadius: 8,
      borderWidth: 1,
      paddingHorizontal: 12,
      paddingTop: 13,
      position: "absolute",
      shadowColor: "#4667E8",
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.5,
      shadowRadius: 16
    },
  chatArtPanelBack: {
      height: 94,
      right: 28,
      top: 22,
      width: 94,
      zIndex: 1
    },
  chatArtPanelDot: {
      backgroundColor: "rgba(92, 43, 178, 0.84)",
      borderRadius: 999,
      height: 15,
      left: 14,
      position: "absolute",
      top: 23,
      width: 15
    },
  chatArtPanelFront: {
      bottom: 27,
      height: 65,
      right: 11,
      width: 80,
      zIndex: 2
    }
} as const;
