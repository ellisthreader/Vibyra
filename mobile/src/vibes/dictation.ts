import { requireOptionalNativeModule } from 'expo';

export type DictationUpdate =
  | { type: 'transcript'; text: string; final: boolean }
  | { type: 'error'; message: string }
  | { type: 'end' };
export interface Listening {
  stop(): void;
  cancel(): void;
}
export interface Dictation {
  /** Resolves once the microphone is live; rejects with why it is not. */
  start(onUpdate: (update: DictationUpdate) => void, signal?: AbortSignal): Promise<Listening>;
}

interface NativeSpeech {
  start(): Promise<void>;
  stop(): Promise<void>;
  cancel?(): Promise<void>;
  addListener(
    event: 'onDictation',
    listener: (update: DictationUpdate) => void,
  ): { remove(): void };
}
// Apple speech recognition through `modules/vibyra-speech`. Expo Go and any build
// made before the module was added have no such module, and say so.
const native = requireOptionalNativeModule<NativeSpeech>('VibyraSpeech');

export const dictation: Dictation = {
  async start(onUpdate, signal) {
    if (!native)
      throw new Error('Voice input needs the Vibyra app build. Expo Go does not include it.');
    if (signal?.aborted) throw new Error('Voice input was cancelled.');
    let active = true;
    // The subscription outlives `stop`, because the last words arrive after it.
    const subscription = native.addListener('onDictation', (update) => {
      if (!active) return;
      onUpdate(update);
      if (update.type === 'end') {
        active = false;
        signal?.removeEventListener('abort', cancel);
        subscription.remove();
      }
    });
    const cancel = () => {
      active = false;
      subscription.remove();
      void (native.cancel?.() ?? native.stop()).catch(() => {});
    };
    signal?.addEventListener('abort', cancel, { once: true });
    try {
      await native.start();
    } catch (error) {
      signal?.removeEventListener('abort', cancel);
      subscription.remove();
      throw error;
    }
    if (signal?.aborted) {
      cancel();
      throw new Error('Voice input was cancelled.');
    }
    signal?.removeEventListener('abort', cancel);
    return {
      stop: () => {
        void native.stop().catch(() => {});
      },
      cancel,
    };
  },
};
