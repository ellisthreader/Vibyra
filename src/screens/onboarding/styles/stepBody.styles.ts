import { StyleSheet } from "react-native";
import { colors } from "../../../styles/theme";

export const styleSource = {
  stepBody: {
      flex: 1,
      justifyContent: "center",
      paddingTop: 10
    },
  stepBodyFullBleed: {
      justifyContent: "flex-start",
      paddingTop: 0
    }
} as const;
