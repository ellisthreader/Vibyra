import { Platform, StyleSheet } from "react-native";
import { colors } from "../../../styles/theme";
import { communityDetailAccent, communityDetailAccentDark } from "../data/community";

export const part18 = {
  messageInlineCode: {
    backgroundColor: "rgba(139, 53, 255, 0.18)",
    borderRadius: 4,
    color: "#E2D6FF",
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
    fontSize: 13.5,
    paddingHorizontal: 5,
    paddingVertical: 1
  },
  messageCodeBlock: {
    backgroundColor: "#0B0D17",
    borderColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 10,
    borderWidth: 1,
    marginVertical: 4,
    overflow: "hidden"
  },
  messageCodeBlockHeader: {
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    borderBottomColor: "rgba(255, 255, 255, 0.06)",
    borderBottomWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6
  },
  messageCodeBlockLang: {
    color: "#9E98AD",
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.4,
    textTransform: "uppercase"
  },
  messageCodeBlockText: {
    color: "#E5E2F0",
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
    fontSize: 13,
    lineHeight: 19,
    padding: 12
  },
  messageHeading1: {
    color: "#FFFFFF",
    fontSize: 19,
    fontWeight: "900",
    lineHeight: 25,
    marginTop: 4
  },
  messageHeading2: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "900",
    lineHeight: 23,
    marginTop: 2
  },
  messageHeading3: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800",
    lineHeight: 21
  },
  messageListRow: {
    flexDirection: "row",
    gap: 8
  },
  messageBulletDot: {
    color: "#B9B5C8",
    fontSize: 15,
    lineHeight: 23,
    width: 12
  },
  messageNumberedMarker: {
    color: "#B9B5C8",
    fontSize: 14,
    fontWeight: "800",
    lineHeight: 23,
    minWidth: 20
  },
  messageListText: {
    flex: 1
  },
  messageSpacer: {
    height: 4
  },
  typingIndicator: {
    alignItems: "center",
    flexDirection: "row",
    gap: 5,
    paddingTop: 6
  },
  typingDot: {
    backgroundColor: "#B49CFF",
    borderRadius: 4,
    height: 7,
    width: 7
  },
  appPreviewCard: {
    alignItems: "center",
    backgroundColor: "rgba(142, 60, 255, 0.10)",
    borderColor: "rgba(142, 60, 255, 0.35)",
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 12
  },
  appPreviewIcon: {
    alignItems: "center",
    borderRadius: 12,
    height: 42,
    justifyContent: "center",
    width: 42
  },
  appPreviewBody: {
    flex: 1,
    minWidth: 0
  },
  appPreviewLabel: {
    color: "#B49CFF",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.6,
    textTransform: "uppercase"
  },
  appPreviewTitle: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "900",
    marginTop: 2
  },
  appPreviewHint: {
    color: "#AAA6BC",
    fontSize: 12,
    fontWeight: "600",
    marginTop: 2
  },
  appPreviewArrow: {
    alignItems: "center",
    height: 28,
    justifyContent: "center",
    width: 20
  },
  appModalScreen: {
    backgroundColor: "#02030C",
    flex: 1
  },
  appModalHeader: {
    alignItems: "center",
    borderBottomColor: "rgba(255, 255, 255, 0.08)",
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10
  },
  appModalIconButton: {
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    borderRadius: 12,
    height: 36,
    justifyContent: "center",
    width: 36
  },
  appModalTitleStack: {
    flex: 1,
    minWidth: 0
  },
} as const;
