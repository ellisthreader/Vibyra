import { StyleSheet } from "react-native";
import { colors } from "../../../styles/theme";

export const part15 = {
  communityMetricCard: {
    backgroundColor: "rgba(255, 255, 255, 0.055)",
    borderRadius: 6,
    flex: 1,
    padding: 6
  },
  communityMetricDelta: {
    color: "#51E895",
    fontSize: 8,
    fontWeight: "900",
    marginTop: 2
  },
  communityMetricRow: {
    flexDirection: "row",
    gap: 6,
    marginTop: 11
  },
  communityMetricValue: {
    color: colors.text,
    fontSize: 10,
    fontWeight: "900"
  },
  communityMakerBio: {
    color: "#BDB8C7",
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 20,
    marginTop: 2
  },
  communityMakerCopy: {
    flex: 1,
    justifyContent: "center",
    minWidth: 0
  },
  communityMakerName: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "900",
    lineHeight: 22
  },
  communityMakerMiniAvatar: {
    alignItems: "center",
    borderRadius: 999,
    height: 22,
    justifyContent: "center",
    width: 22
  },
  communityMakerMiniAvatarText: {
    fontSize: 11,
    fontWeight: "900"
  },
  communityMakerMiniDot: {
    color: "#6F6A80",
    fontSize: 11,
    fontWeight: "900"
  },
  communityMakerMiniName: {
    color: "#DAD6EA",
    fontSize: 12,
    fontWeight: "900",
    maxWidth: 118
  },
  communityMakerMiniRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 7
  },
  communityMakerMiniTime: {
    color: "#9D98AD",
    fontSize: 11,
    fontWeight: "800"
  },
  communityDetailMakerLine: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    minHeight: 44
  },
  communityMakerRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12
  },
  communityOpenedNotice: {
    alignItems: "flex-start",
    backgroundColor: "rgba(126, 72, 255, 0.1)",
    borderColor: "rgba(183, 139, 255, 0.24)",
    borderRadius: 13,
    borderWidth: 1,
    flexDirection: "row",
    gap: 9,
    padding: 12
  },
  communityOpenedText: {
    color: "#CFC8DE",
    flex: 1,
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 18
  },
  communityOpenButton: {
    borderRadius: 13,
    flex: 1,
    overflow: "hidden"
  },
  communityOpenGradient: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    height: 44,
    justifyContent: "center",
    paddingHorizontal: 14
  },
  communityOpenText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "900"
  },
  communityPrimaryOpenButton: {
    borderRadius: 10,
    flex: 1,
    height: 46,
    minWidth: 0,
    overflow: "hidden"
  },
  communityPrimaryOpenGradient: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    height: "100%",
    justifyContent: "center",
    paddingHorizontal: 14
  },
};
