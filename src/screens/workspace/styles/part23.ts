import { StyleSheet } from "react-native";
import { colors } from "../../../styles/theme";

export const part23 = {
  profileEditButton: {
    alignItems: "center",
    backgroundColor: "rgba(35, 35, 49, 0.86)",
    borderColor: "rgba(113, 108, 132, 0.32)",
    borderRadius: 13,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    minHeight: 39,
    paddingHorizontal: 16
  },
  profileEditText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "900"
  },
  profileGroup: {
    backgroundColor: "rgba(10, 13, 24, 0.74)",
    borderColor: "rgba(125, 120, 142, 0.24)",
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
    paddingHorizontal: 13
  },
  profileGroupDangerTitle: {
    color: "#FF5D5D"
  },
  profileGroupTitle: {
    color: "#A8A2B6",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0,
    marginBottom: 8
  },
  profileHeader: {
    paddingHorizontal: 12,
    paddingTop: 24
  },
  profileContent: {
    paddingBottom: Platform.OS === "ios" ? 104 : 98,
    paddingHorizontal: 28,
    paddingTop: 16
  },
  profileDivider: {
    backgroundColor: "rgba(125, 120, 142, 0.26)",
    height: 1,
    marginTop: 12
  },
  profileHeroCard: {
    gap: 0
  },
  profileHeroTop: {
    alignItems: "center",
    flexDirection: "row",
    gap: 34,
    paddingHorizontal: 8
  },
  profilePlanBadge: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: "rgba(126, 30, 188, 0.18)",
    borderColor: "rgba(194, 89, 255, 0.45)",
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    marginTop: 10,
    minHeight: 28,
    paddingHorizontal: 11
  },
  profilePlanBadgeText: {
    color: "#C259FF",
    fontSize: 14,
    fontWeight: "900"
  },
  profileRow: {
    alignItems: "center",
    borderBottomColor: "rgba(125, 120, 142, 0.18)",
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 12,
    minHeight: 38
  },
  profileRowActive: {
    backgroundColor: "rgba(126, 72, 255, 0.035)"
  },
  profileRowBadge: {
    backgroundColor: "rgba(45, 177, 106, 0.2)",
    borderRadius: 999,
    color: "#6FEA8E",
    fontSize: 13,
    fontWeight: "900",
    overflow: "hidden",
    paddingHorizontal: 12,
    paddingVertical: 6
  },
  profileRowCopy: {
    flex: 1,
    minWidth: 0
  },
  profileRowIcon: {
    alignItems: "center",
    backgroundColor: "rgba(79, 32, 129, 0.28)",
    borderRadius: 9,
    height: 28,
    justifyContent: "center",
    width: 28
  },
  profileRowIconDanger: {
    backgroundColor: "rgba(255, 70, 92, 0.11)"
  },
  profileRowLabel: {
    color: colors.text,
    flex: 1,
    fontSize: 14,
    fontWeight: "900",
    lineHeight: 18
  },
  profileRowLabelDanger: {
    color: "#FF465C"
  },
  profileRowLast: {
    borderBottomWidth: 0
  },
  profileRowPressed: {
    opacity: 0.74
  },
};
