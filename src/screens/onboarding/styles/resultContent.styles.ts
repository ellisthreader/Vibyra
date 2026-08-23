import { StyleSheet } from "react-native";
import { colors } from "../../../styles/theme";

export const styleSource = {
  resultContent: {
      alignItems: "center",
      flex: 1,
      justifyContent: "center",
      paddingBottom: 4,
      paddingTop: 0
    },
  resultProgressWrap: {
      paddingHorizontal: 8,
      paddingTop: 8
    },
  resultTitleBlock: {
      alignItems: "center",
      width: "100%"
    },
  resultTitleGradientFill: {
      height: 40,
      width: "100%"
    },
  resultTitleGradientMask: {
      alignSelf: "center",
      height: 40,
      justifyContent: "flex-start",
      overflow: "visible",
      width: "100%"
    },
  resultTitleGradientText: {
      color: colors.text,
      fontSize: 31,
      fontWeight: "900",
      letterSpacing: 0,
      lineHeight: 37,
      textAlign: "center"
    },
  resultTitlePrimary: {
      color: colors.text,
      fontSize: 29,
      fontWeight: "900",
      letterSpacing: 0,
      lineHeight: 35,
      textAlign: "center",
      textShadow: "0px 0px 14px rgba(255, 255, 255, 0.22)",
      width: "100%"
    },
  resultTitle: { textAlign: "center", width: "100%" }
} as const;
