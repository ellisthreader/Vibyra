import { StyleSheet } from "react-native";
import { colors } from "../../styles/theme";

export const featureStyles = StyleSheet.create({
  bracesIcon: {
    color: "#C77AFF",
    fontSize: 30,
    fontWeight: "700",
    letterSpacing: 0,
    lineHeight: 36
  },
  featureBody: {
    color: "rgba(223, 212, 255, 0.74)",
    fontSize: 15,
    fontWeight: "700",
    lineHeight: 21,
    textAlign: "center"
  },
  featureDivider: {
    backgroundColor: "rgba(144, 75, 255, 0.24)",
    height: 64,
    marginTop: 16,
    width: 1
  },
  featureIconTile: {
    alignItems: "center",
    borderColor: "rgba(199, 98, 255, 0.36)",
    borderRadius: 20,
    borderWidth: 1,
    height: 56,
    justifyContent: "center",
    marginBottom: 11,
    shadowColor: "#B141FF",
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
