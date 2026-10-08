import { useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useAccountStore } from '../state/accountStore';
import { runNotificationAction } from './notificationActions';
import { startNativeNotificationResponses, type NativeActivation } from './nativeNotificationResponses';
import { isMac } from './platform';

export function useNativeNotificationResponses() {
  const identity = useAccountStore(state => state.snapshot.profile?.email ?? null);
  useEffect(() => {
    if (!isMac || !identity) return;
    let stopped = false, stop: (() => void) | undefined;
    void startNativeNotificationResponses({
      listen: wake => listen('notification:activation', wake),
      drain: () => invoke<NativeActivation[]>('native_notification_activations'),
      account: () => stopped ? null : useAccountStore.getState().snapshot.profile?.email ?? null,
      open: item => runNotificationAction(item.digestId ? {id:'openAgentDigest',label:'Open daily summary',arg:item.digestId,account:item.account} : { id: 'openTeammate', label: 'Open conversation',
        arg: item.agentId, runId: item.runId, account: item.account }),
    }).then(remove => { if (stopped) remove(); else stop = remove; }).catch(() => {});
    return () => { stopped = true; stop?.(); };
  }, [identity]);
}
