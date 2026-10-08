import { memo, useEffect, useState } from 'react';
import type { SharedSession } from '../../ipc/sharedChats';
import { useSettingsStore } from '../../state/settingsStore';
import { ConversationChatPane } from './ConversationChatPane';
import { NativeConversationPane } from './NativeConversationPane';
import './conversationCli.css';

/** Memoised like `TerminalPaneCard`: sessions keep their object until they change. */
export const ConversationTerminalPane = memo(function ConversationTerminalPane(props: {
  session: SharedSession; hidden: boolean; active: boolean; fontSize: number;
  /** Shown as one thread of Chat view's full-page chat. */
  threaded?: boolean;
}) {
  const settings = useSettingsStore(s => s.settings);
  const viewRevision = useSettingsStore(s => s.agentViewRevision);
  const view = settings?.agentView ?? 'terminal';
  const [chatPreview, setChatPreview] = useState(false);
  // An explicit Settings action takes precedence even when it reselects Terminal.
  useEffect(() => setChatPreview(false), [view, viewRevision]);
  const nativeAvailable = (props.session.kind ?? 'codex') === 'codex';
  const nativeVisible = nativeAvailable && view === 'terminal' && !chatPreview && !props.threaded;
  // Terminal view means the genuine CLI, which only Codex can attach to a
  // conversation. Any other session is a chat, whichever view is chosen, and
  // Claude/Gemini launches in Terminal view never arrive here: they are PTYs.
  return <>
    <ConversationChatPane {...props} hidden={props.hidden || nativeVisible}
      onReturnTerminal={chatPreview && view === 'terminal' ? () => setChatPreview(false) : undefined} />
    {nativeAvailable && <NativeConversationPane {...props} hidden={props.hidden || !nativeVisible}
      onOpenChat={() => setChatPreview(true)} />}
  </>;
});
