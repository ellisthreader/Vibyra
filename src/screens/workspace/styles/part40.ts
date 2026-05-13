import { Platform, StyleSheet } from "react-native";
import { colors } from "../../../styles/theme";
import { communityDetailAccent, communityDetailAccentDark } from "../data/community";

export const part40 = {
  welcomeStatusStack: {
    alignItems: "flex-end",
    flex: 1,
    gap: 7,
    minWidth: 0
  },
  welcomeMachinePill: {
    alignItems: "center",
    alignSelf: "stretch",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderColor: "rgba(255, 255, 255, 0.09)",
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    gap: 7,
    justifyContent: "center",
    minHeight: 30,
    paddingHorizontal: 10
  },
  welcomeMachineText: {
    color: "#DCD6F2",
    flexShrink: 1,
    fontSize: 11,
    fontWeight: "900",
    lineHeight: 14
  },
  welcomeMetricRow: {
    alignSelf: "stretch",
    flexDirection: "row",
    gap: 8
  },
  welcomeMetric: {
    backgroundColor: "rgba(6, 8, 18, 0.5)",
    borderColor: "rgba(132, 119, 169, 0.2)",
    borderRadius: 12,
    borderWidth: 1,
    flex: 1,
    minHeight: 46,
    paddingHorizontal: 8,
    paddingVertical: 7
  },
  welcomeMetricValue: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "900",
    lineHeight: 19
  },
  welcomeMetricLabel: {
    color: "#A9A4BB",
    fontSize: 10,
    fontWeight: "900",
    lineHeight: 13,
    marginTop: 2,
    textTransform: "uppercase"
  },
  welcomeModelText: {
    alignSelf: "stretch",
    color: "#BDB7D2",
    fontSize: 11,
    fontWeight: "900",
    lineHeight: 14,
    textAlign: "right"
  },
  mobileConnectionCard: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: "rgba(55, 214, 122, 0.1)",
    borderColor: "rgba(55, 214, 122, 0.18)",
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    maxWidth: "100%",
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  mobileConnectionCopy: {
    minWidth: 0
  },
} as const;
