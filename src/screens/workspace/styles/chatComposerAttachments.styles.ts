export const styleSource = {
  chatImageAttachmentCopy: {
      flex: 1,
      minWidth: 0
    },
  chatImageAttachmentMeta: {
      color: "#747C8A",
      fontSize: 10.5,
      fontWeight: "800",
      lineHeight: 13
    },
  chatImageAttachmentName: {
      color: "#F5F7FA",
      fontSize: 12,
      fontWeight: "900",
      lineHeight: 15
    },
  chatImageAttachmentPill: {
      alignItems: "center",
      backgroundColor: "rgba(255, 255, 255, 0.06)",
      borderColor: "rgba(190, 183, 211, 0.16)",
      borderRadius: 12,
      borderWidth: 1,
      flexDirection: "row",
      gap: 8,
      maxWidth: 220,
      minHeight: 42,
      paddingHorizontal: 7,
      paddingVertical: 6
    },
  chatImageAttachmentPreview: {
      height: 58,
      position: "relative",
      width: 58
    },
  chatImageAttachmentPreviewRemove: {
      alignItems: "center",
      backgroundColor: "rgba(19, 19, 31, 0.88)",
      borderColor: "rgba(255, 255, 255, 0.24)",
      borderRadius: 999,
      borderWidth: 1,
      height: 22,
      justifyContent: "center",
      position: "absolute",
      right: -6,
      top: -6,
      width: 22
    },
  chatImageAttachmentRemove: {
      alignItems: "center",
      height: 24,
      justifyContent: "center",
      width: 24
    },
  chatImageAttachmentRow: {
      marginBottom: 10
    },
  chatImageAttachmentRowContent: {
      alignItems: "center",
      flexDirection: "row",
      gap: 10,
      paddingRight: 8,
      paddingTop: 6
    },
  chatImageAttachmentThumb: {
      backgroundColor: "#181A20",
      borderRadius: 8,
      height: 58,
      width: 58
    },
  chatFileAttachmentThumb: {
      alignItems: "center",
      backgroundColor: "rgba(91, 124, 250, 0.18)",
      borderColor: "rgba(190, 183, 211, 0.16)",
      borderRadius: 8,
      borderWidth: 1,
      height: 30,
      justifyContent: "center",
      width: 30
    }
} as const;
