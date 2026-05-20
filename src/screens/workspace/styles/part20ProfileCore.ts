import { colors } from "../../../styles/theme";

export const part20ProfileCore = {
  profileAvatarLargeText: {
    color: colors.text,
    fontSize: 29,
    fontWeight: "900"
  },
  profileAvatarEditButton: {
    alignItems: "center",
    backgroundColor: "#242737",
    borderColor: "rgba(174, 168, 196, 0.36)",
    borderRadius: 999,
    borderWidth: 1,
    bottom: -6,
    height: 34,
    justifyContent: "center",
    position: "absolute",
    right: -6,
    width: 34
  },
  profileAvatarWrap: {
    position: "relative"
  },
  profileConnectionDot: {
    backgroundColor: "#55D77D",
    borderRadius: 999,
    height: 9,
    width: 9
  },
  profileConnectionRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    marginTop: 11
  },
  profileConnectionText: {
    color: "#6FEA8E",
    fontSize: 15,
    fontWeight: "900"
  },
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
    borderRadius: 10,
    borderWidth: 1,
    overflow: "hidden",
    paddingHorizontal: 11
  },
  profileGroupDangerTitle: {
    color: "#FF5D5D"
  },
  profileGroupTitle: {
    color: "#A8A2B6",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0,
    marginBottom: 4
  },
  profileHeader: {
    paddingHorizontal: 12,
    paddingTop: 24
  },
  profileContent: {
    paddingBottom: 0,
    paddingHorizontal: 16,
    paddingTop: 0
  },
  profileDivider: {
    backgroundColor: "rgba(125, 120, 142, 0.26)",
    height: 1,
    marginTop: 12
  },
  profileHeroCard: {
    gap: 8,
    paddingBottom: 4,
    paddingTop: 10
  },
  profileHeroTop: {
    alignItems: "center",
    flexDirection: "row",
    gap: 24,
    paddingHorizontal: 6
  },
  profileLevelCopy: {
    flex: 1,
    minWidth: 0
  },
  profileLevelExpandRail: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 22,
    width: 24
  },
  profileLevelExpanded: {
    gap: 12,
    paddingTop: 2
  },
  profileLevelFill: {
    backgroundColor: "#8B5CFF",
    borderRadius: 999,
    height: "100%",
    minWidth: 6
  },
  profileLevelHelpButton: {
    alignItems: "center",
    backgroundColor: "transparent",
    borderColor: "transparent",
    borderRadius: 999,
    borderWidth: 0,
    height: 36,
    justifyContent: "center",
    width: 36
  },
  profileLevelHelpBody: {
    gap: 7,
    paddingTop: 10
  },
  profileLevelHelpBullet: {
    backgroundColor: "#C259FF",
    borderRadius: 999,
    height: 5,
    marginTop: 6,
    width: 5
  }
} as const;
