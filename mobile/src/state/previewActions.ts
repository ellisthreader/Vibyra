import { HttpProxyController, type NativePreviewProxy } from '../preview/HttpProxyController';
import type { WorkspaceStore } from './WorkspaceStore';

interface Target {
  grantId: string;
  projectId: string;
  targetId: string;
  name?: string | null;
  running?: boolean;
}

function ready(store: WorkspaceStore): number {
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
    listPreviews: async (): Promise<{ targets: Target[] }> => {
      const epoch = ready(store);
      const result = await store.deps.rpc.request<{ targets: Target[] }>('preview.list');
      store.assertCurrent(epoch);
      if (
        !Array.isArray(result.targets) ||
        result.targets.some(
          (target) =>
            typeof target.grantId !== 'string' ||
            typeof target.projectId !== 'string' ||
            typeof target.targetId !== 'string' ||
            (target.name != null && typeof target.name !== 'string') ||
            (target.running != null && typeof target.running !== 'boolean'),
        )
      ) {
        throw new Error('The computer returned an invalid Preview list.');
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
      const result = await store.deps.rpc.request<{ generation: string; startPath?: string }>(
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
        const controller = new HttpProxyController(store.deps.rpc, native, result.generation);
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
            }),
        };
      });
    },
  };
}
