/** The unfinished custom CLI editor is separate from the released Agent Mode. */
export function isWipSettingsSection(section: string): boolean {
  return section === "agents";
}
