import { Platform, StyleSheet } from "react-native";
import { colors } from "../../../styles/theme";
import { communityDetailAccent, communityDetailAccentDark } from "../data/community";

export const styleSource = {
  avatar: {
      alignItems: "center",
      backgroundColor: "rgba(167, 243, 208, 0.12)",
      borderRadius: 8,
      height: 42,
      justifyContent: "center",
      width: 42
    },
  avatarText: {
      color: "#DDFCEB",
      fontSize: 17,
      fontWeight: "900"
    },
  bodyText: {
      color: "#B6B3C6",
      fontSize: 14,
      fontWeight: "800",
      lineHeight: 19,
      marginTop: 5,
      textAlign: "center"
    },
  card: {
      backgroundColor: "#181A20",
      borderColor: "rgba(255, 255, 255, 0.08)",
      borderRadius: 8,
      borderWidth: 1,
      flexGrow: 1,
      flexShrink: 1,
      flexBasis: 280,
      gap: 12,
      padding: 16
    },
  cardAction: {
      color: "#A7F3D0",
      fontSize: 13,
      fontWeight: "900"
    },
  cardHeader: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between"
    },
  chatInput: {
      color: colors.text,
      flex: 1,
      fontSize: 15,
      maxHeight: 120,
      minHeight: 42,
      paddingHorizontal: 10,
      paddingVertical: 10,
      textAlignVertical: "top"
    },
  chatArtBubble: {
      alignItems: "center",
      borderColor: "rgba(91, 124, 250, 0.9)",
      borderRadius: 999,
      borderWidth: 2,
      height: 82,
      justifyContent: "center",
      left: 42,
      position: "absolute",
      shadowColor: "#5B7CFA",
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.95,
      shadowRadius: 17,
      top: 48,
      width: 82,
      zIndex: 4
    },
  chatArtBubbleEye: {
      backgroundColor: "#F5E9FF",
      borderRadius: 999,
      height: 15,
      shadowColor: "#FFFFFF",
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.9,
      shadowRadius: 8,
      width: 15
    },
  chatArtBubbleFace: {
      flexDirection: "row",
      gap: 16
    },
  chatArtBubbleTail: {
      backgroundColor: "#315BD8",
      borderBottomColor: "rgba(91, 124, 250, 0.9)",
      borderBottomWidth: 2,
      borderLeftColor: "rgba(91, 124, 250, 0.9)",
      borderLeftWidth: 2,
      borderRadius: 8,
      bottom: 36,
      height: 22,
      left: 45,
      position: "absolute",
      transform: [{ rotate: "-22deg" }],
      width: 27,
      zIndex: 3
    },
  chatArtGlowFloor: {
      backgroundColor: "rgba(129, 42, 255, 0.32)",
      borderRadius: 999,
      bottom: 10,
      height: 20,
      left: 11,
      position: "absolute",
      shadowColor: "#4667E8",
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.95,
      shadowRadius: 25,
      transform: [{ scaleX: 3 }],
      width: 78
    },
  chatArtLineLong: {
      backgroundColor: "rgba(150, 67, 255, 0.72)",
      borderRadius: 999,
      height: 5,
      marginTop: 11,
      width: 54
    },
  chatArtLineMid: {
      backgroundColor: "rgba(99, 43, 200, 0.72)",
      borderRadius: 999,
      height: 4,
      marginTop: 8,
      width: 45
    },
  chatArtLineShort: {
      backgroundColor: "rgba(67, 31, 145, 0.78)",
      borderRadius: 999,
      height: 4,
      marginTop: 8,
      width: 34
    }
} as const;
