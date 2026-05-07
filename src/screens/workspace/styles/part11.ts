import { StyleSheet } from "react-native";
import { colors } from "../../../styles/theme";

export const part11 = {
  communityCommentHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  communityCommentComposer: {
    alignItems: "flex-end",
    backgroundColor: "rgba(10, 13, 24, 0.84)",
    borderColor: "rgba(139, 53, 255, 0.28)",
    borderRadius: 13,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    padding: 8
  },
  communityCommentError: {
    alignItems: "flex-start",
    backgroundColor: "rgba(255, 107, 154, 0.1)",
    borderColor: "rgba(255, 157, 174, 0.26)",
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    padding: 10
  },
  communityCommentErrorText: {
    color: "#FFB4C1",
    flex: 1,
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 17
  },
  communityCommentInput: {
    color: colors.text,
    flex: 1,
    fontSize: 14,
    fontWeight: "800",
    lineHeight: 19,
    maxHeight: 86,
    minHeight: 39,
    paddingHorizontal: 6,
    paddingTop: 9
  },
  communityCommentName: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "900"
  },
  communityCommentNameRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between"
  },
  communityCommentPostButton: {
    alignItems: "center",
    backgroundColor: communityDetailAccent,
    borderRadius: 10,
    flexDirection: "row",
    gap: 6,
    minHeight: 38,
    paddingHorizontal: 12
  },
  communityCommentPostButtonDisabled: {
    opacity: 0.42
  },
  communityCommentPostText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "900"
  },
  communityCommentRow: {
    alignItems: "flex-start",
    borderBottomColor: "rgba(255, 255, 255, 0.08)",
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 10,
    paddingBottom: 12
  },
  communityCommentSection: {
    gap: 12,
    paddingTop: 2
  },
  communityCommentText: {
    color: "#BDB7CA",
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 19,
    marginTop: 3
  },
  communityCommentTime: {
    color: "#B8B2C4",
    fontSize: 13,
    fontWeight: "700"
  },
  communityDefaultLogoBlade: {
    borderRadius: 999,
    opacity: 0.82,
    position: "absolute",
    transform: [{ rotate: "34deg" }]
  },
  communityDefaultLogoBladeAlt: {
    backgroundColor: "rgba(255, 255, 255, 0.68)",
    opacity: 0.72,
    transform: [{ rotate: "-42deg" }]
  },
  communityDefaultLogoOrb: {
    borderRadius: 999,
    position: "absolute",
    right: 10,
    top: 10
  },
  communityFilterButton: {
    alignItems: "center",
    backgroundColor: "rgba(15, 17, 29, 0.8)",
    borderColor: "rgba(118, 101, 171, 0.3)",
    borderRadius: 11,
    borderWidth: 1,
    height: 44,
    justifyContent: "center",
    width: 44
  },
  communityDetailActions: {
    alignItems: "center",
    flexDirection: "row",
    gap: 7
  },
  communityDetailBack: {
    alignItems: "center",
    height: 44,
    justifyContent: "center",
    marginLeft: -10,
    width: 44
  },
  communityDetailDescription: {
    color: "#B9B4C6",
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: 0,
    lineHeight: 21,
    marginTop: 8
  },
  communityDetailHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 42
  },
};
