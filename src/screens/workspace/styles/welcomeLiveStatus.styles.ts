import { Platform, StyleSheet } from "react-native";
import { colors } from "../../../styles/theme";
import { communityDetailAccent, communityDetailAccentDark } from "../data/community";

export const styleSource = {
  welcomeLiveDot: {
      backgroundColor: "#68F8A6",
      borderRadius: 999,
      height: 8,
      width: 8
    },
  welcomeLivePill: {
      alignItems: "center",
      alignSelf: "flex-start",
      backgroundColor: "rgba(55, 214, 122, 0.1)",
      borderColor: "rgba(95, 235, 154, 0.2)",
      borderRadius: 999,
      borderWidth: 1,
      flexDirection: "row",
      gap: 7,
      marginBottom: 9,
      paddingHorizontal: 10,
      paddingVertical: 5
    },
  welcomeLiveText: {
      color: "#D7D1E7",
      fontSize: 11,
      fontWeight: "900",
      letterSpacing: 0,
      textTransform: "uppercase"
    },
  welcomeTitle: {
      color: colors.text,
      fontSize: 24,
      fontWeight: "900",
      letterSpacing: 0,
      lineHeight: 28,
      textAlign: "left"
    }
} as const;
