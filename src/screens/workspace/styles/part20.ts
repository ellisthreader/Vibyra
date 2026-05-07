import { StyleSheet } from "react-native";
import { colors } from "../../../styles/theme";

export const part20 = {
  messageAvatarLogo: {
    height: 18,
    width: 18
  },
  messageAvatarUser: {
    backgroundColor: "rgba(255, 255, 255, 0.16)",
    borderColor: "rgba(255, 255, 255, 0.2)",
    borderWidth: 1
  },
  messageContent: {
    flex: 1,
    gap: 4,
    minWidth: 0
  },
  messageFile: {
    color: "#9E98AD",
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 16
  },
  messageRow: {
    flexDirection: "row",
    gap: 12,
    paddingBottom: 14,
    paddingTop: 14
  },
  messageRowAssistant: {
    backgroundColor: "transparent"
  },
  messageRowUser: {
    backgroundColor: "transparent"
  },
  messageText: {
    color: "#E7E3EF",
    fontSize: 15,
    fontWeight: "600",
    lineHeight: 23
  },
  messageBody: {
    gap: 6
  },
  messageBold: {
    color: "#FFFFFF",
    fontWeight: "900"
  },
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
};
