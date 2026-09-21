import type { Dictation, DictationUpdate } from './dictation';

export type { Dictation, DictationUpdate, Listening } from './dictation';

interface SpeechResult { isFinal: boolean; 0: { transcript: string } }
interface Recognition {
  lang: string; interimResults: boolean; continuous: boolean;
  onresult: ((event: { results: ArrayLike<SpeechResult> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void; stop(): void; abort(): void;
}
type RecognitionClass = new () => Recognition;

// The browser's own recogniser, where it has one (Safari and Chrome do).
const find = (): RecognitionClass | undefined => {
  if (typeof window === 'undefined') return undefined;
  const scope = window as unknown as { SpeechRecognition?: RecognitionClass; webkitSpeechRecognition?: RecognitionClass };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition;
};

export const dictation: Dictation = {
  async start(onUpdate: (update: DictationUpdate) => void) {
    const Recognizer = find();
    if (!Recognizer) throw new Error('Voice input is not available in this browser.');
    const recognition = new Recognizer();
    let active = true;
    recognition.lang = navigator.language || 'en-US';
    recognition.interimResults = true;
    recognition.continuous = true;
    recognition.onresult = event => {
      const results = Array.from(event.results);
      onUpdate({ type: 'transcript', text: results.map(result => result[0].transcript).join(''),
        final: results.length > 0 && results[results.length - 1]!.isFinal });
    };
    recognition.onerror = event => {
      if (active && event.error !== 'no-speech' && event.error !== 'aborted') {
        onUpdate({ type: 'error', message: event.error === 'not-allowed'
          ? 'Allow the microphone for this site to use your voice.' : 'Voice input stopped. Try again.' });
      }
    };
    recognition.onend = () => { if (active) { active = false; onUpdate({ type: 'end' }); } };
    recognition.start();
    return { stop: () => recognition.stop(), cancel: () => { active = false; recognition.abort(); } };
  },
};
