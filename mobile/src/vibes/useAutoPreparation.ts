import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { randomUUID, digestStringAsync, CryptoDigestAlgorithm } from 'expo-crypto';
import { readSecure, writeSecure, deleteSecure } from '../transport/secureStorage';
import type { VibesApi, VibesQuote } from './types';
import { samePreparedExecution } from './autoPreparation';
import { VibesError } from './api';
export function useAutoPreparation(
  api: VibesApi,
  draftIdentity: string,
  active: boolean,
  contextRevision = 0,
  refreshEstimate?: () => void,
) {
  const identity = JSON.stringify([draftIdentity, contextRevision]);
  const [prepared, setPrepared] = useState<{ identity: string; quote: VibesQuote } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const live = useRef({ identity, active });
  live.current = { identity, active };
  const generation = useRef(0);
  const locked = useRef(false);
  const cancel = () => {
    ++generation.current;
    locked.current = false;
    setBusy(false);
    setPrepared(null);
  };
  useEffect(() => {
    cancel();
    setError(null);
  }, [identity, active]);
  useEffect(() => {
    const listener = AppState.addEventListener('change', (state) => {
      if (state === 'background') cancel();
    });
    const counter = generation;
    return () => {
      ++counter.current;
      listener.remove();
    };
  }, []);
  const quote =
    prepared?.identity === identity && prepared.quote.expiresAt * 1000 > Date.now()
      ? prepared.quote
      : null;
  const resolve = async (baseline: VibesQuote): Promise<VibesQuote | null> => {
    if (locked.current || !active) return null;
    if (quote) return quote;
    if (!baseline.smartAuto || !api.prepareAuto || !api.autoPreparation) return baseline;
    locked.current = true;
    setBusy(true);
    setError(null);
    const version = ++generation.current;
    const valid = () =>
      version === generation.current && live.current.active && live.current.identity === identity;
    let key: string | null = null;
    let completed = false;
    let requestId: string | null = null;
    try {
      key = 'auto-preparation-' + (await digestStringAsync(CryptoDigestAlgorithm.SHA256, identity));
      // Reuse an ambiguous preparation only after another explicit Send. Never resume automatically.
      let saved: { id: string; quote: string; expiresAt: number } | null = null;
      try {
        saved = JSON.parse((await readSecure(key)) ?? 'null');
      } catch {
        /* replace corrupt identity */
      }
      if (
        !saved ||
        typeof saved.id !== 'string' ||
        typeof saved.quote !== 'string' ||
        !Number.isFinite(saved.expiresAt) ||
        saved.expiresAt * 1000 <= Date.now()
      ) {
        saved = { id: randomUUID(), quote: baseline.quote, expiresAt: baseline.expiresAt };
        await writeSecure(key, JSON.stringify(saved));
      }
      const id = saved.id;
      requestId = id;
      if (!valid()) return null;
      await api.prepareAuto(id, saved.quote);
      for (let attempt = 0; attempt < 10; attempt++) {
        if (!valid()) return null;
        const result = await api.autoPreparation(id);
        if (!valid()) return null;
        if (result.state === 'ready' && result.quote) {
          completed = true;
          setPrepared({ identity, quote: result.quote });
          return samePreparedExecution(baseline, result.quote) ? result.quote : null;
        }
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      throw new Error('Choosing a model took too long. Your draft is safe; try again.');
    } catch (e) {
      // Definitive refusals cannot recover with the old quote; ambiguous network errors retain identity.
      if (e instanceof VibesError && [400, 401, 403, 404, 409, 422].includes(e.status)) {
        completed = true;
        if (valid()) refreshEstimate?.();
      }
      if (valid()) setError(e instanceof Error ? e.message : 'Could not prepare this message.');
      return null;
    } finally {
      if (key && completed) {
        try {
          if (JSON.parse((await readSecure(key)) ?? 'null')?.id === requestId)
            await deleteSecure(key);
        } catch {
          /* expires naturally */
        }
      }
      if (valid()) {
        locked.current = false;
        setBusy(false);
      }
    }
  };
  return { quote, busy, error, resolve, cancel };
}
