import { useMemo } from "react";
import { usePreferences } from "../../../context/PreferencesContext";

const darkChatActionCardPalette = {
  body: "#AFA9C2",
  buttonGhostBg: "rgba(255,255,255,0.045)",
  buttonGhostBorder: "rgba(255,255,255,0.14)",
  buttonGhostText: "#D5D0E6",
  buttonPrimary: "#8E3CFF",
  buttonQuietBg: "rgba(255,255,255,0.06)",
  buttonQuietText: "#A29CB8",
  cardBg: "rgba(15, 17, 26, 0.94)",
  cardBorder: "rgba(176, 132, 255, 0.3)",
  chipBg: "rgba(255,255,255,0.06)",
  chipBorder: "rgba(255,255,255,0.08)",
  errorBg: "rgba(255, 209, 102, 0.09)",
  errorBorder: "rgba(255, 209, 102, 0.22)",
  errorText: "#FFE1A3",
  flowLine: "rgba(176,132,255,0.28)",
  iconBg: "rgba(176, 132, 255, 0.18)",
  iconColor: "#B084FF",
  iconGradient: ["#B084FF", "#8E3CFF", "#5D24D8"] as const,
  kicker: "#D7C4FF",
  kickerBg: "rgba(142, 60, 255, 0.18)",
  kickerBorder: "rgba(176, 132, 255, 0.24)",
  muted: "#8F8A9E",
  panelBg: "rgba(255,255,255,0.035)",
  panelBorder: "rgba(176,132,255,0.12)",
  primaryText: "#FFFFFF",
  ringBg: "rgba(142,60,255,0.24)",
  ringBorder: "rgba(215,196,255,0.34)",
  stepActiveBg: "rgba(142,60,255,0.72)",
  stepActiveBorder: "rgba(215,196,255,0.42)",
  stepBorder: "rgba(176,132,255,0.2)",
  sweep: "rgba(215,196,255,0.12)",
  text: "#FFFFFF"
};

const lightChatActionCardPalette = {
  body: "#5F6473",
  buttonGhostBg: "#FFFFFF",
  buttonGhostBorder: "rgba(109, 59, 255, 0.18)",
  buttonGhostText: "#433C56",
  buttonPrimary: "#6D3BFF",
  buttonQuietBg: "rgba(109, 59, 255, 0.08)",
  buttonQuietText: "#5F6473",
  cardBg: "#FFFFFF",
  cardBorder: "rgba(109, 59, 255, 0.16)",
  chipBg: "rgba(109, 59, 255, 0.08)",
  chipBorder: "rgba(109, 59, 255, 0.14)",
  errorBg: "rgba(183, 121, 31, 0.1)",
  errorBorder: "rgba(183, 121, 31, 0.18)",
  errorText: "#8A5A18",
  flowLine: "rgba(109, 59, 255, 0.22)",
  iconBg: "rgba(109, 59, 255, 0.1)",
  iconColor: "#6D3BFF",
  iconGradient: ["#8B5CF6", "#6D3BFF", "#4F46E5"] as const,
  kicker: "#5B2BE8",
  kickerBg: "rgba(109, 59, 255, 0.08)",
  kickerBorder: "rgba(109, 59, 255, 0.14)",
  muted: "#8A90A0",
  panelBg: "#F7F3FF",
  panelBorder: "rgba(109, 59, 255, 0.12)",
  primaryText: "#FFFFFF",
  ringBg: "rgba(109, 59, 255, 0.14)",
  ringBorder: "rgba(109, 59, 255, 0.2)",
  stepActiveBg: "#6D3BFF",
  stepActiveBorder: "rgba(109, 59, 255, 0.24)",
  stepBorder: "rgba(109, 59, 255, 0.16)",
  sweep: "rgba(109, 59, 255, 0.08)",
  text: "#12131A"
};

export function useChatActionCardPalette() {
  const { effectiveScheme } = usePreferences();
  return useMemo(
    () => effectiveScheme === "light" ? lightChatActionCardPalette : darkChatActionCardPalette,
    [effectiveScheme]
  );
}
