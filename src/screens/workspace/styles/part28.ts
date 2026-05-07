import { StyleSheet } from "react-native";
import { colors } from "../../../styles/theme";

export const part28 = {
  projectDeleteIcon: {
    alignItems: "center",
    backgroundColor: "rgba(232, 72, 102, 0.14)",
    borderColor: "rgba(255, 140, 160, 0.28)",
    borderRadius: 16,
    borderWidth: 1,
    height: 52,
    justifyContent: "center",
    width: 52
  },
  projectDeleteOverlay: {
    alignItems: "center",
    backgroundColor: "rgba(3, 4, 12, 0.78)",
    flex: 1,
    justifyContent: "center",
    padding: 22
  },
  projectDeleteTitle: {
    color: colors.text,
    fontSize: 21,
    fontWeight: "900",
    letterSpacing: 0,
    lineHeight: 26,
    marginTop: 16,
    textAlign: "center"
  },
  projectGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12
  },
  projectIcon: {
    alignItems: "center",
    backgroundColor: "rgba(30, 29, 45, 0.74)",
    borderRadius: 13,
    height: 44,
    justifyContent: "center",
    width: 44
  },
  projectIconActive: {
    backgroundColor: "rgba(43, 96, 79, 0.38)"
  },
  projectIconArchived: {
    backgroundColor: "rgba(82, 79, 96, 0.34)"
  },
  projectIconCompleted: {
    backgroundColor: "rgba(83, 31, 150, 0.58)"
  },
  projectMenu: {
    backgroundColor: "#0C0B18",
    borderColor: "rgba(183, 121, 255, 0.24)",
    borderRadius: 14,
    borderWidth: 1,
    gap: 3,
    minWidth: 154,
    padding: 6,
    shadowColor: "#8D36FF",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.14,
    shadowRadius: 12,
    width: 158
  },
  projectMenuLayer: {
    alignItems: "flex-end",
    bottom: 10,
    justifyContent: "flex-start",
    left: 10,
    position: "absolute",
    right: 10,
    top: 50,
    zIndex: 30
  },
  projectMenuItem: {
    alignItems: "center",
    borderRadius: 10,
    flexDirection: "row",
    gap: 10,
    minHeight: 39,
    paddingHorizontal: 10
  },
  projectMenuItemPressed: {
    backgroundColor: "rgba(112, 51, 255, 0.22)"
  },
  projectMenuItemText: {
    color: "#E8E1FF",
    fontSize: 13,
    fontWeight: "900"
  },
  projectMenuItemTextDanger: {
    color: "#FF7F96"
  },
  projectMoreButton: {
    alignItems: "center",
    backgroundColor: "rgba(23, 22, 36, 0.72)",
    borderColor: "rgba(146, 119, 205, 0.2)",
    borderRadius: 10,
    borderWidth: 1,
    height: 28,
    justifyContent: "center",
    width: 28
  },
  projectMeta: {
    color: "#8F8B9F",
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 17,
    marginTop: 4
  },
  renameChatActions: {
    flexDirection: "row",
    gap: 10,
    justifyContent: "flex-end"
  },
  renameChatCancelButton: {
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    borderColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 11,
    borderWidth: 1,
    minHeight: 42,
    paddingHorizontal: 16,
    justifyContent: "center"
  },
  renameChatCancelText: {
    color: "#D8D3E4",
    fontSize: 14,
    fontWeight: "900"
  },
  renameChatCopy: {
    flex: 1,
    minWidth: 0
  },
  renameChatDialog: {
    backgroundColor: "rgba(9, 11, 21, 0.98)",
    borderColor: "rgba(139, 53, 255, 0.32)",
    borderRadius: 18,
    borderWidth: 1,
    gap: 14,
    marginHorizontal: 18,
    maxWidth: 420,
    padding: 16,
    shadowColor: "#8B35FF",
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.24,
    shadowRadius: 28,
    width: "90%"
  },
  renameChatHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12
  },
};
