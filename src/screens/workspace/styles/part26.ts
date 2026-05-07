import { StyleSheet } from "react-native";
import { colors } from "../../../styles/theme";

export const part26 = {
  projectsHero: {
    alignItems: "center",
    flexDirection: "row",
    gap: 18,
    justifyContent: "space-between",
    minHeight: 182,
    paddingTop: 8
  },
  projectsHeroCopy: {
    flex: 1,
    maxWidth: 320,
    minWidth: 0
  },
  projectsFoldersHero: {
    aspectRatio: 1448 / 1086,
    flexShrink: 0,
    height: 170,
    marginRight: -2,
    maxWidth: 228,
    minWidth: 148
  },
  projectsFoldersHeroComfort: {
    height: 158,
    maxWidth: 212,
    minWidth: 138
  },
  projectsFoldersHeroCompact: {
    height: 132,
    maxWidth: 176,
    minWidth: 112
  },
  projectsFoldersHeroNarrow: {
    height: 146,
    maxWidth: 195,
    minWidth: 124
  },
  projectsHeroSubtitle: {
    color: "#B5B0CA",
    fontSize: 14,
    fontWeight: "800",
    lineHeight: 19
  },
  projectsList: {
    gap: 12,
    width: "100%"
  },
  projectsEmptyState: {
    alignItems: "center",
    backgroundColor: "rgba(7, 10, 20, 0.64)",
    borderColor: "rgba(128, 106, 180, 0.22)",
    borderRadius: 14,
    borderWidth: 1,
    gap: 8,
    justifyContent: "center",
    minHeight: 104
  },
  projectsEmptyText: {
    color: "#A9A5B8",
    fontSize: 13,
    fontWeight: "900"
  },
  projectsScreen: {
    flex: 1,
    gap: 14,
    minHeight: "100%",
    paddingBottom: 18,
    paddingHorizontal: 10,
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
};
