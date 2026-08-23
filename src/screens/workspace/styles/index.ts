import { createThemedStyleSheet, setThemeTransformScheme } from "./themeTransform";
import { workspaceStyleSources } from "./workspaceStyleSources";

const rawDark = Object.assign(
  {},
  ...workspaceStyleSources.map(({ styles: sourceStyles }) => sourceStyles)
) as Record<string, Record<string, unknown>>;

export function setStylesScheme(scheme: "dark" | "light") {
  setThemeTransformScheme(scheme);
}

export const styles: any = createThemedStyleSheet(rawDark);
