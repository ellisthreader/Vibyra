export const styleSource = {
  agentRunProgress: {
      gap: 4,
      paddingTop: 2
    },
  agentRunProgressTitle: {
      color: "#91A7FF",
      fontSize: 15,
      fontWeight: "800",
      lineHeight: 22
    },
  agentRunProgressLine: {
      color: "#A6ADBA",
      fontSize: 14,
      fontWeight: "500",
      lineHeight: 21
    },
  agentRunEditCard: {
      alignItems: "center",
      backgroundColor: "rgba(15, 17, 26, 0.92)",
      borderColor: "rgba(116, 144, 255, 0.24)",
      borderRadius: 14,
      borderWidth: 1,
      flexDirection: "row",
      gap: 10,
      marginTop: 6,
      paddingHorizontal: 10,
      paddingVertical: 9
    },
  agentRunEditIcon: {
      alignItems: "center",
      backgroundColor: "rgba(116, 144, 255, 0.12)",
      borderRadius: 10,
      height: 32,
      justifyContent: "center",
      width: 32
    },
  agentRunEditBody: {
      flex: 1,
      minWidth: 0
    },
  agentRunEditLabel: {
      color: "#AFA7C2",
      fontSize: 10,
      fontWeight: "900",
      textTransform: "uppercase"
    },
  agentRunEditFile: {
      color: "#F5F7FA",
      fontSize: 12.5,
      fontWeight: "800",
      lineHeight: 18,
      marginTop: 1
    },
  agentRunEditCounts: {
      alignItems: "flex-end",
      gap: 2
    },
  agentRunEditAdd: {
      color: "#4EC07A",
      fontSize: 12,
      fontWeight: "900"
    },
  agentRunEditDel: {
      color: "#F26A6A",
      fontSize: 12,
      fontWeight: "900"
    }
} as const;
