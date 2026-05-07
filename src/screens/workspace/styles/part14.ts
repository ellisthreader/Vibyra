import { StyleSheet } from "react-native";
import { colors } from "../../../styles/theme";

export const part14 = {
  communityHabitRing: {
    alignItems: "center",
    borderRadius: 999,
    borderWidth: 6,
    height: 55,
    justifyContent: "center",
    width: 55
  },
  communityHabitScore: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "900"
  },
  communityHabitText: {
    fontSize: 9,
    fontWeight: "900",
    marginTop: 6
  },
  communityHabitLogoCore: {
    borderRadius: 999,
    height: 10,
    width: 10
  },
  communityHabitLogoDot: {
    backgroundColor: "rgba(255, 255, 255, 0.38)",
    borderRadius: 999,
    height: 4,
    width: 4
  },
  communityHabitLogoDots: {
    bottom: 8,
    flexDirection: "row",
    gap: 4,
    position: "absolute"
  },
  communityHabitLogoRing: {
    alignItems: "center",
    borderRadius: 999,
    borderWidth: 5,
    justifyContent: "center",
    opacity: 0.9
  },
  communityHabitDemoCopy: {
    flex: 1,
    minWidth: 0
  },
  communityHabitDemoDot: {
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 999,
    height: 13,
    width: 13
  },
  communityHabitDemoDotDone: {
    backgroundColor: communityDetailAccent
  },
  communityHabitDemoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  communityHabitDemoRing: {
    alignItems: "center",
    borderColor: "rgba(139, 53, 255, 0.7)",
    borderRadius: 999,
    borderWidth: 7,
    height: 74,
    justifyContent: "center",
    width: 74
  },
  communityHabitDemoRingDone: {
    borderColor: "#7CF1B3"
  },
  communityHabitDemoScore: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "900"
  },
  communityHabitDemoTop: {
    alignItems: "center",
    flexDirection: "row",
    gap: 13
  },
  communityHero: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
    minHeight: 138,
    paddingTop: 4
  },
  communityHeroCopy: {
    flex: 1,
    maxWidth: 320,
    minWidth: 0
  },
  communityHeroImage: {
    aspectRatio: 1536 / 1024,
    flexShrink: 1,
    height: 126,
    maxWidth: 188,
    minWidth: 112
  },
  communityHeroSubtitle: {
    color: "#B5B0CA",
    fontSize: 14,
    fontWeight: "800",
    lineHeight: 19
  },
  communityLineChart: {
    flex: 1,
    marginTop: 14,
    overflow: "hidden",
    position: "relative"
  },
  communityLinePoint: {
    backgroundColor: "#5D32FF",
    borderRadius: 999,
    height: 5,
    position: "absolute",
    width: 5
  },
  communityLikeButton: {
    alignItems: "center",
    backgroundColor: "rgba(12, 15, 24, 0.5)",
    borderColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    height: 46,
    justifyContent: "center",
    minWidth: 74,
    paddingHorizontal: 13
  },
};
