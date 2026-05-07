import { StyleSheet } from "react-native";
import { colors } from "../../../styles/theme";

export const part18 = {
  communityPreviewValue: {
    color: colors.text,
    fontSize: 11,
    fontWeight: "900",
    marginTop: 4
  },
  communityReportButton: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: "rgba(255, 100, 128, 0.08)",
    borderColor: "rgba(255, 100, 128, 0.22)",
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    minHeight: 42,
    paddingHorizontal: 13
  },
  communityReportText: {
    color: "#FFB4C1",
    fontSize: 13,
    fontWeight: "900"
  },
  communityReportTextDone: {
    color: "#B7FBD0"
  },
  communityTabPanel: {
    gap: 14
  },
  communityDetailTopSave: {
    alignItems: "center",
    height: 44,
    justifyContent: "center",
    marginRight: -8,
    width: 44
  },
  communityScreen: {
    flex: 1,
    gap: 12,
    paddingBottom: 8,
    position: "relative"
  },
  communitySearchBar: {
    alignItems: "center",
    backgroundColor: "rgba(10, 13, 24, 0.8)",
    borderColor: "rgba(118, 101, 171, 0.28)",
    borderRadius: 11,
    borderWidth: 1,
    flex: 1,
    flexDirection: "row",
    gap: 10,
    minHeight: 44,
    paddingHorizontal: 14
  },
  communitySearchInput: {
    color: colors.text,
    flex: 1,
    fontSize: 15,
    fontWeight: "800",
    minHeight: 42
  },
  communitySearchRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10
  },
  communityTab: {
    alignItems: "center",
    backgroundColor: "rgba(18, 19, 30, 0.82)",
    borderColor: "rgba(112, 105, 133, 0.32)",
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 36,
    paddingHorizontal: 16
  },
  communityTabActive: {
    backgroundColor: "rgba(96, 42, 168, 0.74)",
    borderColor: "rgba(188, 104, 255, 0.78)",
    shadowColor: "#A64BFF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.74,
    shadowRadius: 12
  },
  communityTabs: {
    flexDirection: "row",
    gap: 8
  },
  communityTabText: {
    color: "#B5B0C3",
    fontSize: 13,
    fontWeight: "900"
  },
  communityTabTextActive: {
    color: colors.text
  },
  content: {
    flexGrow: 1,
    paddingBottom: 126,
    paddingHorizontal: 18,
    paddingTop: 8
  },
  contentScroll: {
    flex: 1
  },
  dashboardContent: {
    justifyContent: "space-between",
    paddingBottom: 94,
    paddingTop: 4
  },
  projectsContent: {
    paddingHorizontal: 8,
    paddingTop: 10
  },
  dangerButton: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: "rgba(255, 93, 122, 0.11)",
    borderColor: "rgba(255, 93, 122, 0.26)",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    minHeight: 42,
    paddingHorizontal: 13
  },
  dangerButtonText: {
    color: "#FFB4C1",
    fontSize: 13,
    fontWeight: "900"
  },
  emptyText: {
    color: colors.dim,
    fontSize: 14,
    fontWeight: "700"
  },
};
