import { create } from "zustand";

import {
  githubCancelConnect,
  githubConnect,
  githubDisconnect,
  githubIntegrationStatus,
  type GithubIntegrationStatus,
} from "../ipc/github";

interface GithubIntegrationStore {
  status: GithubIntegrationStatus | null;
  busy: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  connect: () => Promise<void>;
  cancel: () => Promise<void>;
  disconnect: () => Promise<void>;
}

type StoreUpdate = (partial: Partial<GithubIntegrationStore>) => void;
let latestRequest = 0;
let refreshInFlight: Promise<void> | null = null;

async function runStatusAction(
  set: StoreUpdate,
  action: () => Promise<GithubIntegrationStatus>,
) {
  const request = ++latestRequest;
  set({ busy: true, error: null });
  try {
    const status = await action();
    if (request === latestRequest) set({ status, error: status.error });
  } catch (error) {
    if (request === latestRequest) set({ error: String(error) });
  } finally {
    if (request === latestRequest) set({ busy: false });
  }
}

export const useGithubIntegrationStore = create<GithubIntegrationStore>((set, get) => ({
  status: null,
  busy: false,
  error: null,

  refresh: () => {
    if (refreshInFlight) return refreshInFlight;
    const initial = get().status === null;
    const request = ++latestRequest;
    if (initial) set({ busy: true, error: null });
    refreshInFlight = githubIntegrationStatus()
      .then((status) => {
        if (request === latestRequest) set({ status, error: status.error });
      })
      .catch((error) => {
        if (request === latestRequest) set({ error: String(error) });
      })
      .finally(() => {
        refreshInFlight = null;
        if (initial && request === latestRequest) set({ busy: false });
      });
    return refreshInFlight;
  },
  connect: () => runStatusAction(set, githubConnect),
  cancel: () => runStatusAction(set, githubCancelConnect),
  disconnect: () => runStatusAction(set, githubDisconnect),
}));
