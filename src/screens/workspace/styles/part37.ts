import { StyleSheet } from "react-native";
import { colors } from "../../../styles/theme";

export const part37 = {
  runningProjectsPanel: {
    gap: 10
  },
  runningProjectsTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "900",
    letterSpacing: 0,
    lineHeight: 24,
    marginTop: 2
  },
  runningProjectsTitleBlock: {
    minWidth: 0
  },
  runningProjectTask: {
    color: "#C8BFE0",
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 15,
    marginTop: 2
  },
  runningProjectTime: {
    backgroundColor: "rgba(42, 9, 75, 0.86)",
    borderColor: "rgba(172, 58, 255, 0.42)",
    borderRadius: 999,
    borderWidth: 1,
    color: "#F0B8FF",
    fontSize: 9,
    fontWeight: "900",
    overflow: "hidden",
    paddingHorizontal: 8,
    paddingVertical: 4,
    textAlign: "right",
    textTransform: "lowercase"
  },
  runningProjectTimeWaiting: {
    backgroundColor: "rgba(7, 48, 30, 0.82)",
    borderColor: "rgba(117, 244, 166, 0.34)",
    color: "#83F2AD"
  },
  runningProjectTop: {
    alignItems: "center",
    flexDirection: "row",
    gap: 9
  },
  runningProjectSignal: {
    alignItems: "flex-end",
    alignSelf: "stretch",
    justifyContent: "flex-start",
    minWidth: 112
  },
  runningProjectSignalWaiting: {
    alignSelf: "auto",
    justifyContent: "center"
  },
  homeActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    justifyContent: "space-between"
  },
  homeAction: {
    backgroundColor: "rgba(12, 15, 28, 0.64)",
    borderColor: "rgba(119, 103, 157, 0.18)",
    borderRadius: 16,
    borderWidth: 1,
    height: 132,
    justifyContent: "space-between",
    padding: 15,
    width: "48.5%"
  },
  homeActionBadge: {
    color: "#9E98B5",
    fontSize: 11,
    fontWeight: "900",
    marginTop: 4
  },
  homeActionIcon: {
    alignItems: "center",
    backgroundColor: "rgba(82, 45, 154, 0.38)",
    borderColor: "rgba(164, 110, 255, 0.22)",
    borderRadius: 12,
    borderWidth: 1,
    height: 38,
    justifyContent: "center",
    width: 38
  },
  homeActionLabel: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "900",
    lineHeight: 18,
    marginTop: 10
  },
  homeActionMeta: {
    color: "#A9A7BB",
    fontSize: 11,
    fontWeight: "800",
    lineHeight: 14,
    marginTop: 4,
    minHeight: 28
  },
  homeActionPressed: {
    backgroundColor: "rgba(23, 20, 43, 0.78)",
    borderColor: "rgba(164, 110, 255, 0.32)",
    transform: [{ scale: 0.99 }]
  },
  homeActionTop: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  }
};
