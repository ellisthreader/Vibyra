import { icon } from "./iconFactory";

export const FolderIcon = icon(
  <path d="M4 5a2 2 0 0 1 2-2h3l2 3h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5z" />,
);

export const FileIcon = icon(
  <>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
    <path d="M14 3v5h5" />
  </>,
);

export const BotIcon = icon(
  <>
    <rect x="5" y="8" width="14" height="11" rx="2" />
    <path d="M12 4v4" />
    <circle cx="12" cy="3" r="1" />
    <path d="M9 13h.01M15 13h.01M9.5 16.5h5" />
  </>,
);

export const GearIcon = icon(
  <>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.55-1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h.01a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55h.01a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.01a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1z" />
  </>,
);

export const PlusIcon = icon(<path d="M12 5v14M5 12h14" />);

export const GitBranchIcon = icon(
  <>
    <circle cx="6" cy="6" r="2.5" />
    <circle cx="6" cy="18" r="2.5" />
    <circle cx="18" cy="8" r="2.5" />
    <path d="M6 8.5v7M18 10.5a7 7 0 0 1-7 5h-2.5" />
  </>,
);

export const GithubIcon = icon(
  <path fill="currentColor" stroke="none" d="M12 .7a11.5 11.5 0 0 0-3.6 22.4c.6.1.8-.3.8-.6v-2.2c-3.3.7-4-1.4-4-1.4-.5-1.4-1.3-1.7-1.3-1.7-1.1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1.1 1.8 2.9 1.3 3.6 1 .1-.8.4-1.3.7-1.6-2.7-.3-5.5-1.3-5.5-5.7 0-1.3.5-2.3 1.2-3.1-.1-.3-.5-1.6.1-3.1 0 0 1-.3 3.2 1.2a11 11 0 0 1 5.8 0C18 5.7 19 6 19 6c.6 1.5.2 2.8.1 3.1.8.8 1.2 1.9 1.2 3.1 0 4.4-2.8 5.4-5.5 5.7.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6A11.5 11.5 0 0 0 12 .7Z" />,
);

export const CloseIcon = icon(<path d="M18 6 6 18M6 6l12 12" />);

export const MoonIcon = icon(<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />);

export const SunIcon = icon(
  <>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4m11.4-11.4 1.4-1.4" />
  </>,
);

export const ExpandIcon = icon(
  <path d="M15 3h6v6M9 21H3v-15M21 3l-7 7M3 21l7-7" />,
);

export const RestartIcon = icon(
  <>
    <path d="M3 12a9 9 0 1 0 3-6.7" />
    <path d="M3 4v5h5" />
  </>,
);

export const ChevronIcon = icon(<path d="M9 6l6 6-6 6" />);

export const ChevronDownIcon = icon(<path d="M6 9l6 6 6-6" />);

export const SearchIcon = icon(
  <>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </>,
);

export const SparklesIcon = icon(
  <>
    <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3L12 3z" />
    <path d="M19 3v4M21 5h-4" />
  </>,
);

export const MemoryIcon = icon(
  <>
    <path d="M5 4.5A2.5 2.5 0 0 1 7.5 2H19v18H7.5A2.5 2.5 0 0 1 5 17.5z" />
    <path d="M5 17.5A2.5 2.5 0 0 1 7.5 15H19M9 6h6M9 10h5" />
  </>,
);

export const SendIcon = icon(
  <>
    <path d="m4 12 16-8-6.5 16-2.2-6.1z" />
    <path d="m11.3 13.9 4.2-4.2" />
  </>,
);

export const CheckIcon = icon(<path d="m5 12 4 4L19 6" />);

export const MoreIcon = icon(
  <>
    <circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
    <circle cx="19" cy="12" r="1" fill="currentColor" stroke="none" />
  </>,
);

export const CommandIcon = icon(
  <path d="M15 6v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3" />,
);

export const LinkIcon = icon(
  <>
    <path d="M10 13a5 5 0 0 0 7.54.54l2-2a5 5 0 0 0-7.07-7.07l-1.15 1.15" />
    <path d="M14 11a5 5 0 0 0-7.54-.54l-2 2a5 5 0 0 0 7.07 7.07l1.15-1.15" />
  </>,
);

export const EyeIcon = icon(
  <>
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <circle cx="12" cy="12" r="3" />
  </>,
);

export const PencilIcon = icon(
  <>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4z" />
  </>,
);

export const GaugeIcon = icon(
  <>
    <path d="m12 15 3.5-3.5" />
    <path d="M20.3 18a9 9 0 1 0-16.6 0" />
  </>,
);

export const UserIcon = icon(
  <>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 20c0-3.3 3.6-5 8-5s8 1.7 8 5" />
  </>,
);
