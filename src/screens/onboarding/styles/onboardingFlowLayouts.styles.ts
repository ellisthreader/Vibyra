import { StyleSheet } from "react-native";
import { colors } from "../../../styles/theme";

export const styleSource = {
  flow: {
      flex: 1,
      paddingHorizontal: 20,
      paddingBottom: 20,
      paddingTop: 14
    },
  flowFrequency: {
      flex: 1,
      paddingBottom: 8,
      paddingHorizontal: 24,
      paddingTop: 8
    },
  flowResult: {
      flex: 1,
      paddingBottom: 8,
      paddingHorizontal: 24,
      paddingTop: 8
    },
  flowPaywall: {
      paddingBottom: 0,
      paddingHorizontal: 0,
      paddingTop: 0
    },
  flowFullBleed: {
      paddingBottom: 0,
      paddingHorizontal: 0,
      paddingTop: 0
    },
  flowMoment: {
      justifyContent: "space-between",
      overflow: "hidden",
      paddingBottom: 0,
      paddingHorizontal: 0,
      paddingTop: 0
    }
} as const;
