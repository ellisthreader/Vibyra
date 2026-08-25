// Status and category glyphs for the notification system. Kept out of
// `Icons.tsx` purely for the line limit — every glyph here is built by the
// same `icon()` factory, so the 24-grid / 2px round-cap style is identical.
import { icon } from "./iconFactory";

export const BellIcon = icon(
  <>
    <path d="M18 9a6 6 0 1 0-12 0c0 4.6-1.8 5.8-2.3 6.2a.6.6 0 0 0 .4 1.1h15.8a.6.6 0 0 0 .4-1.1C19.8 14.8 18 13.6 18 9z" />
    <path d="M13.8 19.4a2 2 0 0 1-3.6 0" />
  </>,
);

export const InfoIcon = icon(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11.2v4.6M12 8.2h.01" />
  </>,
);

export const SuccessIcon = icon(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="m8.4 12.3 2.4 2.4 4.8-5" />
  </>,
);

export const WarnIcon = icon(
  <>
    <path d="M10.3 4.4 2.7 17.5a2 2 0 0 0 1.7 3h15.2a2 2 0 0 0 1.7-3L13.7 4.4a2 2 0 0 0-3.4 0z" />
    <path d="M12 9.6v4M12 16.9h.01" />
  </>,
);

export const DangerIcon = icon(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="m14.8 9.2-5.6 5.6M9.2 9.2l5.6 5.6" />
  </>,
);

/** Performance — a dial, not a lightning bolt: this reports headroom. */
export const GaugeIcon = icon(
  <>
    <path d="M3.6 18a9 9 0 1 1 16.8 0" />
    <path d="m12 14.6 3.8-4.6" />
    <circle cx="12" cy="16" r="1.4" />
  </>,
);

export const CoinIcon = icon(
  <>
    <path d="M12 4.5v15" />
    <path d="M16 8.2A3.4 3.4 0 0 0 12.7 6h-1.9a2.6 2.6 0 0 0 0 5.2h2.7a2.6 2.6 0 0 1 0 5.2h-2.1A3.4 3.4 0 0 1 8 15.7" />
  </>,
);

/** System / the app itself — a window frame. */
export const AppIcon = icon(
  <>
    <rect x="3" y="4.5" width="18" height="15" rx="2" />
    <path d="M3 9.2h18M6.4 6.9h.01M9.2 6.9h.01" />
  </>,
);

export const PlayIcon = icon(<path d="M8 5.5v13l11-6.5-11-6.5z" />);

export const MonitorIcon = icon(
  <>
    <rect x="3" y="4" width="18" height="12" rx="2" />
    <path d="M9 20h6M12 16v4" />
  </>,
);

/** The `ask` tier — a question someone is waiting on, not a warning. */
export const AskIcon = icon(
  <>
    <path d="M12 21a9 9 0 1 0-7.7-4.3L3.4 21l4.4-.9A9 9 0 0 0 12 21z" />
    <path d="M9.6 9.6a2.5 2.5 0 1 1 3.3 2.4c-.6.2-.9.8-.9 1.4v.3M12 16.6h.01" />
  </>,
);

/** The `busy` tier — elapsed time, not a spinner: the card carries the bar. */
export const BusyIcon = icon(
  <>
    <circle cx="12" cy="12" r="8.6" />
    <path d="M12 6.6V12l3.4 2" />
  </>,
);

/** Approval — a grant being asked for. */
export const KeyIcon = icon(
  <>
    <circle cx="8" cy="14" r="4" />
    <path d="m11 11 8-8M17 5l2.5 2.5M14.5 7.5 17 10" />
  </>,
);

export const DownloadIcon = icon(
  <>
    <path d="M12 3.5v11" />
    <path d="m7.6 10.4 4.4 4.4 4.4-4.4" />
    <path d="M4.5 17.5v1a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-1" />
  </>,
);
