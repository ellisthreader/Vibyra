import { StyleSheet } from "react-native";
import { colors } from "../../../styles/theme";

export const part2 = {
  chatComposer: {
    backgroundColor: "rgba(17, 19, 28, 0.96)",
    borderColor: "rgba(255, 255, 255, 0.13)",
    borderRadius: 16,
    borderWidth: 1,
    minHeight: 116,
    paddingBottom: 14,
    paddingHorizontal: 14,
    paddingTop: 14,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.2,
    shadowRadius: 18
  },
  chatComposerBottom: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 18
  },
  chatComposerInput: {
    color: "#F3F1FA",
    fontSize: 15,
    fontWeight: "700",
    lineHeight: 22,
    maxHeight: 70,
    minHeight: 28,
    padding: 0,
    textAlignVertical: "top"
  },
  chatComposerTool: {
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.055)",
    borderColor: "rgba(126, 124, 155, 0.22)",
    borderRadius: 11,
    borderWidth: 1,
    height: 38,
    justifyContent: "center",
    width: 38
  },
  chatComposerTools: {
    alignItems: "center",
    flexDirection: "row",
    flex: 1,
    gap: 8,
    minWidth: 0
  },
  chatComposerShell: {
    paddingTop: 10,
    position: "relative",
    zIndex: 10
  },
  lowCreditsButton: {
    alignItems: "center",
    backgroundColor: "rgba(255, 242, 0, 0.14)",
    borderColor: "rgba(255, 242, 0, 0.34)",
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 36,
    paddingHorizontal: 12
  },
  lowCreditsButtonText: {
    color: "#FFF200",
    fontSize: 12,
    fontWeight: "900"
  },
  lowCreditsCard: {
    alignItems: "center",
    backgroundColor: "rgba(13, 15, 25, 0.94)",
    borderColor: "rgba(255, 242, 0, 0.22)",
    borderRadius: 15,
    borderWidth: 1,
    flexDirection: "row",
    gap: 11,
    marginBottom: 10,
    padding: 12,
    shadowColor: "#FFF200",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.16,
    shadowRadius: 18
  },
  lowCreditsCopy: {
    flex: 1,
    minWidth: 0
  },
  lowCreditsIcon: {
    alignItems: "center",
    backgroundColor: "rgba(255, 242, 0, 0.1)",
    borderColor: "rgba(255, 242, 0, 0.26)",
    borderRadius: 11,
    borderWidth: 1,
    height: 39,
    justifyContent: "center",
    width: 39
  },
  lowCreditsText: {
    color: "#C9C3D5",
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 16,
    marginTop: 2
  },
  lowCreditsTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "900",
    lineHeight: 18
  },
  chatModelButton: {
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.055)",
    borderColor: "rgba(126, 124, 155, 0.22)",
    borderRadius: 11,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    height: 38,
    maxWidth: 206,
    minWidth: 0,
    paddingHorizontal: 12
  },
  chatModelButtonText: {
    color: "#DAD6E7",
    flexShrink: 1,
    fontSize: 14,
    fontWeight: "800"
  },
  chatModelButtonBadge: {
    backgroundColor: "rgba(124, 241, 179, 0.11)",
    borderColor: "rgba(124, 241, 179, 0.28)",
    borderRadius: 999,
    borderWidth: 1,
    color: "#7CF1B3",
    fontSize: 9,
    fontWeight: "900",
    overflow: "hidden",
    paddingHorizontal: 6,
    paddingVertical: 2,
    textTransform: "uppercase"
  },
  chatModelBadge: {
    backgroundColor: "rgba(124, 241, 179, 0.1)",
    borderColor: "rgba(124, 241, 179, 0.24)",
    borderRadius: 999,
    borderWidth: 1,
    color: "#7CF1B3",
    fontSize: 9,
    fontWeight: "900",
    overflow: "hidden",
    paddingHorizontal: 7,
    paddingVertical: 3,
    textTransform: "uppercase"
  },
  chatModelGroup: {
    gap: 2
  },
  chatModelGroupTitle: {
    color: "#8C879A",
    fontSize: 10,
    fontWeight: "900",
    paddingHorizontal: 7,
    paddingTop: 5,
    textTransform: "uppercase"
  },
  chatModelMenu: {
    backgroundColor: "#11131B",
    borderColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 15,
    borderWidth: 1,
    bottom: 148,
    gap: 4,
    left: 0,
    padding: 6,
    position: "absolute",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.34,
    shadowRadius: 24,
    width: 304,
    zIndex: 20
  },
  chatModelLockPill: {
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.055)",
    borderColor: "rgba(201, 194, 214, 0.18)",
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    gap: 4,
    minHeight: 22,
    paddingHorizontal: 7
  },
  chatModelLockText: {
    color: "#C9C2D6",
    fontSize: 10,
    fontWeight: "900"
  },
};
