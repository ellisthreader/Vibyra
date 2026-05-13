import { Platform, StyleSheet } from "react-native";
import { colors } from "../../../styles/theme";
import { communityDetailAccent, communityDetailAccentDark } from "../data/community";

export const part27 = {
  statusText: {
    color: "#B9F8D0",
    fontSize: 12,
    fontWeight: "900"
  },
  pcApprovalCard: {
    alignItems: "center",
    backgroundColor: "rgba(36, 76, 58, 0.24)",
    borderColor: "rgba(112, 240, 162, 0.28)",
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    padding: 12
  },
  pcApprovalCopy: {
    flex: 1,
    minWidth: 0
  },
  pcApprovalIcon: {
    alignItems: "center",
    backgroundColor: "rgba(112, 240, 162, 0.12)",
    borderRadius: 12,
    height: 42,
    justifyContent: "center",
    width: 42
  },
  pcApprovalText: {
    color: "#B7DEC5",
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 16,
    marginTop: 3
  },
  pcApprovalTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "900",
    lineHeight: 18
  },
  pcCandidateCopy: {
    flex: 1,
    minWidth: 0
  },
  pcCandidateIcon: {
    alignItems: "center",
    backgroundColor: "rgba(96, 57, 170, 0.24)",
    borderColor: "rgba(154, 91, 255, 0.3)",
    borderRadius: 12,
    borderWidth: 1,
    height: 42,
    justifyContent: "center",
    width: 42
  },
  pcCandidateIconCurrent: {
    backgroundColor: "rgba(54, 181, 111, 0.18)",
    borderColor: "rgba(112, 240, 162, 0.34)"
  },
  pcCandidateList: {
    gap: 9
  },
  pcCandidateMeta: {
    color: "#9E98B1",
    fontSize: 12,
    fontWeight: "800",
    marginTop: 3
  },
  pcCandidateStatusChecking: {
    backgroundColor: "#FFE76A"
  },
  pcCandidateStatusCurrent: {
    backgroundColor: "#70F0A2"
  },
  pcCandidateStatusDot: {
    borderRadius: 999,
    height: 7,
    width: 7
  },
  pcCandidateStatusOffline: {
    backgroundColor: "#6F6A80"
  },
  pcCandidateStatusOnline: {
    backgroundColor: "#51E895"
  },
  pcCandidateStatusRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 7
  },
  pcCandidateRow: {
    alignItems: "center",
    backgroundColor: "rgba(16, 18, 31, 0.82)",
    borderColor: "rgba(112, 105, 133, 0.26)",
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    minHeight: 64,
    paddingHorizontal: 12
  },
  pcCandidateTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "900"
  },
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
  pcConnectTab: { alignItems: "center", borderRadius: 999, flex: 1, flexDirection: "row", gap: 7, justifyContent: "center", minHeight: 38 },
  pcConnectTabActive: { backgroundColor: "rgba(148, 65, 255, 0.24)" },
  pcConnectTabs: { backgroundColor: "rgba(10, 12, 24, 0.82)", borderColor: "rgba(118, 101, 171, 0.28)", borderRadius: 999, borderWidth: 1, flexDirection: "row", gap: 5, padding: 4 },
  pcConnectTabText: { color: "#9E98B1", fontSize: 13, fontWeight: "900" },
  pcConnectTabTextActive: { color: colors.text },
  pcManualPanel: {
    gap: 9
  },
  pcManualTitle: {
    color: "#C8C1DC",
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase"
  },
} as const;
