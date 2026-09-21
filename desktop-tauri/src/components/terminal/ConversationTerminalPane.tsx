import type { SharedSession } from '../../ipc/sharedChats';
import { useSettingsStore } from '../../state/settingsStore';
import { ConversationChatPane } from './ConversationChatPane';
import { NativeConversationPane } from './NativeConversationPane';
import './conversationCli.css';

export function ConversationTerminalPane(props: {
  session: SharedSession; hidden: boolean; active: boolean; fontSize: number;
}) {
  const view = useSettingsStore(s => s.settings?.agentView ?? 'terminal');
  const nativeAvailable = (props.session.kind ?? 'codex') === 'codex';
  const nativeVisible = nativeAvailable && view === 'terminal';
  // Terminal view means the genuine CLI, which only Codex can attach to a
  // conversation. Any other session is a chat, whichever view is chosen, and
  // Claude/Gemini launches in Terminal view never arrive here: they are PTYs.
  return <>
    <ConversationChatPane {...props} hidden={props.hidden || nativeVisible} />
    {nativeAvailable && <NativeConversationPane {...props} hidden={props.hidden || !nativeVisible} />}
  </>;
}
