export const styleSource = {
  chatMessageAttachmentRow: {
      marginBottom: 8,
      marginTop: 3,
      maxWidth: 286
    },
  chatMessageAttachmentRowContent: {
      alignItems: "center",
      flexDirection: "row",
      gap: 10,
      paddingRight: 8,
      paddingVertical: 4
    },
  chatMessageFileAttachmentCard: {
      alignItems: "center",
      backgroundColor: "rgba(255, 255, 255, 0.075)",
      borderColor: "rgba(196, 181, 253, 0.22)",
      borderRadius: 12,
      borderWidth: 1,
      flexDirection: "row",
      gap: 10,
      minHeight: 54,
      paddingHorizontal: 10,
      paddingVertical: 9,
      width: 230
    },
  chatMessageFileAttachmentIcon: {
      alignItems: "center",
      backgroundColor: "rgba(91, 124, 250, 0.2)",
      borderColor: "rgba(216, 202, 255, 0.2)",
      borderRadius: 10,
      borderWidth: 1,
      height: 38,
      justifyContent: "center",
      width: 38
    },
  chatMessageImageAttachmentPreview: {
      backgroundColor: "#181A20",
      borderColor: "rgba(255, 255, 255, 0.14)",
      borderRadius: 12,
      borderWidth: 1,
      height: 126,
      overflow: "hidden",
      width: 168
    },
  chatMessageImageAttachmentThumb: {
      height: "100%",
      width: "100%"
    }
} as const;
