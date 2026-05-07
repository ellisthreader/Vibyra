import { Platform, StyleSheet } from "react-native";
import { colors } from "../../../styles/theme";
import { communityDetailAccent, communityDetailAccentDark } from "../data/community";

export const part6 = {
  chatRecentHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8
  },
  chatRecentIcon: {
    alignItems: "center",
    backgroundColor: "rgba(45, 42, 67, 0.68)",
    borderRadius: 11,
    height: 44,
    justifyContent: "center",
    width: 44
  },
  chatRecentIconRunning: {
    backgroundColor: "rgba(33, 97, 66, 0.34)",
    borderColor: "rgba(57, 218, 119, 0.62)",
    borderWidth: 2
  },
  chatRecentList: {
    gap: 8
  },
  chatRecentMeta: {
    color: "#A5A0B7",
    flexShrink: 1,
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 15
  },
  chatRecentMetaRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 5,
    marginTop: 4
  },
  chatRecentMetaRunning: {
    color: "#55D98C",
    fontWeight: "900"
  },
  chatRecentPanel: {
    backgroundColor: "rgba(9, 10, 24, 0.78)",
    borderColor: "rgba(70, 52, 116, 0.72)",
    borderRadius: 18,
    borderWidth: 1,
    gap: 0,
    padding: 12,
    shadowColor: "#3D1F7B",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.18,
    shadowRadius: 18
  },
  chatRecentRow: {
    alignItems: "center",
    backgroundColor: "rgba(10, 12, 27, 0.86)",
    borderColor: "rgba(40, 39, 60, 0.72)",
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    minHeight: 66,
    paddingHorizontal: 11,
    position: "relative"
  },
  chatRecentRowActive: {
    backgroundColor: "rgba(10, 22, 28, 0.92)",
    borderColor: "rgba(50, 212, 128, 0.36)",
    shadowColor: "#2EDB78",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.22,
    shadowRadius: 16
  },
  chatRecentRowTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "900",
    lineHeight: 20
  },
  chatRecentTime: {
    color: "#A7A1B9",
    fontSize: 12,
    fontWeight: "800",
    marginLeft: 4
  },
  chatRecentTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "900",
    lineHeight: 22
  },
  chatResumeArrow: {
    alignItems: "center",
    backgroundColor: "rgba(44, 29, 75, 0.62)",
    borderColor: "rgba(121, 74, 196, 0.58)",
    borderRadius: 11,
    borderWidth: 1,
    height: 44,
    justifyContent: "center",
    width: 44
  },
  chatResumeCard: {
    alignItems: "center",
    backgroundColor: "rgba(8, 11, 23, 0.88)",
    borderColor: "rgba(80, 59, 128, 0.72)",
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    minHeight: 90,
    overflow: "hidden",
    paddingBottom: 16,
    paddingHorizontal: 14,
    paddingTop: 14
  },
  chatResumeCopy: {
    flex: 1,
    minWidth: 0
  },
  chatResumeIcon: {
    alignItems: "center",
    backgroundColor: "rgba(19, 96, 67, 0.32)",
    borderRadius: 16,
    height: 52,
    justifyContent: "center",
    shadowColor: "#2EDB78",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.32,
    shadowRadius: 12,
    width: 52
  },
  chatResumeLabel: {
    color: "#AAA5BB",
    fontSize: 13,
    fontWeight: "900",
    lineHeight: 17
  },
  chatResumeMeta: {
    color: "#AAA5BB",
    fontSize: 13,
    fontWeight: "800"
  },
  chatResumeProgressFill: {
    borderRadius: 999,
    height: 4,
    width: "30%"
  },
  chatResumeProgressTrack: {
    backgroundColor: "rgba(34, 33, 53, 0.88)",
    borderRadius: 999,
    bottom: 9,
    height: 4,
    left: 14,
    overflow: "hidden",
    position: "absolute",
    right: 14
  },
  chatResumeTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "900",
    lineHeight: 22,
    marginTop: 4
  },
} as const;
