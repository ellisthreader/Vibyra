import { Platform, StyleSheet } from "react-native";
import { colors } from "../../../styles/theme";
import { communityDetailAccent, communityDetailAccentDark } from "../data/community";

export const part41 = {
  appPreviewHint: {
    color: "#AAA6BC",
    fontSize: 12,
    fontWeight: "600",
    marginTop: 2
  },
  appPreviewOpenButton: {
    alignItems: "center",
    backgroundColor: "rgba(176, 132, 255, 0.10)",
    borderColor: "rgba(176, 132, 255, 0.22)",
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    gap: 2,
    height: 28,
    justifyContent: "center",
    paddingLeft: 10,
    paddingRight: 6
  },
  appPreviewOpenText: {
    color: "#EDE9FF",
    fontSize: 12,
    fontWeight: "900"
  },
  editDeniedCard: {
    alignItems: "center",
    backgroundColor: "rgba(15, 17, 26, 0.92)",
    borderColor: "rgba(176, 132, 255, 0.24)",
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 11
  },
  editDeniedIcon: {
    alignItems: "center",
    backgroundColor: "rgba(176, 132, 255, 0.12)",
    borderColor: "rgba(176, 132, 255, 0.24)",
    borderRadius: 12,
    borderWidth: 1,
    height: 34,
    justifyContent: "center",
    width: 34
  },
  editDeniedText: {
    flex: 1,
    minWidth: 0
  },
  editDeniedTitle: {
    color: "#FFFFFF",
    fontSize: 13.5,
    fontWeight: "900"
  },
  editDeniedBody: {
    color: "#AFA9C0",
    fontSize: 12,
    fontWeight: "600",
    marginTop: 2
  },
  appModalScreen: {
    backgroundColor: "#02030C",
    flex: 1,
    overflow: "hidden"
  },
  appModalBackdrop: {
    backgroundColor: "#02030C",
    flex: 1
  },
  appModalHeader: {
    alignItems: "center",
    backgroundColor: "#02030C",
    flexDirection: "row",
    gap: 12,
    minHeight: 58,
    paddingBottom: 10,
    paddingHorizontal: 14,
    paddingTop: 8
  },
  appModalIconButton: {
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.045)",
    borderColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 999,
    borderWidth: 1,
    height: 38,
    justifyContent: "center",
    width: 38
  },
  appModalTitleStack: {
    flex: 1,
    minWidth: 0
  },
} as const;
