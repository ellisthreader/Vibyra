export const styleSource = {
  topBar: {
      alignItems: "center",
      backgroundColor: "#0E0F12",
      borderBottomColor: "rgba(255, 255, 255, 0.04)",
      borderBottomWidth: 1,
      flexDirection: "row",
      gap: 8,
      justifyContent: "space-between",
      minHeight: 58,
      paddingBottom: 8,
      paddingHorizontal: 12,
      paddingTop: 8,
      position: "relative"
    },
  topKicker: {
      color: "#7CF1B3",
      fontSize: 9,
      fontWeight: "900",
      letterSpacing: 0,
      textTransform: "uppercase"
    },
  topTitle: {
      color: "#F5F7FA",
      flexShrink: 1,
      fontSize: 17,
      fontWeight: "900",
      letterSpacing: 0,
      lineHeight: 21
    },
  topRight: {
      alignItems: "center",
      flexDirection: "row",
      gap: 6,
      justifyContent: "flex-end"
    }
} as const;
