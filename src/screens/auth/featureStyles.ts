import { StyleSheet } from "react-native";
import { colors } from "../../styles/theme";

export const featureStyles = StyleSheet.create({
  bracesIcon: {
    color: "#7490FF",
    fontSize: 30,
    fontWeight: "700",
    letterSpacing: 0,
    lineHeight: 36
  },
  featureBody: {
    color: "rgba(166, 173, 186, 0.74)",
    fontSize: 15,
    fontWeight: "700",
    lineHeight: 21,
    textAlign: "center"
  },
  featureDivider: {
    backgroundColor: "rgba(91, 124, 250, 0.24)",
    height: 64,
    marginTop: 16,
    width: 1
  },
  featureIconTile: {
    alignItems: "center",
    borderColor: "rgba(91, 124, 250, 0.36)",
    borderRadius: 20,
    borderWidth: 1,
    height: 56,
    justifyContent: "center",
    marginBottom: 11,
    shadowColor: "#5B7CFA",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    width: 56
  },
  featureItem: { alignItems: "center", flex: 1 },
  featureStrip: {
    alignItems: "flex-start",
    alignSelf: "center",
    flexDirection: "row",
    justifyContent: "center",
    marginBottom: 27,
    width: "96%"
  },
  featureTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "900",
    lineHeight: 23,
    textAlign: "center"
  }
});
