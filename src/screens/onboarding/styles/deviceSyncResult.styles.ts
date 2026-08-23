import { StyleSheet } from "react-native";
import { colors } from "../../../styles/theme";

export const styleSource = {
  deviceChipPhone: {
      left: 24,
      top: 26
    },
  deviceChipText: {
      color: colors.text,
      fontSize: 11,
      fontWeight: "900"
    },
  deviceMomentPanel: {
      borderColor: "rgba(91, 124, 250, 0.14)",
      borderRadius: 34,
      borderWidth: 1,
      bottom: 88,
      left: 0,
      position: "absolute",
      right: 0,
      top: 64
    },
  deviceSyncBeam: {
      backgroundColor: "rgba(91, 124, 250, 0.38)",
      borderRadius: 999,
      height: 132,
      position: "absolute",
      width: 12
    },
  desktopList: {
      gap: 10,
      marginTop: 2
    },
  desktopResult: {
      alignItems: "center",
      backgroundColor: "rgba(91, 124, 250, 0.1)",
      borderColor: "rgba(91, 124, 250, 0.24)",
      borderRadius: 18,
      borderWidth: 1,
      flexDirection: "row",
      gap: 12,
      minHeight: 56,
      paddingHorizontal: 14
    },
  desktopResultMeta: {
      color: colors.muted,
      fontSize: 13,
      fontWeight: "700"
    },
  desktopResultMetaRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: 7,
      marginTop: 2
    },
  desktopResultStatusChecking: {
      backgroundColor: "#FFE76A"
    },
  desktopResultStatusCurrent: {
      backgroundColor: "#70F0A2"
    },
  desktopResultStatusDot: {
      borderRadius: 999,
      height: 7,
      width: 7
    },
  desktopResultStatusOffline: {
      backgroundColor: "#A6ADBA"
    },
  desktopResultStatusOnline: {
      backgroundColor: "#51E895"
    },
  desktopResultTitle: {
      color: colors.text,
      fontSize: 15,
      fontWeight: "900"
    },
  healthText: { color: colors.muted, fontSize: 12, fontWeight: "700", lineHeight: 17, marginTop: 8, textAlign: "center" }
} as const;
