import { byteLength, type Snapshot } from '../state/output';
import type { Session } from '../ui/types';
import type { DemoMessage } from './data';

/**
 * What a sample terminal's preview shows: exactly what opening it shows. A
 * shell is its own sample lines; an agent opens as its conversation, so its
 * preview is that conversation printed the way its CLI would print it.
 */
export function samplePeek(session: Session | undefined, output: string, messages: DemoMessage[]): Snapshot {
  const text = !session || session.kind === 'shell' ? output : messages.map(message => message.role === 'user'
    ? `[90m›[0m ${message.text}` : `[1m⏺[0m ${message.text}`).join('\r\n\r\n');
  return { sessionId: session?.id ?? '', output: text, offset: byteLength(text), generation: 'sample',
    status: session?.status ?? 'exited', cols: 50, rows: 12 };
}
