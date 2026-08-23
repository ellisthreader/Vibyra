import { Platform, StyleSheet } from "react-native";
import { colors } from "../../../styles/theme";
import { communityDetailAccent, communityDetailAccentDark } from "../data/community";

export const styleSource = {
  topBar: {
      alignItems: "center",
      backgroundColor: "#0E0F12",
      borderBottomColor: "rgba(91, 91, 112, 0.18)",
      borderBottomWidth: 1,
      flexDirection: "row",
      gap: 10,
      justifyContent: "space-between",
      minHeight: 74,
      paddingBottom: 10,
      paddingHorizontal: 16,
      paddingTop: 10,
      position: "relative"
    },
  chatTopActions: {
      alignItems: "center",
      flexDirection: "row",
      flexShrink: 1,
      gap: 7,
      justifyContent: "flex-end",
      minWidth: 0
    },
  chatTopBar: {
      backgroundColor: "#0E0F12",
      borderBottomColor: "rgba(116, 144, 255, 0.10)",
      borderBottomWidth: 1,
      gap: 8,
      justifyContent: "space-between",
      paddingHorizontal: 12
    },
  chatTopIconButton: {
      alignItems: "center",
      backgroundColor: "rgba(255, 255, 255, 0.04)",
      borderColor: "rgba(116, 144, 255, 0.16)",
      borderRadius: 12,
      borderWidth: 1,
      height: 38,
      justifyContent: "center",
      width: 38
    }
} as const;
