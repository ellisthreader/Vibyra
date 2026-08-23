export const levelUpNotificationPalettes = {
  dark: {
    body: "#D8D7E8",
    cardBorder: "rgba(255,255,255,0.18)",
    cardGradient: ["#241547", "#0F1629", "#172417"] as const,
    flash: "#DDBBFF",
    icon: "#11131A",
    iconGradient: ["#FFE082", "#FF8D72", "#5B7CFA"] as const,
    iconPulse: "rgba(255,224,130,0.5)",
    kicker: "#FFE082",
    shadow: "#000000",
    shimmer: "rgba(255,255,255,0.16)",
    spark: "#FFE082",
    title: "#FFFFFF"
  },
  light: {
    body: "#5F6473",
    cardBorder: "rgba(49, 91, 216, 0.16)",
    cardGradient: ["#FFFFFF", "#F3F5FA", "#EEFDF5"] as const,
    flash: "#315BD8",
    icon: "#FFFFFF",
    iconGradient: ["#315BD8", "#5B7CFA", "#12805C"] as const,
    iconPulse: "rgba(49, 91, 216, 0.16)",
    kicker: "#315BD8",
    shadow: "rgba(28, 31, 42, 0.14)",
    shimmer: "rgba(49, 91, 216, 0.08)",
    spark: "#315BD8",
    title: "#171A21"
  }
} as const;
