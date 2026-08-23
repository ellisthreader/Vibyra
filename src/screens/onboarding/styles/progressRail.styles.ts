import { StyleSheet } from "react-native";
import { colors } from "../../../styles/theme";

export const styleSource = {
  progressFill: {
      borderRadius: 999,
      height: "100%"
    },
  progressRail: {
      backgroundColor: "rgba(255, 255, 255, 0.1)",
      borderRadius: 999,
      height: 7,
      overflow: "hidden"
    },
  progressWrap: {
      alignSelf: "stretch",
      paddingHorizontal: 2,
      paddingTop: 6
    }
} as const;
