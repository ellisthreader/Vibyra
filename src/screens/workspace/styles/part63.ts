import { colors } from "../../../styles/theme";

export const part63 = {
  buildEmpty: {
    alignItems: "center",
    alignSelf: "center",
    gap: 18,
    maxWidth: 360,
    paddingHorizontal: 18,
    width: "100%"
  },
  buildEmptyHeader: {
    alignItems: "center",
    gap: 6
  },
  buildEmptyStatus: {
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    gap: 7,
    marginBottom: 6,
    minHeight: 30,
    paddingHorizontal: 12
  },
  buildEmptyStatusDot: {
    backgroundColor: colors.success,
    borderRadius: 999,
    height: 7,
    width: 7
  },
  buildEmptyStatusText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "800"
  },
  buildEmptyTitle: {
    color: colors.text,
    fontSize: 26,
    fontWeight: "900",
    lineHeight: 31,
    textAlign: "center"
  },
  buildEmptyText: {
    color: colors.muted,
    fontSize: 15,
    fontWeight: "600",
    lineHeight: 20,
    maxWidth: 310,
    textAlign: "center"
  },
  buildEmptyPrimary: {
    alignItems: "center",
    backgroundColor: colors.accent,
    borderRadius: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 54,
    paddingLeft: 17,
    paddingRight: 8,
    width: "100%"
  },
  buildEmptyPrimaryText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "900"
  },
  buildEmptyPrimaryIcon: {
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.16)",
    borderRadius: 8,
    height: 38,
    justifyContent: "center",
    width: 38
  },
  buildExampleList: {
    gap: 10,
    width: "100%"
  },
  buildExampleChip: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: "row",
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 14
  },
  buildExampleChipPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.99 }]
  },
  buildExampleIcon: {
    alignItems: "center",
    backgroundColor: colors.accentSoft,
    borderColor: "rgba(139, 92, 255, 0.25)",
    borderRadius: 8,
    borderWidth: 1,
    height: 40,
    justifyContent: "center",
    width: 40
  },
  buildExampleLabel: {
    color: colors.text,
    flex: 1,
    fontSize: 16,
    fontWeight: "800"
  },
} as const;
