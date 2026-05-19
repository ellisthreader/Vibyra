export const part49 = {
  accountMenuPanel: {
    alignSelf: "flex-end",
    backgroundColor: "rgba(8, 10, 18, 0.99)",
    borderColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 16,
    borderWidth: 1,
    gap: 12,
    marginRight: 12,
    padding: 12,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.28,
    shadowRadius: 22,
    width: 292
  },
  accountTopButton: {
    alignItems: "center",
    backgroundColor: "transparent",
    borderColor: "transparent",
    borderRadius: 999,
    borderWidth: 0,
    height: 38,
    justifyContent: "center",
    width: 38
  },
  chatTopBar: {
    backgroundColor: "rgba(3, 4, 10, 0.98)",
    borderBottomColor: "rgba(255, 255, 255, 0.055)",
    borderBottomWidth: 1,
    gap: 8,
    justifyContent: "space-between",
    minHeight: 62,
    paddingHorizontal: 12
  },
  chatTopIconButton: {
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    borderColor: "rgba(255, 255, 255, 0.075)",
    borderRadius: 999,
    borderWidth: 1,
    height: 38,
    justifyContent: "center",
    width: 38
  },
  chatTopTitle: {
    color: "#F6F2FF",
    fontSize: 15.5,
    fontWeight: "800",
    letterSpacing: 0,
    lineHeight: 19,
    minWidth: 0,
    textAlign: "center"
  },
  communityFeed: {
    flex: 1,
    gap: 8
  },
  communityLoadingPage: {
    borderColor: "rgba(255, 255, 255, 0.075)",
    borderRadius: 14,
    borderWidth: 1,
    minHeight: 280,
    overflow: "hidden"
  },
  communityFilterButton: {
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.045)",
    borderColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 12,
    borderWidth: 1,
    height: 42,
    justifyContent: "center",
    width: 42
  },
  communityPostCard: {
    backgroundColor: "rgba(10, 12, 18, 0.88)",
    borderColor: "rgba(255, 255, 255, 0.075)",
    borderRadius: 14,
    borderWidth: 1,
    gap: 11,
    minHeight: 132,
    padding: 12
  },
  communityPostCardPressed: {
    backgroundColor: "rgba(15, 17, 25, 0.94)",
    opacity: 0.9,
    transform: [{ scale: 0.992 }]
  },
  communityPostDescription: {
    color: "#ABA7B6",
    fontSize: 12.5,
    fontWeight: "700",
    lineHeight: 17,
    marginTop: 3
  },
  communityPostOpenButton: {
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.055)",
    borderColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 999,
    borderWidth: 1,
    height: 32,
    justifyContent: "center",
    paddingHorizontal: 14
  },
  communityPostOpenText: {
    color: "#F2EEFB",
    fontSize: 12,
    fontWeight: "900"
  },
  communityPostTitle: {
    color: "#F7F3FF",
    fontSize: 15.5,
    fontWeight: "900",
    letterSpacing: 0,
    lineHeight: 20
  },
  communityScreen: {
    flex: 1,
    gap: 10,
    paddingBottom: 8,
    position: "relative"
  },
  communitySearchBar: {
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.045)",
    borderColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 12,
    borderWidth: 1,
    flex: 1,
    flexDirection: "row",
    gap: 9,
    minHeight: 42,
    paddingHorizontal: 12
  },
  communitySearchInput: {
    color: "#F6F2FF",
    flex: 1,
    fontSize: 14,
    fontWeight: "700",
    minHeight: 40
  },
  communityTab: {
    alignItems: "center",
    backgroundColor: "transparent",
    borderColor: "rgba(255, 255, 255, 0.075)",
    borderRadius: 999,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 34,
    paddingHorizontal: 14
  },
  communityTabActive: {
    backgroundColor: "rgba(255, 255, 255, 0.11)",
    borderColor: "rgba(255, 255, 255, 0.15)",
    shadowOpacity: 0
  },
  communityTabs: {
    flexDirection: "row",
    gap: 7
  }
} as const;
