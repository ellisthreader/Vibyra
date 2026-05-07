import { StyleSheet } from "react-native";
import { colors } from "../../../styles/theme";

export const part19 = {
  filterChip: {
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    borderColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  filterChipActive: {
    backgroundColor: "rgba(167, 243, 208, 0.12)",
    borderColor: "rgba(167, 243, 208, 0.28)"
  },
  filterChipText: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "900"
  },
  filterChipTextActive: {
    color: "#DDFCEB"
  },
  filterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  fixedComposer: {
    alignItems: "flex-end",
    backgroundColor: "#0C0E14",
    borderTopColor: "rgba(255, 255, 255, 0.08)",
    borderTopWidth: 1,
    flexDirection: "row",
    gap: 8,
    padding: 12
  },
  bottomNav: {
    alignItems: "center",
    backgroundColor: "rgba(12, 15, 28, 0.96)",
    borderColor: "rgba(119, 81, 178, 0.28)",
    borderRadius: 30,
    borderWidth: 1,
    bottom: Platform.OS === "ios" ? 18 : 14,
    flexDirection: "row",
    gap: 6,
    justifyContent: "space-between",
    left: 18,
    minHeight: 64,
    padding: 6,
    position: "absolute",
    right: 18,
    shadowColor: "#4A2E83",
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.28,
    shadowRadius: 24
  },
  bottomNavItem: {
    alignItems: "center",
    borderRadius: 20,
    flex: 1,
    gap: 3,
    minHeight: 52,
    justifyContent: "center",
    paddingHorizontal: 2
  },
  bottomNavItemActive: {
    backgroundColor: "rgba(99, 42, 210, 0.42)",
    borderColor: "rgba(171, 89, 255, 0.38)",
    borderWidth: 1
  },
  bottomNavText: {
    color: "#A8A7BA",
    fontSize: 10,
    fontWeight: "900"
  },
  bottomNavTextActive: {
    color: "#A95BFF"
  },
  iconOnlyButton: {
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 8,
    borderWidth: 1,
    height: 36,
    justifyContent: "center",
    width: 36
  },
  infoLabel: {
    color: colors.dim,
    fontSize: 13,
    fontWeight: "800"
  },
  infoRow: {
    alignItems: "center",
    borderBottomColor: "rgba(255, 255, 255, 0.08)",
    borderBottomWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 52
  },
  infoValue: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "900"
  },
  keyboard: {
    flex: 1
  },
  main: {
    backgroundColor: "#02030C",
    flex: 1,
    minWidth: 0
  },
  messageBubble: {
    display: "none"
  },
  messageStack: {
    gap: 10,
    minHeight: 500,
    padding: 16
  },
  messageAuthor: {
    color: "#F2EFFB",
    fontSize: 13,
    fontWeight: "900",
    lineHeight: 18
  },
  messageAvatar: {
    alignItems: "center",
    borderRadius: 999,
    height: 28,
    justifyContent: "center",
    marginTop: 2,
    width: 28
  },
  messageAvatarAssistant: {
    backgroundColor: "rgba(8, 10, 20, 0.92)",
    borderColor: "rgba(139, 53, 255, 0.28)",
    borderWidth: 1
  },
};
