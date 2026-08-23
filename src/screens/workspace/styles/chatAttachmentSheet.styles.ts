export const styleSource = {
  chatAttachmentClose: {
      alignItems: "center",
      backgroundColor: "rgba(255, 255, 255, 0.06)",
      borderColor: "rgba(255, 255, 255, 0.09)",
      borderRadius: 12,
      borderWidth: 1,
      height: 36,
      justifyContent: "center",
      width: 36
    },
  chatAttachmentHandle: {
      alignSelf: "center",
      backgroundColor: "rgba(255, 255, 255, 0.82)",
      borderRadius: 999,
      height: 4,
      marginBottom: 12,
      width: 44
    },
  chatAttachmentHeader: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "flex-end",
      marginBottom: 12
    },
  chatAttachmentOverlay: {
      flex: 1,
      justifyContent: "flex-end"
    },
  chatAttachmentPressed: {
      opacity: 0.72
    },
  chatAttachmentPrimaryAction: {
      alignItems: "center",
      backgroundColor: "rgba(255, 255, 255, 0.07)",
      borderColor: "rgba(255, 255, 255, 0.1)",
      borderRadius: 18,
      borderWidth: 1,
      flex: 1,
      gap: 8,
      justifyContent: "center",
      minHeight: 88,
      minWidth: 0,
      paddingHorizontal: 12,
      paddingVertical: 12
    },
  chatAttachmentPrimaryIcon: {
      alignItems: "center",
      height: 32,
      justifyContent: "center",
      width: 32
    },
  chatAttachmentPrimaryLabel: {
      color: "#A6ADBA",
      fontSize: 13,
      fontWeight: "800",
      lineHeight: 17,
      textAlign: "center"
    },
  chatAttachmentPrimaryRow: {
      borderBottomColor: "rgba(255, 255, 255, 0.08)",
      borderBottomWidth: 1,
      flexDirection: "row",
      gap: 10,
      paddingBottom: 18
    },
  chatAttachmentScrim: {
      backgroundColor: "rgba(0, 0, 0, 0.5)",
      bottom: 0,
      left: 0,
      position: "absolute",
      right: 0,
      top: 0
    },
  chatAttachmentSheet: {
      backgroundColor: "#0E0F12",
      borderColor: "transparent",
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      borderWidth: 1,
      paddingHorizontal: 18,
      paddingTop: 10,
      shadowColor: "#000000",
      shadowOffset: { width: 0, height: -12 },
      shadowOpacity: 0.32,
      shadowRadius: 26
    },
  chatAttachmentTitle: {
      color: "#FFFFFF",
      fontSize: 18,
      fontWeight: "900",
      lineHeight: 22
    },
  chatAttachmentToolCopy: {
      flex: 1,
      minWidth: 0
    },
  chatAttachmentToolDescription: {
      color: "#747C8A",
      fontSize: 12.5,
      fontWeight: "700",
      lineHeight: 16
    },
  chatAttachmentToolIcon: {
      alignItems: "center",
      height: 34,
      justifyContent: "center",
      width: 28
    },
  chatAttachmentToolLabel: {
      color: "#F5F7FA",
      fontSize: 15.5,
      fontWeight: "900",
      lineHeight: 20
    },
  chatAttachmentToolList: {
      gap: 6,
      paddingBottom: 18,
      paddingTop: 12
    },
  chatAttachmentToolRow: {
      alignItems: "center",
      borderRadius: 14,
      flexDirection: "row",
      gap: 9,
      minHeight: 62,
      paddingHorizontal: 2
    }
} as const;
