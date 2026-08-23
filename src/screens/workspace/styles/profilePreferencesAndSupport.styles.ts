export const styleSource = {
  profileToggleRow: {
      alignItems: "center" as const,
      backgroundColor: "rgba(15, 15, 24, 0.92)",
      borderColor: "rgba(91, 124, 250, 0.18)",
      borderRadius: 14,
      borderWidth: 1,
      flexDirection: "row" as const,
      gap: 12,
      paddingHorizontal: 14,
      paddingVertical: 13
    },
  profileToggleIcon: {
      alignItems: "center" as const,
      backgroundColor: "rgba(91, 124, 250, 0.18)",
      borderRadius: 10,
      height: 36,
      justifyContent: "center" as const,
      width: 36
    },
  profileToggleCopy: {
      flex: 1,
      minWidth: 0
    },
  profileToggleTitle: {
      color: "#F5F7FA",
      fontSize: 14,
      fontWeight: "900" as const
    },
  profileToggleSubtitle: {
      color: "#747C8A",
      fontSize: 11,
      fontWeight: "700" as const,
      marginTop: 2
    },
  profileChoiceRow: {
      alignItems: "center" as const,
      backgroundColor: "rgba(15, 15, 24, 0.92)",
      borderColor: "rgba(91, 124, 250, 0.18)",
      borderRadius: 14,
      borderWidth: 1,
      flexDirection: "row" as const,
      gap: 12,
      paddingHorizontal: 14,
      paddingVertical: 13
    },
  profileChoiceRowActive: {
    },
  profileChoiceCopy: {
      flex: 1,
      minWidth: 0
    },
  profileChoiceTitle: {
      color: "#F5F7FA",
      fontSize: 14,
      fontWeight: "900" as const
    },
  profileChoiceSubtitle: {
      color: "#747C8A",
      fontSize: 11,
      fontWeight: "700" as const,
      marginTop: 2
    },
  profileReferralBox: {
      alignItems: "center" as const,
      backgroundColor: "rgba(91, 124, 250, 0.16)",
      borderColor: "rgba(91, 124, 250, 0.46)",
      borderRadius: 16,
      borderStyle: "dashed" as const,
      borderWidth: 1,
      flexDirection: "row" as const,
      gap: 12,
      justifyContent: "space-between" as const,
      paddingHorizontal: 16,
      paddingVertical: 14
    },
  profileReferralCode: {
      color: "#FFFFFF",
      fontSize: 18,
      fontWeight: "900" as const,
      letterSpacing: 2
    },
  profileReferralCopy: {
      color: "#5B7CFA",
      fontSize: 12,
      fontWeight: "900" as const
    },
  profileFaqRow: {
      backgroundColor: "rgba(15, 15, 24, 0.92)",
      borderColor: "rgba(91, 124, 250, 0.18)",
      borderRadius: 14,
      borderWidth: 1,
      paddingHorizontal: 14,
      paddingVertical: 12
    },
  profileFaqQuestion: {
      color: "#F5F7FA",
      fontSize: 13,
      fontWeight: "900" as const
    },
  profileFaqAnswer: {
      color: "#A6ADBA",
      fontSize: 12,
      fontWeight: "600" as const,
      lineHeight: 17,
      marginTop: 6
    }
} as const;
