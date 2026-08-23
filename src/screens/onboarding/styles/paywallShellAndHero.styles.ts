import { StyleSheet } from "react-native";
import { colors } from "../../../styles/theme";

export const styleSource = {
  paywallBackground: {
      ...StyleSheet.absoluteFillObject
    },
  paywallBackgroundImage: {
      ...StyleSheet.absoluteFillObject
    },
  paywallBackgroundShade: {
      ...StyleSheet.absoluteFillObject
    },
  paywallAuraOne: {
      backgroundColor: "rgba(91, 124, 250, 0.08)",
      borderRadius: 999,
      height: 220,
      position: "absolute",
      right: -160,
      top: -20,
      width: 220
    },
  paywallAuraTwo: {
      backgroundColor: "rgba(91, 124, 250, 0.08)",
      borderRadius: 999,
      bottom: 80,
      height: 220,
      left: -160,
      position: "absolute",
      width: 220
    },
  paywallNoise: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: "rgba(255, 255, 255, 0.012)"
    },
  paywallBadge: {
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 5
    },
  paywallBadgeText: {
      color: "#FFFFFF",
      fontSize: 12,
      fontWeight: "900"
    },
  paywallCard: {
      backgroundColor: "rgba(24, 26, 32, 0.82)",
      borderColor: "rgba(91, 124, 250, 0.34)",
      borderRadius: 24,
      borderWidth: 1.2,
      marginTop: 12,
      padding: 16,
      shadowColor: colors.accent,
      shadowOffset: { width: 0, height: 14 },
      shadowOpacity: 0.2,
      shadowRadius: 26,
      width: "100%"
    },
  paywallCardHeader: {
      alignItems: "flex-start",
      flexDirection: "row",
      justifyContent: "space-between",
      gap: 12
    },
  paywallClose: {
      alignItems: "center",
      alignSelf: "flex-end",
      backgroundColor: "rgba(255, 255, 255, 0.12)",
      borderColor: "rgba(255, 255, 255, 0.16)",
      borderWidth: 1,
      borderRadius: 14,
      height: 40,
      justifyContent: "center",
      width: 40
    },
  paywallContent: {
      flexGrow: 1,
      justifyContent: "space-between",
      minHeight: "100%",
      paddingHorizontal: 20,
      paddingTop: 34
    },
  paywallCta: {
      alignItems: "center",
      borderRadius: 999,
      minHeight: 52,
      justifyContent: "center"
    },
  paywallCtaText: {
      color: "#FFFFFF",
      fontSize: 17,
      fontWeight: "900"
    }
} as const;
