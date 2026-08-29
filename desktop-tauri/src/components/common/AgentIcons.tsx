// Glyphs Agent Mode needs that the original sheet does not carry. Same 24-unit
// grid and 2px stroke as `Icons.tsx` — they share the factory precisely so a
// second sheet cannot drift into a different weight.
import { icon } from "./iconFactory";

export { BotIcon } from "./Icons";

export const TerminalIcon = icon(
  <>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M7 9l3 3-3 3M13 15h4" />
  </>,
);

export const ChatIcon = icon(
  <path d="M21 12a8 8 0 0 1-8 8H7l-4 3v-6a8 8 0 0 1 8-8h2a8 8 0 0 1 8 3z" />,
);

export const ClockIcon = icon(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </>,
);

export const ShieldIcon = icon(
  <path d="M12 3l7 3v6c0 4-3 7.5-7 9-4-1.5-7-5-7-9V6z" />,
);

export const BookIcon = icon(
  <>
    <path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z" />
    <path d="M4 17a2 2 0 0 1 2-2h13" />
  </>,
);

export const StopIcon = icon(<rect x="7" y="7" width="10" height="10" rx="2" />);

export const PinIcon = icon(
  <>
    <path d="M15 3l6 6-3 1-4 4-1 5-6-6-5-1 4-4 1-3z" />
    <path d="M8 16l-4 5" />
  </>,
);

export const TrashIcon = icon(
  <>
    <path d="M4 7h16M10 11v6M14 11v6" />
    <path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
  </>,
);
