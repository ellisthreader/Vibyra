import { StyleSheet } from "react-native";
import { colors } from "../../../styles/theme";

export const part4 = {
  connectLogo: {
    height: 116,
    width: 160
  },
  connectLogoWrap: {
    marginBottom: 4,
    shadowColor: "#A741FF",
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.35,
    shadowRadius: 30
  },
  connectModeTab: {
    alignItems: "center",
    backgroundColor: "transparent",
    borderRadius: 999,
    flex: 1,
    flexDirection: "row",
    gap: 6,
    justifyContent: "center",
    minHeight: 36
  },
  connectModeTabActive: {
    backgroundColor: "rgba(148, 65, 255, 0.24)"
  },
  connectModeTabs: {
    backgroundColor: "rgba(11, 8, 32, 0.74)",
    borderColor: "rgba(154, 77, 255, 0.22)",
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    padding: 4
  },
  connectModeText: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "900"
  },
  connectModeTextActive: {
    color: colors.text
  },
  connectOrText: {
    color: colors.dim,
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 17,
    marginTop: 2,
    textAlign: "center",
    textTransform: "none"
  },
  connectPrimaryAction: {
    alignItems: "center",
    borderColor: "rgba(255, 255, 255, 0.22)",
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    justifyContent: "center",
    marginTop: 16,
    minHeight: 58,
    overflow: "hidden",
    shadowColor: "#A741FF",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.42,
    shadowRadius: 18
  },
  connectPrimaryActionGradient: {
    alignItems: "center",
    alignSelf: "stretch",
    flexDirection: "row",
    gap: 11,
    justifyContent: "center",
    minHeight: 58,
    paddingHorizontal: 14,
    paddingVertical: 10,
    width: "100%"
  },
  connectPrimaryActionText: {
    color: colors.text,
    flexShrink: 1,
    fontSize: 15,
    fontWeight: "900",
    lineHeight: 20,
    textAlign: "center"
  },
  connectBackdropImage: {
    ...StyleSheet.absoluteFill
  },
  connectScreen: {
    flex: 1,
    overflow: "hidden"
  },
  connectScrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 22
  },
  connectSecondaryAction: {
    alignItems: "center",
    backgroundColor: "rgba(15, 10, 42, 0.82)",
    borderColor: "rgba(154, 77, 255, 0.26)",
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: 14
  },
  connectSecondaryActionText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "900"
  },
  connectStatus: {
    color: "#C371FF",
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 18,
    textAlign: "center"
  },
  connectWaiting: {
    alignItems: "center",
    gap: 10,
    marginTop: 6
  },
  connectWaitingDot: {
    backgroundColor: "#D07CFF",
    borderRadius: 999,
    height: 10,
    shadowColor: "#D07CFF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 12,
    width: 10
  },
  connectWaitingDots: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    justifyContent: "center"
  },
  connectWaitingTitle: {
    color: "#E6C8FF",
    fontSize: 14,
    fontWeight: "900",
    lineHeight: 18,
    textAlign: "center"
  },
  connectActivePanel: {
    alignSelf: "center",
    maxWidth: 430,
    width: "100%"
  },
};
