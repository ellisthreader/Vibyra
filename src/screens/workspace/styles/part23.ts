import { Platform, StyleSheet } from "react-native";
import { colors } from "../../../styles/theme";
import { communityDetailAccent, communityDetailAccentDark } from "../data/community";

export const part23 = {
  projectsScreen: {
    flex: 1,
    gap: 14,
    minHeight: "100%",
    paddingBottom: 18,
    paddingHorizontal: 0,
    position: "relative"
  },
  projectsSearchBar: {
    alignItems: "center",
    backgroundColor: "rgba(10, 13, 24, 0.8)",
    borderColor: "rgba(118, 101, 171, 0.28)",
    borderRadius: 11,
    borderWidth: 1,
    flex: 1,
    flexDirection: "row",
    gap: 10,
    minHeight: 44,
    paddingHorizontal: 14
  },
  projectsSearchInput: {
    color: colors.text,
    flex: 1,
    fontSize: 15,
    fontWeight: "800",
    minHeight: 42
  },
  projectsSearchRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    zIndex: 30
  },
  projectsSearchRowMenuOpen: {
    zIndex: 50
  },
  projectCard: {
    alignSelf: "stretch",
    backgroundColor: "rgba(7, 10, 20, 0.86)",
    borderColor: "rgba(128, 106, 180, 0.26)",
    borderRadius: 16,
    borderWidth: 1,
    overflow: "visible",
    padding: 16,
    position: "relative",
    width: "100%"
  },
  projectCardActive: {
    borderColor: "rgba(79, 221, 154, 0.54)"
  },
  projectCardMenuOpen: {
    zIndex: 20
  },
  projectCardStatusActive: {
    borderColor: "rgba(89, 232, 160, 0.42)"
  },
  projectCardStatusArchived: {
    borderColor: "rgba(170, 166, 188, 0.28)"
  },
  projectCardStatusCompleted: {
    borderColor: "rgba(190, 98, 255, 0.42)"
  },
  projectCardStatusDraft: {
    borderColor: "rgba(146, 134, 174, 0.32)"
  },
  projectCardCopy: {
    flex: 1,
    minWidth: 0
  },
  projectCardFooter: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10
  },
  projectCardFooterComfort: {
    flexWrap: "wrap"
  },
  projectCardFooterStacked: {
    alignItems: "stretch",
    flexDirection: "column",
    gap: 10
  },
  projectCardMain: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 12
  },
  projectCardRight: {
    alignItems: "flex-end",
    flexDirection: "row",
    gap: 12,
    paddingTop: 1,
    position: "relative",
    zIndex: 10
  },
  projectCardTop: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  projectDivider: {
    backgroundColor: "rgba(132, 128, 151, 0.16)",
    height: 1,
    marginBottom: 10,
    marginTop: 12,
    width: "100%"
  },
  projectFooterActions: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    marginLeft: "auto"
  },
  projectFooterActionsComfort: {
    alignItems: "center",
    flexDirection: "row",
    gap: 7,
    marginLeft: "auto"
  },
  projectFooterActionsStacked: {
    alignItems: "center",
    alignSelf: "stretch",
    flexDirection: "row",
    gap: 7,
    justifyContent: "flex-end"
  },
  projectFooterDetails: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    gap: 10,
    minWidth: 0
  },
  projectFooterDetailsStacked: {
    alignItems: "center",
    alignSelf: "stretch",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 9
  },
  projectFooterMeta: {
    alignItems: "center",
    flexShrink: 1,
    flexDirection: "row",
    gap: 5,
    minWidth: 0
  },
  projectFooterText: {
    color: "#AAA6BC",
    fontSize: 12,
    fontWeight: "800"
  },
  projectDeleteActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 22,
    width: "100%"
  },
  projectDeleteBody: {
    color: "#B8B1C9",
    fontSize: 14,
    fontWeight: "800",
    lineHeight: 20,
    marginTop: 8,
    textAlign: "center"
  },
} as const;
