// Glyphs for the chat transcript, drawn with the shared Vibyra icon factory so
// they match every other icon in the app (24-unit grid, 2px round strokes).
import { icon } from '../common/iconFactory';
import type { StepKind } from './stepLabels';

export const ChatTerminalIcon = icon(<><path d="m5 8 4 4-4 4" /><path d="M12 17h7" /></>);
export const ChatFileIcon = icon(<><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M9 13h6M9 17h4" /></>);
export const ChatSearchIcon = icon(<><circle cx="11" cy="11" r="6" /><path d="m20 20-4.2-4.2" /></>);
const ChatFolderIcon = icon(<path d="M4 6a2 2 0 0 1 2-2h3l2 2h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />);
const ChatPencilIcon = icon(<><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z" /><path d="m13.5 6.5 4 4" /></>);
const ChatGlobeIcon = icon(<><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></>);
export const ChatBulbIcon = icon(<><path d="M9 18h6M10 21h4" /><path d="M12 3a6 6 0 0 0-3.6 10.8c.6.5 1.1 1.3 1.1 2.2h5c0-.9.5-1.7 1.1-2.2A6 6 0 0 0 12 3z" /></>);
export const ChatListIcon = icon(<path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01" />);
const ChatToolIcon = icon(<path d="M14.7 6.3a4 4 0 0 0-5.4 5.2L4 16.8V20h3.2l5.3-5.3a4 4 0 0 0 5.2-5.4l-2.4 2.4-2.6-.6-.6-2.6z" />);
export const ChatDoneIcon = icon(<><circle cx="12" cy="12" r="9" /><path d="m8.5 12 2.5 2.5 4.5-5" /></>);
export const ChatStopIcon = icon(<><circle cx="12" cy="12" r="9" /><rect x="9" y="9" width="6" height="6" rx="1" /></>);
export const ChatAlertIcon = icon(<><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5M12 16h.01" /></>);
export const ChatDiffIcon = icon(<><circle cx="6" cy="6" r="2.5" /><circle cx="18" cy="18" r="2.5" /><path d="M6 8.5V14a4 4 0 0 0 4 4h5.5M18 15.5V10a4 4 0 0 0-4-4H8.5" /></>);
export const ChatArrowDownIcon = icon(<path d="M12 5v14M6 13l6 6 6-6" />);
export const ChatArrowUpIcon = icon(<path d="M12 19V5M6 11l6-6 6 6" />);
export const ChatCopyIcon = icon(<><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></>);
export const ChatSlashIcon = icon(<path d="M15 4 9 20" />);
export const ChatChevronIcon = icon(<path d="m9 6 6 6-6 6" />);

export const STEP_ICONS: Record<StepKind, ReturnType<typeof icon>> = {
  command: ChatTerminalIcon, read: ChatFileIcon, search: ChatSearchIcon, list: ChatFolderIcon,
  edit: ChatPencilIcon, web: ChatGlobeIcon, think: ChatBulbIcon, plan: ChatListIcon, tool: ChatToolIcon,
};

export const ChatPulseIcon = icon(<path d="M3 12h4l2.5-6 5 12L17 12h4" />);
export const ChatCubeIcon = icon(<><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9z" /><path d="m4 7.5 8 4.5 8-4.5M12 12v9" /></>);
export const ChatPlusIcon = icon(<path d="M12 5v14M5 12h14" />);
export const ChatEyeIcon = icon(<><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>);
export const ChatLayersIcon = icon(<><path d="m12 3 9 5-9 5-9-5z" /><path d="m3 13 9 5 9-5" /></>);
export const ChatInfoIcon = icon(<><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></>);
export const ChatGaugeIcon = icon(<><path d="M4 18a8 8 0 1 1 16 0" /><path d="m12 18 4-6" /></>);
export const ChatShieldIcon = icon(<path d="M12 3 5 6v6c0 4.4 3 7.6 7 9 4-1.4 7-4.6 7-9V6z" />);
export const ChatHelpIcon = icon(<><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 1 1 3.4 2.3c-.6.3-.9.8-.9 1.4V14M12 17h.01" /></>);
