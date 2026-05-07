import { StyleSheet } from "react-native";
import { colors } from "../../../styles/theme";

export const part1 = {
  avatar: {
    alignItems: "center",
    backgroundColor: "rgba(167, 243, 208, 0.12)",
    borderRadius: 8,
    height: 42,
    justifyContent: "center",
    width: 42
  },
  avatarText: {
    color: "#DDFCEB",
    fontSize: 17,
    fontWeight: "900"
  },
  bodyText: {
    color: "#B6B3C6",
    fontSize: 14,
    fontWeight: "800",
    lineHeight: 19,
    marginTop: 5,
    textAlign: "center"
  },
  card: {
    backgroundColor: "#101219",
    borderColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 8,
    borderWidth: 1,
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 280,
    gap: 12,
    padding: 16
  },
  cardAction: {
    color: "#A7F3D0",
    fontSize: 13,
    fontWeight: "900"
  },
  cardHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  chatInput: {
    color: colors.text,
    flex: 1,
    fontSize: 15,
    maxHeight: 120,
    minHeight: 42,
    paddingHorizontal: 10,
    paddingVertical: 10,
    textAlignVertical: "top"
  },
  chatArtBubble: {
    alignItems: "center",
    borderColor: "rgba(190, 97, 255, 0.9)",
    borderRadius: 999,
    borderWidth: 2,
    height: 82,
    justifyContent: "center",
    left: 42,
    position: "absolute",
    shadowColor: "#B85DFF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.95,
    shadowRadius: 17,
    top: 48,
    width: 82,
    zIndex: 4
  },
  chatArtBubbleEye: {
    backgroundColor: "#F5E9FF",
    borderRadius: 999,
    height: 15,
    shadowColor: "#FFFFFF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 8,
    width: 15
  },
  chatArtBubbleFace: {
    flexDirection: "row",
    gap: 16
  },
  chatArtBubbleTail: {
    backgroundColor: "#2A1160",
    borderBottomColor: "rgba(190, 97, 255, 0.9)",
    borderBottomWidth: 2,
    borderLeftColor: "rgba(190, 97, 255, 0.9)",
    borderLeftWidth: 2,
    borderRadius: 8,
    bottom: 36,
    height: 22,
    left: 45,
    position: "absolute",
    transform: [{ rotate: "-22deg" }],
    width: 27,
    zIndex: 3
  },
  chatArtGlowFloor: {
    backgroundColor: "rgba(129, 42, 255, 0.32)",
    borderRadius: 999,
    bottom: 10,
    height: 20,
    left: 11,
    position: "absolute",
    shadowColor: "#8A34FF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.95,
    shadowRadius: 25,
    transform: [{ scaleX: 3 }],
    width: 78
  },
  chatArtLineLong: {
    backgroundColor: "rgba(150, 67, 255, 0.72)",
    borderRadius: 999,
    height: 5,
    marginTop: 11,
    width: 54
  },
  chatArtLineMid: {
    backgroundColor: "rgba(99, 43, 200, 0.72)",
    borderRadius: 999,
    height: 4,
    marginTop: 8,
    width: 45
  },
  chatArtLineShort: {
    backgroundColor: "rgba(67, 31, 145, 0.78)",
    borderRadius: 999,
    height: 4,
    marginTop: 8,
    width: 34
  },
  chatArtPanel: {
    backgroundColor: "rgba(26, 12, 70, 0.5)",
    borderColor: "rgba(156, 50, 255, 0.72)",
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingTop: 13,
    position: "absolute",
    shadowColor: "#8A34FF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 16
  },
  chatArtPanelBack: {
    height: 94,
    right: 28,
    top: 22,
    width: 94,
    zIndex: 1
  },
  chatArtPanelDot: {
    backgroundColor: "rgba(92, 43, 178, 0.84)",
    borderRadius: 999,
    height: 15,
    left: 14,
    position: "absolute",
    top: 23,
    width: 15
  },
  chatArtPanelFront: {
    bottom: 27,
    height: 65,
    right: 11,
    width: 80,
    zIndex: 2
  },
  chatArtStarLarge: {
    backgroundColor: "#C179FF",
    height: 10,
    left: 32,
    position: "absolute",
    top: 33,
    transform: [{ rotate: "45deg" }],
    width: 10
  },
  chatArtStarSmall: {
    backgroundColor: "#9A4DFF",
    height: 6,
    position: "absolute",
    right: 5,
    top: 55,
    transform: [{ rotate: "45deg" }],
    width: 6
  },
  chatAssistantPanel: {
    flex: 1,
    gap: 0,
    justifyContent: "flex-end",
    minHeight: 0,
    paddingBottom: Platform.OS === "ios" ? 8 : 2
  },
};
