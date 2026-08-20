import type { ITheme } from "@xterm/xterm";

// Exact 16-colour ANSI palettes ported from the old app's
// app.theme-terminals-states.css, on the deep terminal well.

const dark: ITheme = {
  background: "#0b0c10",
  foreground: "#eeeaf8",
  cursor: "#a9a3b8",
  cursorAccent: "#0b0c10",
  selectionBackground: "rgba(91, 124, 250, 0.22)",
  selectionInactiveBackground: "rgba(91, 124, 250, 0.14)",
  black: "#24242d",
  red: "#ff6b81",
  green: "#55d98b",
  yellow: "#e7c65f",
  blue: "#6aa8ff",
  magenta: "#bd8cff",
  cyan: "#69d6c7",
  white: "#ddd8e8",
  brightBlack: "#7a7a8c",
  brightRed: "#ff9aad",
  brightGreen: "#86e7aa",
  brightYellow: "#f3db83",
  brightBlue: "#9bc2ff",
  brightMagenta: "#d5b4ff",
  brightCyan: "#9be7dc",
  brightWhite: "#ffffff",
};

const light: ITheme = {
  background: "#fdfdfe",
  foreground: "#1f2027",
  cursor: "rgba(49, 91, 216, 0.75)",
  cursorAccent: "#fdfdfe",
  selectionBackground: "rgba(49, 91, 216, 0.2)",
  selectionInactiveBackground: "rgba(49, 91, 216, 0.12)",
  black: "#222631",
  red: "#b42350",
  green: "#167a4b",
  yellow: "#8a6500",
  blue: "#245fbd",
  magenta: "#7a3eb1",
  cyan: "#16766d",
  white: "#5c6474",
  brightBlack: "#687183",
  brightRed: "#d53b60",
  brightGreen: "#208d59",
  brightYellow: "#9b7300",
  brightBlue: "#326fce",
  brightMagenta: "#8e4bc4",
  brightCyan: "#21877d",
  brightWhite: "#171923",
};

export function resolveTheme(theme: string): "dark" | "light" {
  if (theme === "light") return "light";
  if (theme === "dark") return "dark";
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

export function themeFor(theme: string): ITheme {
  return resolveTheme(theme) === "light" ? light : dark;
}
