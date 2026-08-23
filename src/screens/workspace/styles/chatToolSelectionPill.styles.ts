export const styleSource = {
  chatToolPill: {
      alignItems: "center",
      alignSelf: "flex-start",
      backgroundColor: "rgba(91, 124, 250, 0.2)",
      borderColor: "rgba(190, 183, 211, 0.2)",
      borderRadius: 999,
      borderWidth: 1,
      flexDirection: "row",
      gap: 7,
      minHeight: 30,
      paddingLeft: 10,
      paddingRight: 6
    },
  chatToolPillClear: {
      alignItems: "center",
      height: 24,
      justifyContent: "center",
      width: 24
    },
  chatToolPillRow: {
      marginBottom: 10
    },
  chatToolPillText: {
      color: "#F5F7FA",
      fontSize: 12,
      fontWeight: "900"
    }
} as const;
