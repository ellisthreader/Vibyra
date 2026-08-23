export const styleSource = {
  chatTopBar: {
      backgroundColor: "#0E0F12",
      borderBottomColor: "rgba(255, 255, 255, 0.04)",
      borderBottomWidth: 1,
      gap: 8,
      justifyContent: "space-between",
      minHeight: 58,
      paddingHorizontal: 12
    },
  chatTopDirectory: {
      color: "#747C8A",
      fontSize: 10.5,
      fontWeight: "700",
      lineHeight: 14,
      marginTop: 0,
      minWidth: 0,
      textAlign: "center"
    },
  chatTopIconButton: {
      alignItems: "center",
      backgroundColor: "transparent",
      borderColor: "transparent",
      borderRadius: 999,
      borderWidth: 0,
      height: 40,
      justifyContent: "center",
      width: 40
    },
  chatTopTitle: {
      color: "#F5F7FA",
      fontSize: 16,
      fontWeight: "800",
      letterSpacing: 0,
      lineHeight: 20,
      minWidth: 0,
      textAlign: "center"
    },
  chatTopTitleWrap: {
      alignItems: "center",
      bottom: 0,
      justifyContent: "center",
      left: 64,
      paddingHorizontal: 12,
      position: "absolute",
      right: 64,
      top: 0
    },
  pageTopTitle: {
      color: "#F5F7FA",
      fontSize: 20,
      fontWeight: "900",
      letterSpacing: 0,
      lineHeight: 24
    }
} as const;
