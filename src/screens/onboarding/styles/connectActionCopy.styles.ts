import { StyleSheet } from "react-native";
import { colors } from "../../../styles/theme";

export const styleSource = {
  connectActionCopy: {
      flex: 1,
      minWidth: 0
    },
  connectActionMeta: {
      color: colors.muted,
      fontSize: 13,
      fontWeight: "700",
      lineHeight: 18,
      marginTop: 3
    }
} as const;
