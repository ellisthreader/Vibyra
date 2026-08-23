import { useMemo } from "react";
import { usePreferences } from "../../../context/PreferencesContext";

const darkChatActionCardPalette = {
  body: "#AFA9C2",
  buttonGhostBg: "rgba(255,255,255,0.045)",
  buttonGhostBorder: "rgba(255,255,255,0.14)",
  buttonGhostText: "#A6ADBA",
  buttonPrimary: "#4667E8",
  buttonQuietBg: "rgba(255,255,255,0.06)",
  buttonQuietText: "#A6ADBA",
  cardBg: "rgba(15, 17, 26, 0.94)",
  cardBorder: "rgba(116, 144, 255, 0.3)",
  chipBg: "rgba(255,255,255,0.06)",
  chipBorder: "rgba(255,255,255,0.08)",
  errorBg: "rgba(255, 209, 102, 0.09)",
  errorBorder: "rgba(255, 209, 102, 0.22)",
  errorText: "#FFE1A3",
  flowLine: "rgba(116,144,255,0.28)",
  iconBg: "rgba(116, 144, 255, 0.18)",
  iconColor: "#7490FF",
  iconGradient: ["#7490FF", "#4667E8", "#3D5ACF"] as const,
  kicker: "#91A7FF",
  kickerBg: "rgba(91, 124, 250, 0.18)",
  kickerBorder: "rgba(116, 144, 255, 0.24)",
  muted: "#747C8A",
  panelBg: "rgba(255,255,255,0.035)",
  panelBorder: "rgba(116,144,255,0.12)",
  primaryText: "#FFFFFF",
  ringBg: "rgba(91,124,250,0.24)",
  ringBorder: "rgba(215,196,255,0.34)",
  stepActiveBg: "rgba(91,124,250,0.72)",
  stepActiveBorder: "rgba(215,196,255,0.42)",
  stepBorder: "rgba(116,144,255,0.2)",
  sweep: "rgba(215,196,255,0.12)",
  text: "#FFFFFF"
};

const lightChatActionCardPalette = {
  body: "#5F6473",
  buttonGhostBg: "#FFFFFF",
  buttonGhostBorder: "rgba(61, 90, 207, 0.18)",
  buttonGhostText: "#747C8A",
  buttonPrimary: "#3D5ACF",
  buttonQuietBg: "rgba(61, 90, 207, 0.08)",
  buttonQuietText: "#5F6473",
  cardBg: "#FFFFFF",
  cardBorder: "rgba(61, 90, 207, 0.16)",
  chipBg: "rgba(61, 90, 207, 0.08)",
  chipBorder: "rgba(61, 90, 207, 0.14)",
  errorBg: "rgba(183, 121, 31, 0.1)",
  errorBorder: "rgba(183, 121, 31, 0.18)",
  errorText: "#8A5A18",
  flowLine: "rgba(61, 90, 207, 0.22)",
  iconBg: "rgba(61, 90, 207, 0.1)",
  iconColor: "#3D5ACF",
  iconGradient: ["#5B7CFA", "#3D5ACF", "#4F46E5"] as const,
  kicker: "#315BD8",
  kickerBg: "rgba(61, 90, 207, 0.08)",
  kickerBorder: "rgba(61, 90, 207, 0.14)",
  muted: "#8A90A0",
  panelBg: "#F5F7FA",
  panelBorder: "rgba(61, 90, 207, 0.12)",
  primaryText: "#FFFFFF",
  ringBg: "rgba(61, 90, 207, 0.14)",
  ringBorder: "rgba(61, 90, 207, 0.2)",
  stepActiveBg: "#3D5ACF",
  stepActiveBorder: "rgba(61, 90, 207, 0.24)",
  stepBorder: "rgba(61, 90, 207, 0.16)",
  sweep: "rgba(61, 90, 207, 0.08)",
  text: "#12131A"
};

export function useChatActionCardPalette() {
  const { effectiveScheme } = usePreferences();
  return useMemo(
    () => effectiveScheme === "light" ? lightChatActionCardPalette : darkChatActionCardPalette,
    [effectiveScheme]
  );
}
