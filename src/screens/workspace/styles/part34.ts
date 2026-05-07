import { StyleSheet } from "react-native";
import { colors } from "../../../styles/theme";

export const part34 = {
  tokenSheetScroll: {
    flexShrink: 1
  },
  tokenSheetTitle: {
    color: "#F9F6FF",
    fontSize: 20,
    fontWeight: "900",
    letterSpacing: 0,
    lineHeight: 24
  },
  tokenText: {
    color: "#FFE76A",
    fontSize: 15,
    fontWeight: "900",
    lineHeight: 18
  },
  tokenSubtext: {
    color: "#BDB9C7",
    fontSize: 10,
    fontWeight: "900"
  },
  tokenTrack: {
    backgroundColor: "rgba(139, 53, 255, 0.34)",
    borderRadius: 999,
    height: 10,
    overflow: "hidden"
  },
  tokenTrackFill: {
    borderRadius: 999,
    height: 10
  },
  pageTopTitle: {
    color: colors.text,
    fontSize: 24,
    fontWeight: "900",
    letterSpacing: 0,
    lineHeight: 28
  },
  pageTopTitleBlock: {
    flex: 1,
    minWidth: 0
  },
  topBar: {
    alignItems: "center",
    backgroundColor: "#02030C",
    borderBottomColor: "rgba(91, 91, 112, 0.18)",
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between",
    minHeight: 74,
    paddingBottom: 10,
    paddingHorizontal: 16,
    paddingTop: 10,
    position: "relative"
  },
  chatTopActions: {
    alignItems: "center",
    flexDirection: "row",
    flexShrink: 1,
    gap: 7,
    justifyContent: "flex-end",
    minWidth: 0
  },
  chatTopBar: {
    backgroundColor: "#080A12",
    borderBottomColor: "rgba(255, 255, 255, 0.04)",
    gap: 8,
    justifyContent: "space-between",
    paddingHorizontal: 12
  },
  chatTopIconButton: {
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.055)",
    borderColor: "rgba(126, 124, 155, 0.22)",
    borderRadius: 11,
    borderWidth: 1,
    height: 38,
    justifyContent: "center",
    width: 38
  },
  chatTopLeft: {
    alignItems: "center",
    flexDirection: "row",
    flexShrink: 0,
    gap: 7
  },
  chatTopTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "900",
    letterSpacing: 0,
    lineHeight: 22,
    minWidth: 0,
    textAlign: "center"
  },
  chatTopTitleWrap: {
    alignItems: "center",
    bottom: 0,
    justifyContent: "center",
    left: 94,
    paddingHorizontal: 6,
    position: "absolute",
    right: 94,
    top: 0
  },
  topBarChat: {
    borderBottomColor: "rgba(91, 91, 112, 0.26)",
    minHeight: 74,
    paddingHorizontal: 18
  },
  topLeft: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    gap: 11,
    minWidth: 0
  },
  topLeftPressed: {
    opacity: 0.74
  },
  topMachineCopy: {
    flex: 1,
    minWidth: 0
  },
  topConnectionRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8
  },
  topKicker: {
    color: "#9AE9B4",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0,
    textTransform: "uppercase"
  },
  topRight: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "flex-end"
  },
};
