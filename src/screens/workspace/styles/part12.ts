import { Platform, StyleSheet } from "react-native";
import { colors } from "../../../styles/theme";
import { communityDetailAccent, communityDetailAccentDark } from "../data/community";

export const part12 = {
  communityDetailSectionTabs: {
    flexDirection: "row",
    gap: 7
  },
  communityDetailSectionText: {
    color: "#B8B2CB",
    flexShrink: 1,
    fontSize: 11,
    fontWeight: "900"
  },
  communityDetailSectionTextActive: {
    color: colors.text
  },
  communityDetailTag: {
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    borderColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 999,
    borderWidth: 1,
    color: "#DCD8EA",
    fontSize: 11,
    fontWeight: "900",
    overflow: "hidden",
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  communityDetailTagRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7
  },
  communityDetailTitle: {
    color: colors.text,
    fontSize: 29,
    fontWeight: "900",
    letterSpacing: 0,
    lineHeight: 34
  },
  communityDetailTitleBlock: {
    flex: 1,
    minWidth: 0
  },
  communityDemoAction: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: communityDetailAccent,
    borderRadius: 11,
    flexDirection: "row",
    gap: 8,
    minHeight: 40,
    paddingHorizontal: 13
  },
  communityDemoActionText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "900"
  },
  communityDemoLabel: {
    color: "#AFA9BB",
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase"
  },
  communityDemoLineAmount: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "900"
  },
  communityDemoLineItem: {
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.045)",
    borderRadius: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 39,
    paddingHorizontal: 11
  },
  communityDemoLineText: {
    color: "#DAD6EA",
    fontSize: 13,
    fontWeight: "800"
  },
  communityDemoPanel: {
    backgroundColor: "rgba(4, 6, 15, 0.62)",
    borderColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 13,
    borderWidth: 1,
    gap: 11,
    padding: 12
  },
  communityDemoStatus: {
    backgroundColor: "rgba(255, 205, 92, 0.12)",
    borderColor: "rgba(255, 205, 92, 0.25)",
    borderRadius: 999,
    borderWidth: 1,
    color: "#FFD27E",
    fontSize: 12,
    fontWeight: "900",
    overflow: "hidden",
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  communityDemoStatusDone: {
    backgroundColor: "rgba(124, 241, 179, 0.12)",
    borderColor: "rgba(124, 241, 179, 0.25)",
    color: "#BDF8D8"
  },
  communityDemoTopRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  communityDemoValue: {
    color: colors.text,
    fontSize: 25,
    fontWeight: "900",
    lineHeight: 30,
    marginTop: 3
  },
  communityEmptyState: {
    alignItems: "center",
    backgroundColor: "rgba(8, 13, 24, 0.72)",
    borderColor: "rgba(128, 106, 180, 0.22)",
    borderRadius: 16,
    borderWidth: 1,
    gap: 7,
    minHeight: 150,
    justifyContent: "center",
    padding: 18
  },
  communityEmptyText: {
    color: "#AFAABD",
    fontSize: 13,
    fontWeight: "800"
  },
  communityEmptyTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "900"
  },
  communityBackdrop: {
    ...StyleSheet.absoluteFillObject
  },
  communityBackdropImage: {
    borderRadius: 24,
    opacity: 0.44
  },
  communityBackdropShade: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(5, 7, 17, 0.74)",
    borderRadius: 24
  },
  communityHabitCard: {
    alignItems: "center",
    backgroundColor: "rgba(14, 36, 31, 0.74)",
    borderRadius: 8,
    height: 96,
    justifyContent: "center",
    margin: 8,
    width: 78
  },
  communityHabitRing: {
    alignItems: "center",
    borderRadius: 999,
    borderWidth: 6,
    height: 55,
    justifyContent: "center",
    width: 55
  },
} as const;
