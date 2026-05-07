import { StyleSheet } from "react-native";
import { colors } from "../../../styles/theme";

export const part13 = {
  paywallCtaDisabled: {
    opacity: 0.72
  },
  paywallCtaWrap: {
    borderRadius: 999,
    overflow: "hidden",
    shadowColor: "#5F24E5",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.24,
    shadowRadius: 14,
    width: "100%"
  },
  paywallDivider: {
    backgroundColor: "rgba(139, 92, 255, 0.24)",
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
    borderRadius: 999,
    flex: 1,
    minHeight: 38,
    justifyContent: "center"
  },
  paywallTabActive: {
    backgroundColor: "rgba(109, 59, 255, 0.18)",
    borderColor: "rgba(139, 92, 255, 0.42)",
    borderWidth: 1
  },
  paywallTabs: {
    alignSelf: "center",
    backgroundColor: "rgba(255, 255, 255, 0.10)",
    borderColor: "rgba(255, 255, 255, 0.16)",
    borderRadius: 999,
    borderWidth: 2,
    flexDirection: "row",
    gap: 4,
    marginTop: 16,
    padding: 4,
    width: "80%"
  },
  paywallTabText: {
    color: "rgba(255, 255, 255, 0.58)",
    fontSize: 13,
    fontWeight: "900"
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
  },
  personaHero: {
    alignItems: "center",
    height: 150,
    justifyContent: "center",
    marginBottom: 2,
    marginTop: 0,
    position: "relative",
    width: "100%"
  },
  personaHeroGlow: {
    backgroundColor: "rgba(181, 76, 255, 0.18)",
    borderRadius: 999,
    height: 146,
    position: "absolute",
    shadowColor: "#C95DFF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.7,
    shadowRadius: 36,
    width: 146
  },
};
