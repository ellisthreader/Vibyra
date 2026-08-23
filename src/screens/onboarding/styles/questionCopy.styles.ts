import { StyleSheet } from "react-native";
import { colors } from "../../../styles/theme";

export const styleSource = {
  questionHelper: { color: colors.dim, fontSize: 14, fontWeight: "700", lineHeight: 20, marginTop: 8 },
  question: {
      flex: 1,
      justifyContent: "center",
      paddingBottom: 10
    }
} as const;
