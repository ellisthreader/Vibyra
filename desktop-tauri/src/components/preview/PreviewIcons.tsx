/* Icons for the preview toolbar. The Terminals/Preview pair that used to
   live here went with the mode bar — the stage layout control draws
   layout rather than a terminal and an eye. */

export function RotateDeviceIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="7" y="3" width="10" height="18" rx="2" />
      <path d="M4 8a8 8 0 0 1 4-5M4 8V4m0 4h4M20 16a8 8 0 0 1-4 5m4-5v4m0-4h-4" />
    </svg>
  );
}

export function RefreshPreviewIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6" />
    </svg>
  );
}
