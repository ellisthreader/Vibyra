import { Platform, StyleSheet } from "react-native";
import { colors } from "../../../styles/theme";
import { communityDetailAccent, communityDetailAccentDark } from "../data/community";

export const styleSource = {
  chatSuggestionText: {
      color: colors.text,
      flex: 1,
      fontSize: 13,
      fontWeight: "900",
      lineHeight: 17
    },
  chatSuggestionDescription: {
      color: "#A6ADBA",
      fontSize: 12,
      fontWeight: "600",
      lineHeight: 16.5,
      marginTop: 2,
      width: "100%"
    },
  chatSuggestionIconGlyph: {
      marginBottom: 2
    },
  chatSuggestionTitle: {
      color: colors.text,
      fontSize: 14,
      fontWeight: "800",
      letterSpacing: 0.1,
      lineHeight: 18,
      width: "100%"
    },
  chatMessageList: {
      flex: 1,
      minHeight: 0
    },
  chatMessageListContent: {
      flexGrow: 1,
      gap: 4,
      paddingBottom: 14,
      paddingHorizontal: 8,
      paddingTop: 14
    },
  chatWelcomeBlock: {
      alignItems: "center",
      flex: 1,
      justifyContent: "center",
      minHeight: 0
    },
  chatWelcomeGlyph: {
      alignItems: "center",
      height: 136,
      justifyContent: "center",
      marginBottom: 18,
      marginTop: 8,
      width: 166
    },
  chatWelcomeGlyphImage: {
      height: 166,
      width: 166
    },
  chatWelcomeSubtitle: {
      color: "#C1BCCE",
      fontSize: 14,
      fontWeight: "700",
      lineHeight: 20,
      marginTop: 9,
      maxWidth: 340,
      textAlign: "center"
    },
  chatWelcomeTitle: {
      color: colors.text,
      fontSize: 22,
      fontWeight: "900",
      letterSpacing: 0,
      lineHeight: 28,
      textAlign: "center"
    },
  chatWelcomeOrb: {
      alignItems: "center",
      borderRadius: 999,
      height: 56,
      justifyContent: "center",
      marginBottom: 18,
      overflow: "hidden",
      shadowColor: "#4667E8",
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.45,
      shadowRadius: 18,
      width: 56
    },
  chatWelcomeOrbLogo: {
      height: 28,
      width: 28
    },
  chatWelcomeKicker: {
      color: "#7490FF",
      fontSize: 11,
      fontWeight: "900",
      letterSpacing: 0.7,
      marginBottom: 8,
      textAlign: "center",
      textTransform: "uppercase"
    },
  chatWelcomeSubtle: {
      color: "#A6ADBA",
      fontSize: 13.5,
      fontWeight: "500",
      lineHeight: 19,
      marginTop: 9,
      maxWidth: 320,
      textAlign: "center"
    },
  chatWindow: {
      backgroundColor: "#181A20",
      borderColor: "rgba(255, 255, 255, 0.08)",
      borderRadius: 8,
      borderWidth: 1,
      flex: 1,
      minWidth: 0,
      overflow: "hidden"
    },
  compactRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: 10,
      minHeight: 52
    },
  communityFeed: {
      flex: 1,
      gap: 10
    },
  communityAboutBlock: {
      gap: 9,
      paddingTop: 2
    }
} as const;
