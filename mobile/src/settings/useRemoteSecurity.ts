import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import type { WorkspaceModel } from '../ui/types';
import type { RemotePasskey, RemoteSession, SecurityEvent } from '../remote/dashboardApi';
import type { RemoteDevice } from '../remote/securityTypes';
import type { CloudComputer } from '../remote/remoteApi';
interface Dashboard { devices: RemoteDevice[]; sessions: RemoteSession[]; events: SecurityEvent[]; passkeys: RemotePasskey[]; computers: CloudComputer[] }
export const liveRemoteSession = (session: RemoteSession) => !['ENDED', 'DENIED', 'REVOKED', 'EXPIRED'].includes(session.status);
export function useRemoteSecurity(workspace: WorkspaceModel) {
  const api = workspace.remoteAccess;
  const account = workspace.account?.email ?? null;
  const owner = api?.identity();
  const generation = useRef(0);
  const [result, setResult] = useState<{ account: string; owner: string; data: Dashboard }>();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const reload = useCallback(async () => {
    if (!api || !account || !owner) return;
    const current = generation.current;
    try {
      const [devices, sessions, events, passkeys, computers] = await Promise.all([api.devices(), api.sessions(), api.events(), api.passkeys(), workspace.actions.listComputers?.()]);
      if (current === generation.current && api.identity() === owner) {
        setResult({ account, owner, data: { devices, sessions, events, passkeys, computers: computers?.computers ?? [] } });
        setError(null);
      }
    } catch (failure) {
      if (current === generation.current && api.identity() === owner) setError(failure instanceof Error ? failure.message : 'Remote security could not load.');
    }
  }, [api, account, owner, workspace.actions]);
  useEffect(() => {
    const current = ++generation.current;
    setError(null); setBusy(null);
    void reload();
    const interval = setInterval(() => { if (AppState.currentState === 'active') void reload(); }, 15000);
    return () => { generation.current = current + 1; clearInterval(interval); };
  }, [reload]);
  const act = async (name: string, work: () => Promise<void>) => {
    if (!api || api.identity() !== owner) return;
    const current = generation.current;
    setBusy(name); setError(null);
    try { await work(); if (current === generation.current && api.identity() === owner) await reload(); }
    catch (failure) { if (current === generation.current && api.identity() === owner) setError(failure instanceof Error ? failure.message : 'That action could not be completed.'); }
    finally { if (current === generation.current && api.identity() === owner) setBusy(null); }
  };
  return { api, data: result?.account === account && result.owner === owner ? result.data : undefined, error, busy, reload, act };
}
