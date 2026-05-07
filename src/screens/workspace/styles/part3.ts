import { StyleSheet } from "react-native";
import { colors } from "../../../styles/theme";

export const part3 = {
  chatModelName: {
    color: colors.text,
    flex: 1,
    fontSize: 12,
    fontWeight: "800"
  },
  chatModelRow: {
    alignItems: "center",
    borderRadius: 10,
    flexDirection: "row",
    gap: 8,
    minHeight: 36,
    paddingHorizontal: 7
  },
  chatModelRowActive: {
    backgroundColor: "rgba(124, 241, 179, 0.08)"
  },
  chatModelRowLocked: {
    opacity: 0.64
  },
  chatActiveContent: {
    paddingBottom: Platform.OS === "ios" ? 38 : 36,
    paddingHorizontal: 14,
    paddingTop: 0
  },
  chatActiveHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 16,
    minHeight: 64,
    paddingHorizontal: 3
  },
  chatActiveHeaderCopy: {
    flex: 1,
    minWidth: 0
  },
  chatActiveMeta: {
    color: "#AAA6BC",
    fontSize: 12,
    fontWeight: "900"
  },
  chatActivePage: {
    backgroundColor: "#080A12",
    gap: 0,
    overflow: "hidden"
  },
  chatActiveTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "900",
    lineHeight: 24
  },
  chatBackButton: {
    alignItems: "center",
    backgroundColor: "rgba(93, 40, 161, 0.12)",
    borderColor: "rgba(137, 72, 255, 0.22)",
    borderRadius: 14,
    borderWidth: 1,
    height: 32,
    justifyContent: "center",
    width: 32
  },
  chatEditButton: {
    alignItems: "center",
    borderRadius: 999,
    height: 34,
    justifyContent: "center",
    width: 34
  },
  chatFavoriteButton: {
    alignItems: "center",
    borderRadius: 999,
    height: 34,
    justifyContent: "center",
    marginLeft: 2,
    width: 34
  },
  chatEmptySpace: {
    flex: 1,
    minHeight: 0
  },
  chatEmptyState: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    minHeight: 0,
    paddingBottom: 52,
    paddingTop: 24
  },
  chatBackgroundImage: {
    ...StyleSheet.absoluteFillObject,
    height: "100%",
    opacity: 0.78,
    width: "100%"
  },
  chatContent: {
    backgroundColor: "#080A12",
    paddingBottom: Platform.OS === "ios" ? 38 : 36,
    paddingHorizontal: 14,
    paddingTop: 0
  },
  chatHistoryCard: {
    backgroundColor: "rgba(13, 17, 29, 0.9)",
    borderColor: "rgba(78, 79, 102, 0.34)",
    borderRadius: 12,
    borderWidth: 1,
    gap: 6,
    height: 82,
    padding: 10,
    width: 132
  },
  chatHistoryCardActive: {
    backgroundColor: "rgba(31, 20, 54, 0.96)",
    borderColor: "#B64FFF"
  },
  chatHistoryCardMeta: {
    color: "#A9A5B8",
    fontSize: 11,
    fontWeight: "900"
  },
  chatHistoryCardMetaActive: {
    color: "#B64FFF"
  },
  chatHistoryCardTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "900",
    lineHeight: 16
  },
};
