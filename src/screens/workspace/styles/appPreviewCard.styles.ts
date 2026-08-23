import { Platform, StyleSheet } from "react-native";
import { colors } from "../../../styles/theme";
import { communityDetailAccent, communityDetailAccentDark } from "../data/community";

export const styleSource = {
  appPreviewIcon: {
      alignItems: "center",
      borderRadius: 12,
      height: 42,
      justifyContent: "center",
      width: 42
    },
  appPreviewBody: {
      flex: 1,
      minWidth: 0
    },
  appPreviewLabel: {
      color: "#91A7FF",
      fontSize: 11,
      fontWeight: "900",
      letterSpacing: 0.6,
      textTransform: "uppercase"
    },
  appPreviewTitle: {
      color: "#FFFFFF",
      fontSize: 15,
      fontWeight: "900",
      marginTop: 2
    }
} as const;
