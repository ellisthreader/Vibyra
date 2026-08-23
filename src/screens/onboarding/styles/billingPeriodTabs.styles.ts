import { StyleSheet } from "react-native";
import { colors } from "../../../styles/theme";

export const styleSource = {
  billingSave: {
      color: colors.muted,
      fontSize: 9,
      fontWeight: "900",
      lineHeight: 11,
      marginTop: 1,
      textAlign: "center"
    },
  billingTab: {
      alignItems: "center",
      borderRadius: 16,
      flex: 1,
      justifyContent: "center",
      minHeight: 46,
      paddingHorizontal: 6
    },
  billingTabActive: {
      backgroundColor: "rgba(91, 124, 250, 0.24)",
      borderColor: "rgba(91, 124, 250, 0.48)",
      borderWidth: 1.2
    },
  billingTabs: {
      alignSelf: "center",
      backgroundColor: "rgba(24, 26, 32, 0.72)",
      borderColor: "rgba(91, 124, 250, 0.2)",
      borderRadius: 20,
      borderWidth: 1,
      flexDirection: "row",
      gap: 6,
      marginTop: 8,
      padding: 5,
      width: "92%"
    },
  billingTabText: {
      color: "rgba(166, 173, 186, 0.66)",
      fontSize: 13,
      fontWeight: "900"
    },
  backdrop: {
      ...StyleSheet.absoluteFillObject,
      overflow: "hidden"
    },
  backdropLayer: {
      ...StyleSheet.absoluteFillObject
    },
  backdropBand: {
      borderRadius: 999,
      height: 190,
      position: "absolute"
    },
  backdropBandBottom: {
      bottom: 70,
      left: -100,
      right: -70,
      transform: [{ rotate: "-14deg" }]
    },
  backdropBandTop: {
      left: -80,
      right: -120,
      top: 64,
      transform: [{ rotate: "12deg" }]
    },
  backdropGrid: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: "rgba(24, 26, 32, 0.38)"
    },
  badge: {
      alignSelf: "flex-start",
      backgroundColor: colors.accentSoft,
      borderColor: colors.accent,
      borderRadius: 999,
      borderWidth: 1,
      marginBottom: 14,
      paddingHorizontal: 12,
      paddingVertical: 6
    },
  badgeText: { color: colors.text, fontSize: 12, fontWeight: "800" }
} as const;
