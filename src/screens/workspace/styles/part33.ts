import { StyleSheet } from "react-native";

export const part33 = {
  profileSheetOverlay: {
    flex: 1,
    justifyContent: "flex-end" as const
  },
  profileSheetScrim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(0, 0, 0, 0.62)"
  },
  profileSheet: {
    backgroundColor: "rgba(10, 10, 18, 0.98)",
    borderColor: "rgba(139, 92, 255, 0.32)",
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    borderWidth: 1,
    gap: 14,
    maxHeight: "86%" as const,
    paddingBottom: 30,
    paddingHorizontal: 20,
    paddingTop: 12,
    shadowColor: "#8B35FF",
    shadowOffset: { width: 0, height: -14 },
    shadowOpacity: 0.22,
    shadowRadius: 32
  },
  profileSheetHandle: {
    alignSelf: "center" as const,
    backgroundColor: "rgba(194, 89, 255, 0.5)",
    borderRadius: 999,
    height: 4,
    width: 44
  },
  profileSheetHeader: {
    alignItems: "center" as const,
    flexDirection: "row" as const,
    gap: 14,
    marginTop: 4
  },
  profileSheetHeaderIcon: {
    alignItems: "center" as const,
    backgroundColor: "rgba(139, 53, 255, 0.18)",
    borderColor: "rgba(194, 89, 255, 0.46)",
    borderRadius: 14,
    borderWidth: 1,
    height: 48,
    justifyContent: "center" as const,
    width: 48
  },
  profileSheetHeaderCopy: {
    flex: 1,
    minWidth: 0
  },
  profileSheetKicker: {
    color: "#C259FF",
    fontSize: 10,
    fontWeight: "900" as const,
    letterSpacing: 0.6,
    textTransform: "uppercase" as const
  },
  profileSheetTitle: {
    color: "#F9F6FF",
    fontSize: 19,
    fontWeight: "900" as const,
    lineHeight: 23
  },
  profileSheetClose: {
    alignItems: "center" as const,
    backgroundColor: "rgba(139, 53, 255, 0.18)",
    borderColor: "rgba(194, 89, 255, 0.32)",
    borderRadius: 10,
    borderWidth: 1,
    height: 36,
    justifyContent: "center" as const,
    width: 36
  },
  profileSheetBody: {
    gap: 12
  }
} as const;
