export type ThemeColors = {
  background: string;
  rail: string;
  surface: string;
  elevated: string;
  workspace: string;
  surfaceTint: string;
  border: string;
  borderStrong: string;
  line: string;
  text: string;
  muted: string;
  dim: string;
  accent: string;
  accentHover: string;
  accentSoft: string;
  action: string;
  actionPressed: string;
  onAction: string;
  neutralPressed: string;
  neutralSelected: string;
  disabled: string;
  disabledSurface: string;
  magenta: string;
  magentaSoft: string;
  amber: string;
  amberSoft: string;
  success: string;
  successSoft: string;
  warning: string;
  warningSoft: string;
  error: string;
  errorSoft: string;
  info: string;
  infoSoft: string;
  scrim: string;
  shadow: string;
};

export const darkColors: ThemeColors = {
  background: "#0E0F12", rail: "#13151A", surface: "#181A20", elevated: "#20232A",
  workspace: "#101115", surfaceTint: "#1B1E25", border: "#2B2F38", borderStrong: "#5B7CFA",
  line: "rgba(166, 173, 186, 0.18)", text: "#F5F7FA", muted: "#A6ADBA", dim: "#747C8A",
  accent: "#5B7CFA", accentHover: "#7490FF", accentSoft: "rgba(91, 124, 250, 0.14)",
  action: "#4667E8", actionPressed: "#3D5ACF", onAction: "#FFFFFF",
  neutralPressed: "rgba(245, 247, 250, 0.07)", neutralSelected: "rgba(245, 247, 250, 0.09)",
  disabled: "#747C8A", disabledSurface: "rgba(116, 124, 138, 0.12)",
  magenta: "#5B7CFA", magentaSoft: "rgba(91, 124, 250, 0.14)",
  amber: "#E8A94B", amberSoft: "rgba(232, 169, 75, 0.16)",
  success: "#37C78A", successSoft: "rgba(55, 199, 138, 0.14)",
  warning: "#E8A94B", warningSoft: "rgba(232, 169, 75, 0.16)",
  error: "#F06472", errorSoft: "rgba(240, 100, 114, 0.15)",
  info: "#5B7CFA", infoSoft: "rgba(91, 124, 250, 0.14)",
  scrim: "rgba(0, 0, 0, 0.62)", shadow: "#000000"
};

export const lightColors: ThemeColors = {
  background: "#F4F5F7", rail: "#FAFAFB", surface: "#FFFFFF", elevated: "#F0F2F5",
  workspace: "#FBFBFC", surfaceTint: "#F3F5FA", border: "#D9DDE4", borderStrong: "#315BD8",
  line: "rgba(98, 106, 120, 0.18)", text: "#171A21", muted: "#626A78", dim: "#7A8290",
  accent: "#315BD8", accentHover: "#2449B8", accentSoft: "rgba(49, 91, 216, 0.09)",
  action: "#315BD8", actionPressed: "#2449B8", onAction: "#FFFFFF",
  neutralPressed: "rgba(23, 26, 33, 0.05)", neutralSelected: "rgba(23, 26, 33, 0.07)",
  disabled: "#7A8290", disabledSurface: "rgba(122, 130, 144, 0.1)",
  magenta: "#315BD8", magentaSoft: "rgba(49, 91, 216, 0.09)",
  amber: "#A96812", amberSoft: "rgba(169, 104, 18, 0.12)",
  success: "#147A57", successSoft: "rgba(20, 122, 87, 0.1)",
  warning: "#A96812", warningSoft: "rgba(169, 104, 18, 0.12)",
  error: "#C9364B", errorSoft: "rgba(201, 54, 75, 0.1)",
  info: "#315BD8", infoSoft: "rgba(49, 91, 216, 0.09)",
  scrim: "rgba(23, 26, 33, 0.38)", shadow: "rgba(23, 26, 33, 0.14)"
};

export const colors = darkColors;
export const monoFont = { fontFamily: "Menlo" };
