import { Platform, StyleSheet } from "react-native";
import { colors } from "../../../styles/theme";
import { communityDetailAccent, communityDetailAccentDark } from "../data/community";

export const part22 = {
  projectsBackdropImage: {
    opacity: 0.44
  },
  projectsBackdropShade: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(5, 7, 17, 0.72)"
  },
  projectsCreateButton: {
    borderRadius: 12,
    flex: 1,
    minWidth: 0,
    overflow: "hidden",
    shadowColor: "#7130FF",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.32,
    shadowRadius: 18
  },
  projectsBrowsePcButton: {
    alignItems: "center",
    backgroundColor: "rgba(15, 17, 29, 0.85)",
    borderColor: "rgba(176, 132, 255, 0.32)",
    borderRadius: 12,
    borderWidth: 1,
    flex: 1,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    minHeight: 46,
    minWidth: 0,
    paddingHorizontal: 14,
    shadowColor: "#7130FF",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 14
  },
  projectsBrowsePcButtonPressed: {
    backgroundColor: "rgba(96, 42, 168, 0.36)",
    opacity: 0.9
  },
  projectsBrowsePcText: {
    color: "#E8E2FF",
    fontSize: 13,
    fontWeight: "900",
    lineHeight: 18
  },
  projectsCreateButtonPressed: {
    opacity: 0.86,
    transform: [{ scale: 0.98 }]
  },
  projectsCreateGradient: {
    alignItems: "center",
    flexDirection: "row",
    gap: 9,
    justifyContent: "center",
    minHeight: 46,
    paddingHorizontal: 16
  },
  projectsCreateText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "900",
    flexShrink: 0,
    lineHeight: 18
  },
  projectsFilterButton: {
    alignItems: "center",
    backgroundColor: "rgba(15, 17, 29, 0.8)",
    borderColor: "rgba(118, 101, 171, 0.3)",
    borderRadius: 11,
    borderWidth: 1,
    height: 44,
    justifyContent: "center",
    width: 44
  },
  projectsFilterButtonActive: {
    backgroundColor: "rgba(96, 42, 168, 0.58)",
    borderColor: "rgba(188, 104, 255, 0.64)"
  },
  projectsFilterLabel: {
    color: "#A9A5B8",
    fontSize: 12,
    fontWeight: "900",
    marginTop: -4,
    paddingHorizontal: 2,
    textTransform: "capitalize"
  },
  projectsFilterMenu: {
    backgroundColor: "#0C0B18",
    borderColor: "rgba(183, 121, 255, 0.24)",
    borderRadius: 14,
    borderWidth: 1,
    gap: 3,
    padding: 6,
    position: "absolute",
    right: 0,
    shadowColor: "#8D36FF",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.14,
    shadowRadius: 12,
    top: 50,
    width: 154,
    zIndex: 40
  },
  projectsFilterMenuItem: {
    alignItems: "center",
    borderRadius: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 37,
    paddingHorizontal: 10
  },
  projectsFilterMenuItemActive: {
    backgroundColor: "rgba(112, 51, 255, 0.18)"
  },
  projectsFilterMenuItemPressed: {
    backgroundColor: "rgba(112, 51, 255, 0.24)"
  },
  projectsFilterMenuText: {
    color: "#C9C1DC",
    fontSize: 13,
    fontWeight: "900"
  },
  projectsFilterMenuTextActive: {
    color: "#E8E1FF"
  },
  projectsFilterWrap: {
    position: "relative",
    zIndex: 40
  },
  projectsHero: {
    alignItems: "stretch",
    flexDirection: "row",
    gap: 10,
    paddingTop: 4
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
} as const;
