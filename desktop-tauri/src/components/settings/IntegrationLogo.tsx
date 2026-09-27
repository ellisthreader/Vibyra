/**
 * Brand marks for the Integrations group, drawn inline so they render offline
 * and in both themes. Each sits in a 22px tile the way the nav tiles do.
 */
export function IntegrationLogo({ id, size = 22 }: { id: string; size?: number }) {
  if (id === "github") {
    return (
      <span className="integration-logo integration-logo--github" style={{ width: size, height: size }} aria-hidden="true">
        <svg viewBox="0 0 16 16" width={size - 6} height={size - 6} fill="currentColor">
          <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
        </svg>
      </span>
    );
  }
  if (id === "obsidian") {
    return (
      <span className="integration-logo integration-logo--obsidian" style={{ width: size, height: size }} aria-hidden="true">
        <svg viewBox="0 0 24 24" width={size - 6} height={size - 6}>
          <defs>
            <linearGradient id="vb-obsidian" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#c4b5fd" />
              <stop offset="1" stopColor="#7c3aed" />
            </linearGradient>
          </defs>
          <path d="M9.6 1.5 4.2 6.9 3 13.6l4.1 8.9 6.4-1.2 5.3-6.9 1.9-6.1L15 3.4z" fill="url(#vb-obsidian)" />
          <path d="M9.6 1.5 15 3.4l-3.2 9.1-8.6 1.1L4.2 6.9z" fill="#ede9fe" opacity="0.35" />
          <path d="M11.8 12.5 7.1 22.5l6.4-1.2 5.3-6.9z" fill="#4c1d95" opacity="0.45" />
        </svg>
      </span>
    );
  }
  return (
    <span className="integration-logo" style={{ width: size, height: size, background: "#3f4756" }} aria-hidden="true">
      {id.slice(0, 2).toUpperCase()}
    </span>
  );
}
