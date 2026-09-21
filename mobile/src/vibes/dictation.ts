import { requireOptionalNativeModule } from 'expo';

export type DictationUpdate =
  | { type: 'transcript'; text: string; final: boolean }
  | { type: 'error'; message: string }
  | { type: 'end' };
export interface Listening { stop(): void; cancel(): void }
export interface Dictation {
  /** Resolves once the microphone is live; rejects with why it is not. */
  start(onUpdate: (update: DictationUpdate) => void): Promise<Listening>;
}

interface NativeSpeech {
  start(): Promise<void>;
  stop(): Promise<void>;
  addListener(event: 'onDictation', listener: (update: DictationUpdate) => void): { remove(): void };
}
// Apple speech recognition through `modules/vibyra-speech`. Expo Go and any build
// made before the module was added have no such module, and say so.
const native = requireOptionalNativeModule<NativeSpeech>('VibyraSpeech');

export const dictation: Dictation = {
  async start(onUpdate) {
    if (!native) throw new Error('Voice input needs the Vibyra app build. Expo Go does not include it.');
    // The subscription outlives `stop`, because the last words arrive after it.
    const subscription = native.addListener('onDictation', update => {
      onUpdate(update);
      if (update.type === 'end') subscription.remove();
    });
    try { await native.start(); } catch (error) { subscription.remove(); throw error; }
    return {
      stop: () => { void native.stop().catch(() => {}); },
      cancel: () => { subscription.remove(); void native.stop().catch(() => {}); },
    };
  },
};
