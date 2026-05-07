import { StyleSheet } from "react-native";
import { colors } from "../../../styles/theme";

export const part21 = {
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
  appModalLabel: {
    color: "#B49CFF",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.6,
    textTransform: "uppercase"
  },
  appModalTitle: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "900",
    marginTop: 2
  },
  appModalWebContainer: {
    backgroundColor: "#0B0D17",
    flex: 1
  },
  appModalWebView: {
    backgroundColor: "transparent",
    flex: 1
  },
  appModalLoader: {
    alignItems: "center",
    backgroundColor: "#0B0D17",
    flex: 1,
    justifyContent: "center",
    ...StyleSheet.absoluteFillObject
  },
  pageHeader: {
    alignItems: "flex-start",
    flexDirection: "column",
    gap: 16,
    justifyContent: "space-between"
  },
  pageHeaderCopy: {
    flex: 1,
    minWidth: 0
  },
  pageStack: {
    flex: 1,
    gap: 16,
    minHeight: "100%"
  },
  pageTitle: {
    color: colors.text,
    fontSize: 28,
    fontWeight: "900",
    letterSpacing: 0,
    lineHeight: 36
  },
  postCard: {
    alignItems: "flex-start",
    backgroundColor: "#101219",
    borderColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    padding: 14
  },
  postContent: {
    flex: 1,
    minWidth: 0
  },
};
