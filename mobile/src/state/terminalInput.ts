import { InputQueue } from './inputQueue';
import { byteLength } from './output';
import { requireLease } from './session';
import type { WorkspaceStore } from './WorkspaceStore';

/** Each selection owns its queue. Buffered keys cannot follow a new lease. */
export function terminalInput(store: WorkspaceStore) {
  let active: { key: string; queue: InputQueue } | undefined;
  return async (data: string) => {
    const lease = requireLease(store);
    if (!data || byteLength(data) > 8192)
      throw new Error('Send less than 8 KB of terminal input at a time.');
    const epoch = store.epoch;
    const selection = store.selectionEpoch;
    const key = JSON.stringify([epoch, selection, lease]);
    if (active?.key !== key) {
      active = {
        key,
        queue: new InputQueue(async (chunk) => {
          const current = requireLease(store);
          if (
            !store.current(epoch) ||
            store.selectionEpoch !== selection ||
            current.sessionId !== lease.sessionId ||
            current.lease !== lease.lease ||
            current.generation !== lease.generation
          )
            throw new Error('The terminal changed. Queued input was not sent.');
          try {
            await store.deps.rpc.request('session.input', {
              ...lease,
              inputId: store.deps.uuid(),
              data: chunk,
            });
          } catch (error) {
            if (
              store.current(epoch) &&
              store.selectionEpoch === selection &&
              store.lease === current &&
              error instanceof Error &&
              error.message.startsWith('Another phone took this terminal')
            ) {
              store.lease = null;
              store.update({ control: 'readonly' });
            }
            throw error;
          }
        }),
      };
    }
    await active.queue.push(data);
  };
}
