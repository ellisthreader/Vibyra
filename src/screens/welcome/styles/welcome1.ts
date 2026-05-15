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
    color: "#C8A8FF",
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
    color: "#C66BFF"
  },
  body1: {
    color: "rgba(226, 219, 255, 0.78)",
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
    shadowColor: "#A741FF",
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
  }
};
