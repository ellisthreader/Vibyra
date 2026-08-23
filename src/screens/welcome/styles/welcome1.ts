import { StyleSheet } from "react-native";
import { colors } from "../../../styles/theme";

export const welcome1 = {
  shell: {
    flex: 1,
    overflow: "hidden" as const
  },
  backdropImage: {
    ...StyleSheet.absoluteFillObject
  },
  backdropShade: {
    ...StyleSheet.absoluteFillObject
  },
  body: {
    flex: 1,
    paddingHorizontal: 22
  },
  header: {
    alignItems: "center" as const,
    gap: 10
  },
  eyebrow: {
    color: "#A6ADBA",
    fontSize: 12,
    fontWeight: "900" as const,
    letterSpacing: 2.4,
    textTransform: "uppercase" as const
  },
  title: {
    color: colors.text,
    fontSize: 34,
    fontWeight: "900" as const,
    lineHeight: 42,
    textAlign: "center" as const
  },
  titleAccent: {
    color: "#7490FF"
  },
  welcomeLine: {
    color: colors.text,
    fontSize: 40,
    fontWeight: "800" as const,
    letterSpacing: 0,
    lineHeight: 46,
    textAlign: "center" as const
  },
  tagline: {
    color: "#A6ADBA",
    fontSize: 22,
    fontWeight: "600" as const,
    letterSpacing: -0.2,
    lineHeight: 28,
    textAlign: "center" as const
  },
  body1: {
    color: "rgba(166, 173, 186, 0.78)",
    fontSize: 15,
    fontWeight: "700" as const,
    lineHeight: 22,
    maxWidth: 320,
    textAlign: "center" as const
  },
  centerStack: {
    alignItems: "center" as const,
    flex: 1,
    gap: 18,
    justifyContent: "center" as const
  },
  bottomStack: {
    alignItems: "center" as const,
    gap: 12,
    paddingBottom: 12
  },
  logoFloat: {
    alignItems: "center" as const,
    shadowColor: "#5B7CFA",
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.4,
    shadowRadius: 32
  },
  errorText: {
    color: colors.error,
    fontSize: 13,
    fontWeight: "700" as const,
    marginTop: 4,
    textAlign: "center" as const
  },
  downloadLottieWrap: {
    alignItems: "center" as const,
    height: 200,
    justifyContent: "center" as const,
    marginVertical: 8,
    width: "100%" as const
  },
  downloadLottie: {
    height: 200,
    width: 200
  },
  downloadUrl: {
    color: "#A6ADBA",
    fontSize: 26,
    fontWeight: "700" as const,
    letterSpacing: -0.3,
    textAlign: "center" as const,
    textDecorationLine: "underline" as const,
    textDecorationColor: "rgba(91, 124, 250, 0.4)" as const
  },
  downloadHelper: {
    color: "rgba(166, 173, 186, 0.6)",
    fontSize: 13,
    fontWeight: "500" as const,
    letterSpacing: 0.2,
    marginTop: 6,
    textAlign: "center" as const
  },
  typewriterRow: {
    alignItems: "center" as const,
    flexDirection: "row" as const,
    justifyContent: "center" as const,
    minHeight: 46
  }
};
