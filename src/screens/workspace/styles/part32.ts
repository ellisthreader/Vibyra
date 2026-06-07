import { colors } from "../../../styles/theme";

export const part32 = {
  runningProjectsPanel: {
    flex: 1,
    gap: 14
  },
  runningProjectsPanelEmpty: {
    justifyContent: "center",
    paddingBottom: 80
  },
  buildSection: {
    gap: 10,
    marginTop: 2
  },
  buildSectionHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  buildSectionTitle: {
    color: colors.dim,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.6,
    textTransform: "uppercase"
  },
  buildSectionCount: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "900"
  },
  buildList: {
    gap: 8,
    paddingBottom: 2
  },
  buildMoreText: {
    color: colors.dim,
    fontSize: 12,
    fontWeight: "800",
    paddingHorizontal: 2,
    paddingTop: 2
  },
  buildRow: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: "rgba(139, 92, 255, 0.24)",
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: "row",
    gap: 13,
    minHeight: 84,
    overflow: "hidden",
    padding: 14
  },
  buildRowQueued: {
    borderColor: colors.border
  },
  buildRowComplete: {
    backgroundColor: colors.surface,
    borderColor: "rgba(55, 214, 122, 0.34)"
  },
  buildRowPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.99 }]
  },
  buildRowFlyLayer: {
    zIndex: 20
  },
  buildSuccessEdge: {
    borderColor: colors.success,
    borderRadius: 10,
    borderWidth: 2,
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0
  },
  buildRowIcon: {
    alignItems: "center",
    backgroundColor: "rgba(139, 92, 255, 0.16)",
    borderColor: "rgba(139, 92, 255, 0.24)",
    borderRadius: 8,
    borderWidth: 1,
    height: 42,
    justifyContent: "center",
    position: "relative",
    width: 42
  },
  buildRowIconQueued: {
    backgroundColor: colors.infoSoft,
    borderColor: "rgba(76, 163, 255, 0.24)"
  },
  buildRowIconComplete: {
    backgroundColor: colors.successSoft,
    borderColor: "rgba(55, 214, 122, 0.3)"
  },
  buildRowLiveDot: {
    backgroundColor: colors.success,
    borderColor: colors.surface,
    borderRadius: 999,
    borderWidth: 1,
    height: 9,
    position: "absolute",
    right: 6,
    top: 6,
    width: 9
  },
  buildRowLiveDotQueued: {
    backgroundColor: colors.info
  },
  buildRowLiveDotComplete: {
    backgroundColor: colors.success
  },
  buildRowCopy: {
    flex: 1,
    minWidth: 0
  },
  buildRowTitleLine: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8
  },
  buildRowName: {
    color: colors.text,
    flex: 1,
    fontSize: 15,
    fontWeight: "800",
    lineHeight: 19
  },
  buildRowMeta: {
    color: colors.dim,
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 17,
    marginTop: 4
  },
  buildActivityStrip: {
    alignItems: "center",
    flexDirection: "row",
    gap: 4,
    marginTop: 9
  },
  buildActivityBlock: {
    backgroundColor: "rgba(139, 92, 255, 0.72)",
    borderRadius: 999,
    height: 4,
    width: 18
  },
  buildActivityBlockWide: {
    width: 34
  },
  buildRowAside: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8
  },
  buildStatusPill: {
    alignItems: "center",
    backgroundColor: colors.accentSoft,
    borderRadius: 999,
    justifyContent: "center",
    minHeight: 22,
    paddingHorizontal: 8,
    paddingVertical: 0
  },
  buildStatusPillQueued: {
    backgroundColor: colors.infoSoft
  },
  buildStatusPillComplete: {
    backgroundColor: colors.successSoft
  },
  buildStatusText: {
    color: "#CDBDFF",
    fontSize: 10,
    fontWeight: "900",
    lineHeight: 12,
    textAlign: "center"
  },
  buildStatusTextQueued: {
    color: "#8CC8FF"
  },
  buildStatusTextComplete: {
    color: "#8EF0B2"
  },
  buildTimerText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "900"
  },
  buildTimerTextComplete: {
    color: "#8EF0B2"
  },
} as const;
