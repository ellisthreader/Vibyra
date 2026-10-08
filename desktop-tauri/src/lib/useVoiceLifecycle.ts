import { useEffect } from 'react';
import { useTalkStore } from '../state/talkStore';
import { useVoiceStore } from '../state/voiceStore';

/** The account workspace owns audio, not the transcript/orb presentation. */
export function useVoiceLifecycle(accountScope: string | undefined) {
  useEffect(() => () => {
    useTalkStore.getState().end();
    useVoiceStore.getState().cancel();
  }, [accountScope]);
}
