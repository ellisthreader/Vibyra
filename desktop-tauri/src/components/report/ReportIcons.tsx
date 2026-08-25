import { icon } from "../common/iconFactory";

// Report-only glyphs, on the same 24-unit grid as `Icons.tsx` but kept beside
// the feature so the shared sheet stays under the line limit.

export const CameraIcon = icon(
  <>
    <path d="M4 8h3l1.5-2h7L17 8h3v11H4z" />
    <circle cx="12" cy="13" r="3.2" />
  </>,
);

export const TerminalIcon = icon(
  <>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="m7 9 3 3-3 3M13 15h4" />
  </>,
);

export const TrashIcon = icon(<path d="M4 7h16M9 7V5h6v2m-8 0 1 13h8l1-13" />);

export const ImageIcon = icon(
  <>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <circle cx="8.5" cy="10" r="1.5" />
    <path d="m4 17 5-4.5 4 3.5 3-2.5 4 3.5" />
  </>,
);

export const PaperclipIcon = icon(
  <path d="M20 11.5 12.2 19a4.6 4.6 0 0 1-6.5-6.5l7.8-7.6a3 3 0 1 1 4.3 4.3l-7.7 7.6a1.5 1.5 0 0 1-2.1-2.1l7-6.9" />,
);
