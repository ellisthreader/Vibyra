import { Platform, StyleSheet } from "react-native";
import { colors } from "../../../styles/theme";
import { communityDetailAccent, communityDetailAccentDark } from "../data/community";

export const styleSource = {
  profileMeta: {
      color: colors.muted,
      fontSize: 14,
      fontWeight: "700",
      marginTop: 3
    },
  profileName: {
      color: colors.text,
      fontSize: 23,
      fontWeight: "900",
      letterSpacing: 0
    },
  profileAvatarLarge: {
      alignItems: "center",
      backgroundColor: "transparent",
      borderColor: "transparent",
      borderRadius: 999,
      borderWidth: 0,
      height: 64,
      justifyContent: "center",
      overflow: "hidden",
      width: 64
    },
  profileAvatarImage: {
      borderRadius: 999,
      height: "100%",
      width: "100%"
    }
} as const;
