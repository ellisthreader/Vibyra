import { StyleSheet } from "react-native";
import { colors } from "../../../styles/theme";

export const part25 = {
  profileUsageIcon: {
    alignItems: "center",
    backgroundColor: "rgba(30, 31, 48, 0.86)",
    borderRadius: 12,
    height: 43,
    justifyContent: "center",
    width: 43
  },
  profileUsageItem: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    gap: 10,
    minWidth: 0
  },
  profileUsageLabel: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 17
  },
  profileUsageStrip: {
    alignItems: "center",
    flexDirection: "row",
    gap: 13,
    minHeight: 58,
    paddingHorizontal: 0
  },
  profileUsageValue: {
    color: colors.text,
    fontSize: 21,
    fontWeight: "900",
    lineHeight: 25
  },
  projectsBackdrop: {
    ...StyleSheet.absoluteFillObject
  },
  projectsBackdropImage: {
    opacity: 0.44
  },
  projectsBackdropShade: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(5, 7, 17, 0.72)"
  },
  projectsCreateButton: {
    alignSelf: "stretch",
    borderRadius: 12,
    marginTop: 14,
    maxWidth: 220,
    minWidth: 178,
    overflow: "hidden",
    shadowColor: "#7130FF",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.32,
    shadowRadius: 18
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
};
