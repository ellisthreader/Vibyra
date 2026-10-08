import { icon } from '../common/iconFactory';
import type { AccessLevel } from './useChatAccess';

const AskIcon = icon(<><path d="M12 3 5 6v6c0 4.4 3 7.6 7 9 4-1.4 7-4.6 7-9V6z" /><path d="M12 8.5v4M12 15.5h.01" /></>);
const AutoIcon = icon(<><path d="M12 3 5 6v6c0 4.4 3 7.6 7 9 4-1.4 7-4.6 7-9V6z" /><path d="m9 12 2 2 4-4" /></>);
const FullIcon = icon(<><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 7.5-2" /></>);

export function AccessIcon({ level, size = 14 }: { level: AccessLevel; size?: number }) {
  const Glyph = level === 'full' ? FullIcon : level === 'ask' ? AskIcon : AutoIcon;
  return <Glyph size={size} />;
}
