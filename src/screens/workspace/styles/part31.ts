import { StyleSheet } from "react-native";
import { colors } from "../../../styles/theme";

export const part31 = {
  statusDotOffline: {
    backgroundColor: "#FF5A6B"
  },
  statusLabel: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 999,
    color: colors.muted,
    fontSize: 11,
    fontWeight: "900",
    overflow: "hidden",
    paddingHorizontal: 9,
    paddingVertical: 5
  },
  statusPill: {
    alignItems: "center",
    backgroundColor: "rgba(55, 214, 122, 0.1)",
    borderColor: "rgba(55, 214, 122, 0.18)",
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    gap: 7,
    paddingHorizontal: 10,
    paddingVertical: 7
  },
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
};
