import { Platform, StyleSheet } from "react-native";
import { colors } from "../../../styles/theme";
import { communityDetailAccent, communityDetailAccentDark } from "../data/community";

export const styleSource = {
  lowCreditsButton: {
      alignItems: "center",
      backgroundColor: "rgba(255, 242, 0, 0.14)",
      borderColor: "rgba(255, 242, 0, 0.34)",
      borderRadius: 10,
      borderWidth: 1,
      justifyContent: "center",
      minHeight: 36,
      paddingHorizontal: 12
    },
  lowCreditsButtonText: {
      color: "#FFF200",
      fontSize: 12,
      fontWeight: "900"
    },
  lowCreditsCard: {
      alignItems: "center",
      backgroundColor: "rgba(13, 15, 25, 0.94)",
      borderColor: "rgba(255, 242, 0, 0.22)",
      borderRadius: 15,
      borderWidth: 1,
      flexDirection: "row",
      gap: 11,
      marginBottom: 10,
      padding: 12,
      shadowColor: "#FFF200",
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.16,
      shadowRadius: 18
    },
  lowCreditsCopy: {
      flex: 1,
      minWidth: 0
    },
  lowCreditsIcon: {
      alignItems: "center",
      backgroundColor: "rgba(255, 242, 0, 0.1)",
      borderColor: "rgba(255, 242, 0, 0.26)",
      borderRadius: 11,
      borderWidth: 1,
      height: 39,
      justifyContent: "center",
      width: 39
    },
  lowCreditsText: {
      color: "#C9C3D5",
      fontSize: 12,
      fontWeight: "800",
      lineHeight: 16,
      marginTop: 2
    },
  lowCreditsTitle: {
      color: colors.text,
      fontSize: 14,
      fontWeight: "900",
      lineHeight: 18
    }
} as const;
