import { HttpProxyController, type NativePreviewProxy } from '../preview/HttpProxyController';
import type { WorkspaceStore } from './WorkspaceStore';
import { validPreviewTarget, type PreviewList, type PreviewTarget } from '../preview/types';
import { validPreviewRunnable } from '../preview/runnable';
import { validHostPlatform } from '../ui/hostIdentity';

export function ready(store: WorkspaceStore): number {
  if (store.state.status !== 'connected' || !store.state.previewAvailable) {
    throw new Error('Live Preview is unavailable on this connection.');
  }
  return store.epoch;
}

/** Mac grants and the native adapter are both required. No arbitrary URL is accepted. */
export function previewActions(store: WorkspaceStore) {
  let adapterQueue: Promise<unknown> = Promise.resolve();
  let active: HttpProxyController | null = null;
  const withAdapter = <T>(work: () => Promise<T>): Promise<T> => {
    const next = adapterQueue.then(work, work);
    adapterQueue = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  };
  return {
    listPreviews: async (): Promise<PreviewList> => {
      const epoch = ready(store);
      const result = await store.deps.rpc.request<PreviewList>('preview.list', { windowV1: true, windowHandoffV1: true });
      store.assertCurrent(epoch);
      if (
        !Array.isArray(result.targets) ||
        result.targets.some(target => !validPreviewTarget(target)) ||
        (result.windowProblem != null && typeof result.windowProblem !== 'string')
      ) {
        throw new Error('The computer returned an invalid Preview list.');
      }
      // A malformed runnable row is dropped rather than failing the whole list.
      const runnable = result.previewRunV1 === true && Array.isArray(result.runnable)
        ? result.runnable.filter(validPreviewRunnable) : [];
      const hostPlatform = validHostPlatform(result.hostPlatform) ? result.hostPlatform : undefined;
      const hostId = store.state.host?.id;
      if (hostPlatform && hostId && (store.state.previewHost?.hostId !== hostId || store.state.previewHost.platform !== hostPlatform))
        store.update({ previewHost: { hostId, platform: hostPlatform } });
      return { ...result, runnable, hostPlatform };
    },
    shareWindowPreview: async (candidateId: string): Promise<PreviewTarget> => {
      const epoch = ready(store);
      if (!/^[0-9a-f]{32}$/.test(candidateId)) throw new Error('Refresh the window selection.');
      const result = await store.deps.rpc.request<PreviewTarget>('preview.window.share', { candidateId, viewOnly: true });
      store.assertCurrent(epoch);
      if (!validPreviewTarget(result) || result.approvalRequired || !/:(view|control)$/.test(result.targetId)) {
        throw new Error('The computer returned an invalid window approval.');
      }
      return result;
    },
    startPreview: async (grantId: string): Promise<{ phase: string }> => {
      const epoch = ready(store);
      if (!/^[0-9a-f]{32}$/.test(grantId)) throw new Error('Invalid Preview approval.');
      const result = await store.deps.rpc.request<{ phase: string }>(
        'preview.start',
        { grantId },
        90000,
      );
      store.assertCurrent(epoch);
      return result;
    },
    openPreview: async (grantId: string) => {
      const epoch = ready(store);
      if (!/^[0-9a-f]{32}$/.test(grantId)) throw new Error('Invalid Preview approval.');
      const result = await store.deps.rpc.request<{ generation: string; startPath?: string; kind?: string }>(
        'preview.open',
        { grantId },
      );
      store.assertCurrent(epoch);
      if (!/^[1-9][0-9]*$/.test(result.generation))
        throw new Error('The computer returned an invalid Preview session.');
      return withAdapter(async () => {
        store.assertCurrent(epoch);
        if (active) {
          await active.close();
          active = null;
        }
        const { requireOptionalNativeModule } = await import('expo-modules-core');
        const native = requireOptionalNativeModule<NativePreviewProxy>('VibyraPreviewProof');
        if (!native) throw new Error('This iPhone build does not contain Live Preview.');
        const controller = new HttpProxyController(store.deps.rpc, native, result.generation,
          store.state.previewWindow);
        const url = await controller.start(result.startPath ?? '/');
        if (!store.current(epoch)) {
          await controller.close();
          throw new Error('The computer connection changed. Open Preview again.');
        }
        active = controller;
        return {
          url,
          close: () =>
            withAdapter(async () => {
              if (active === controller) active = null;
              await controller.close();
              if (result.kind === 'window' && store.current(epoch)) {
                await store.deps.rpc.request('preview.close', { generation: result.generation }).catch(() => {});
              }
            }),
        };
      });
    },
  };
}
