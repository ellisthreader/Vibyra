import { StyleSheet } from "react-native";
import { colors } from "../../../styles/theme";

export const part27 = {
  projectCardCopy: {
    flex: 1,
    minWidth: 0
  },
  projectCardFooter: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10
  },
  projectCardFooterComfort: {
    flexWrap: "wrap"
  },
  projectCardFooterStacked: {
    alignItems: "stretch",
    flexDirection: "column",
    gap: 10
  },
  projectCardMain: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 12
  },
  projectCardRight: {
    alignItems: "flex-end",
    flexDirection: "row",
    gap: 12,
    paddingTop: 1,
    position: "relative",
    zIndex: 10
  },
  projectCardTop: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  projectDivider: {
    backgroundColor: "rgba(132, 128, 151, 0.16)",
    height: 1,
    marginBottom: 10,
    marginTop: 12,
    width: "100%"
  },
  projectFooterActions: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    marginLeft: "auto"
  },
  projectFooterActionsComfort: {
    alignItems: "center",
    flexDirection: "row",
    gap: 7,
    marginLeft: "auto"
  },
  projectFooterActionsStacked: {
    alignItems: "center",
    alignSelf: "stretch",
    flexDirection: "row",
    gap: 7,
    justifyContent: "flex-end"
  },
  projectFooterDetails: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    gap: 10,
    minWidth: 0
  },
  projectFooterDetailsStacked: {
    alignItems: "center",
    alignSelf: "stretch",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 9
  },
  projectFooterMeta: {
    alignItems: "center",
    flexShrink: 1,
    flexDirection: "row",
    gap: 5,
    minWidth: 0
  },
  projectFooterText: {
    color: "#AAA6BC",
    fontSize: 12,
    fontWeight: "800"
  },
  projectDeleteActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 22,
    width: "100%"
  },
  projectDeleteBody: {
    color: "#B8B1C9",
    fontSize: 14,
    fontWeight: "800",
    lineHeight: 20,
    marginTop: 8,
    textAlign: "center"
  },
  projectDeleteCancelButton: {
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    borderColor: "rgba(170, 166, 188, 0.2)",
    borderRadius: 11,
    borderWidth: 1,
    flex: 1,
    minHeight: 44,
    justifyContent: "center"
  },
  projectDeleteCancelText: {
    color: "#E1DAF2",
    fontSize: 14,
    fontWeight: "900"
  },
  projectDeleteConfirmButton: {
    alignItems: "center",
    backgroundColor: "#E84866",
    borderRadius: 11,
    flex: 1,
    minHeight: 44,
    justifyContent: "center",
    shadowColor: "#FF5F78",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.28,
    shadowRadius: 18
  },
  projectDeleteConfirmText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "900"
  },
  projectDeleteDialog: {
    alignItems: "center",
    backgroundColor: "#0B0A16",
    borderColor: "rgba(183, 121, 255, 0.28)",
    borderRadius: 20,
    borderWidth: 1,
    maxWidth: 342,
    padding: 22,
    shadowColor: "#0A061A",
    shadowOffset: { width: 0, height: 24 },
    shadowOpacity: 0.55,
    shadowRadius: 34,
    width: "86%"
  },
};
