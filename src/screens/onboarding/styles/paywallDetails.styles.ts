import { StyleSheet } from "react-native";
import { colors } from "../../../styles/theme";

export const styleSource = {
  paywallCtaDisabled: {
      opacity: 0.72
    },
  paywallCtaWrap: {
      borderRadius: 999,
      overflow: "hidden",
      shadowColor: "#5B7CFA",
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.24,
      shadowRadius: 14,
      width: "100%"
    },
  paywallDivider: {
      backgroundColor: "rgba(91, 124, 250, 0.24)",
      height: 1.5,
      marginBottom: 10,
      marginTop: 10,
      width: "100%"
    },
  paywallFeatureRow: {
      alignItems: "flex-start",
      flexDirection: "row",
      gap: 8
    },
  paywallFeatureStack: {
      gap: 7
    },
  paywallFeatureText: {
      color: colors.text,
      flex: 1,
      fontSize: 14,
      fontWeight: "900",
      lineHeight: 18
    },
  paywallErrorText: {
      color: colors.error,
      fontSize: 12,
      fontWeight: "800",
      lineHeight: 16,
      marginTop: 8,
      textAlign: "center"
    },
  paywallFooter: {
      bottom: 0,
      left: 0,
      paddingHorizontal: 22,
      paddingTop: 8,
      position: "absolute",
      right: 0
    },
  paywallFooterText: {
      color: colors.muted,
      fontSize: 12,
      fontWeight: "800",
      lineHeight: 16,
      marginTop: 6,
      textAlign: "center"
    },
  paywallSuccessText: {
      color: colors.success,
      fontSize: 12,
      fontWeight: "800",
      lineHeight: 16,
      marginTop: 8,
      textAlign: "center"
    },
  paywallHero: {
      marginTop: 0
    },
  paywallPlanName: {
      fontSize: 26,
      fontWeight: "900",
      lineHeight: 30
    },
  paywallPlanPrice: {
      color: colors.muted,
      fontSize: 18,
      fontWeight: "900",
      lineHeight: 22,
      marginTop: 3
    },
  paywallShell: {
      backgroundColor: colors.background,
      flex: 1,
      overflow: "hidden"
    },
  paywallTab: {
      alignItems: "center",
      borderRadius: 18,
      flex: 1,
      justifyContent: "center",
      minHeight: 58,
      paddingHorizontal: 4
    },
  paywallTabActive: {
      backgroundColor: "rgba(91, 124, 250, 0.26)",
      borderColor: "rgba(91, 124, 250, 0.62)",
      borderWidth: 1.4,
      shadowColor: "#5B7CFA",
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.42,
      shadowRadius: 16
    },
  paywallTabs: {
      alignSelf: "center",
      backgroundColor: "rgba(24, 26, 32, 0.76)",
      borderColor: "rgba(91, 124, 250, 0.26)",
      borderRadius: 22,
      borderWidth: 1.2,
      flexDirection: "row",
      gap: 6,
      marginTop: 18,
      padding: 6,
      shadowColor: "#5B7CFA",
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.18,
      shadowRadius: 18,
      width: "100%"
    },
  paywallTabText: {
      color: "rgba(166, 173, 186, 0.68)",
      fontSize: 15,
      fontWeight: "900",
      lineHeight: 20,
      textAlign: "center"
    },
  paywallTitle: {
      color: colors.text,
      fontSize: 31,
      fontWeight: "900",
      letterSpacing: -1.1,
      lineHeight: 35
    },
  paywallYearly: {
      color: colors.dim,
      fontSize: 12,
      fontWeight: "800",
      marginTop: 3
    }
} as const;
