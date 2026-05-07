import { StyleSheet } from "react-native";
import { colors } from "../../../styles/theme";

export const part32 = {
  pcCodeButton: {
    alignItems: "center",
    backgroundColor: "#6E31FF",
    borderRadius: 11,
    height: 44,
    justifyContent: "center",
    width: 48
  },
  pcCodeInput: {
    color: colors.text,
    flex: 1,
    fontSize: 15,
    fontWeight: "900",
    minHeight: 44,
    paddingHorizontal: 13
  },
  pcCodeRow: {
    alignItems: "center",
    backgroundColor: "rgba(9, 11, 21, 0.78)",
    borderColor: "rgba(118, 101, 171, 0.28)",
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    padding: 5
  },
  pcConfirmButton: {
    alignItems: "center",
    backgroundColor: "rgba(112, 240, 162, 0.18)",
    borderColor: "rgba(112, 240, 162, 0.42)",
    borderRadius: 10,
    borderWidth: 1,
    minHeight: 36,
    paddingHorizontal: 12,
    justifyContent: "center"
  },
  pcConfirmButtonText: {
    color: "#DDFCEB",
    fontSize: 12,
    fontWeight: "900"
  },
  pcControlDisabled: {
    opacity: 0.58
  },
  pcManualPanel: {
    gap: 9
  },
  pcManualTitle: {
    color: "#C8C1DC",
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase"
  },
  pcScanButton: {
    alignItems: "center",
    backgroundColor: "rgba(108, 49, 255, 0.88)",
    borderColor: "rgba(190, 150, 255, 0.42)",
    borderRadius: 13,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    justifyContent: "center",
    minHeight: 48,
    shadowColor: "#7334FF",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.24,
    shadowRadius: 18
  },
  pcScanButtonText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "900"
  },
  pcSwitcherClose: {
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 10,
    borderWidth: 1,
    height: 36,
    justifyContent: "center",
    width: 36
  },
  pcSwitcherError: {
    color: "#FF9DAE",
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 16
  },
  pcSwitcherHandle: {
    alignSelf: "center",
    backgroundColor: "rgba(207, 199, 226, 0.26)",
    borderRadius: 999,
    height: 4,
    width: 42
  },
  pcSwitcherHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 13
  },
  pcSwitcherHeaderCopy: {
    flex: 1,
    minWidth: 0
  },
  pcSwitcherHeaderIcon: {
    alignItems: "center",
    backgroundColor: "rgba(92, 47, 232, 0.34)",
    borderColor: "rgba(183, 124, 255, 0.34)",
    borderRadius: 14,
    borderWidth: 1,
    height: 48,
    justifyContent: "center",
    width: 48
  },
  pcSwitcherKicker: {
    color: "#9AE9B4",
    fontSize: 10,
    fontWeight: "900",
    textTransform: "uppercase"
  },
  pcSwitcherMessage: {
    color: "#B8B2C9",
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 16
  },
  pcSwitcherOverlay: {
    flex: 1,
    justifyContent: "flex-end"
  },
  pcSwitcherScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.58)"
  },
  pcSwitcherSheet: {
    backgroundColor: "rgba(6, 8, 18, 0.98)",
    borderColor: "rgba(126, 102, 190, 0.32)",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    gap: 15,
    paddingBottom: 28,
    paddingHorizontal: 18,
    paddingTop: 10,
    shadowColor: "#6E31FF",
    shadowOffset: { width: 0, height: -14 },
    shadowOpacity: 0.22,
    shadowRadius: 28
  },
  pcSwitcherTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "900",
    letterSpacing: 0,
    lineHeight: 24
  },
};
