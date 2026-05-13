import { Platform, StyleSheet } from "react-native";
import { colors } from "../../../styles/theme";
import { communityDetailAccent, communityDetailAccentDark } from "../data/community";

export const part26 = {
  projectStatusCompleted: {
    backgroundColor: "rgba(83, 31, 150, 0.52)",
    color: "#D075FF"
  },
  projectStatusArchived: {
    backgroundColor: "rgba(105, 102, 123, 0.22)",
    color: "#C4BECE"
  },
  projectStatusDraft: {
    backgroundColor: "rgba(42, 43, 58, 0.68)",
    color: "#C9C3D6"
  },
  projectStatusPill: {
    borderRadius: 999,
    fontSize: 11,
    fontWeight: "900",
    overflow: "hidden",
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  projectSourcePill: {
    alignItems: "center",
    backgroundColor: "rgba(139, 53, 255, 0.24)",
    borderColor: "rgba(221, 187, 255, 0.24)",
    borderRadius: 999,
    borderWidth: 1,
    height: 30,
    justifyContent: "center",
    width: 30
  },
  projectTitleDot: {
    borderRadius: 999,
    height: 8,
    marginLeft: 8,
    width: 8
  },
  projectTitleRow: {
    alignItems: "center",
    flexDirection: "row"
  },
  rowCopy: {
    flex: 1,
    minWidth: 0
  },
  rowIcon: {
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    borderRadius: 8,
    height: 38,
    justifyContent: "center",
    width: 38
  },
  rowIconGreen: {
    backgroundColor: "rgba(167, 243, 208, 0.1)"
  },
  rowTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "900"
  },
  searchBar: {
    alignItems: "center",
    backgroundColor: "#101219",
    borderColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    minHeight: 48,
    paddingHorizontal: 13
  },
  searchInput: {
    color: colors.text,
    flex: 1,
    fontSize: 15,
    minHeight: 46
  },
  secondaryButton: {
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 36,
    paddingHorizontal: 12
  },
  secondaryButtonText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "900"
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "900"
  },
  sendButton: {
    alignItems: "center",
    backgroundColor: colors.accent,
    borderRadius: 8,
    height: 42,
    justifyContent: "center",
    width: 42
  },
  settingsPanel: {
    backgroundColor: "#101219",
    borderColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 8,
    borderWidth: 1,
    gap: 10,
    padding: 16
  },
  settingsTab: {
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    borderColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 9
  },
  settingsTabActive: {
    backgroundColor: "rgba(167, 243, 208, 0.12)",
    borderColor: "rgba(167, 243, 208, 0.28)"
  },
  settingsTabText: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "900"
  },
  settingsTabTextActive: {
    color: "#DDFCEB"
  },
  settingsTabs: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  shell: {
    backgroundColor: "#02030C",
    flex: 1,
    flexDirection: "column",
    overflow: "hidden"
  },
  statusActive: {
    backgroundColor: "rgba(167, 243, 208, 0.12)",
    color: "#DDFCEB"
  },
  statusDot: {
    backgroundColor: colors.success,
    borderRadius: 999,
    height: 7,
    width: 7
  },
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
} as const;
