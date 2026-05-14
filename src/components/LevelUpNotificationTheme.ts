export const levelUpNotificationPalettes = {
  dark: {
    body: "#D8D7E8",
    cardBorder: "rgba(255,255,255,0.18)",
    cardGradient: ["#241547", "#0F1629", "#172417"] as const,
    flash: "#DDBBFF",
    icon: "#11131A",
    iconGradient: ["#FFE082", "#FF8D72", "#A368FF"] as const,
    iconPulse: "rgba(255,224,130,0.5)",
    kicker: "#FFE082",
    shadow: "#000000",
    shimmer: "rgba(255,255,255,0.16)",
    spark: "#FFE082",
    title: "#FFFFFF"
  },
  light: {
    body: "#5F6473",
    cardBorder: "rgba(109, 59, 255, 0.16)",
    cardGradient: ["#FFFFFF", "#F7F3FF", "#EEFDF5"] as const,
    flash: "#6D3BFF",
    icon: "#FFFFFF",
    iconGradient: ["#7C3AED", "#6D3BFF", "#12805C"] as const,
    iconPulse: "rgba(109, 59, 255, 0.16)",
    kicker: "#6D3BFF",
    shadow: "rgba(28, 31, 42, 0.14)",
    shimmer: "rgba(109, 59, 255, 0.08)",
    spark: "#6D3BFF",
    title: "#12131A"
  }
} as const;
