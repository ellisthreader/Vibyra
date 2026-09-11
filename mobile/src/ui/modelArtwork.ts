import type { ImageSourcePropType } from 'react-native';
import { modelArtworkKey } from './modelArtworkKey';

// The generated per-model artwork, copied from Vibyra Desktop so both surfaces
// show one model the same way. Metro needs a literal `require` per bundled image,
// so the map is written out rather than globbed.
//
// A model with no artwork of its own falls back to its company mark, which is why
// this list can lag the catalogue without leaving a hole in the picker.
const artwork: Record<string, ImageSourcePropType> = {
  'claude-fable-5': require('../../assets/model-icons/claude-fable-5.png'),
  'claude-haiku-4.5': require('../../assets/model-icons/claude-haiku-4.5.png'),
  'claude-opus-4.1': require('../../assets/model-icons/claude-opus-4.1.png'),
  'claude-opus-4.5': require('../../assets/model-icons/claude-opus-4.5.png'),
  'claude-opus-4.6': require('../../assets/model-icons/claude-opus-4.6.png'),
  'claude-opus-4.7-fast': require('../../assets/model-icons/claude-opus-4.7-fast.png'),
  'claude-opus-4.7': require('../../assets/model-icons/claude-opus-4.7.png'),
  'claude-opus-4.8-fast': require('../../assets/model-icons/claude-opus-4.8-fast.png'),
  'claude-opus-4.8': require('../../assets/model-icons/claude-opus-4.8.png'),
  'claude-opus-4': require('../../assets/model-icons/claude-opus-4.png'),
  'claude-opus-5-fast': require('../../assets/model-icons/claude-opus-5-fast.png'),
  'claude-opus-5': require('../../assets/model-icons/claude-opus-5.png'),
  'claude-sonnet-4.5': require('../../assets/model-icons/claude-sonnet-4.5.png'),
  'claude-sonnet-4.6': require('../../assets/model-icons/claude-sonnet-4.6.png'),
  'claude-sonnet-5': require('../../assets/model-icons/claude-sonnet-5.png'),
  'gemini-2.5-flash-lite': require('../../assets/model-icons/gemini-2.5-flash-lite.png'),
  'gemini-2.5-flash': require('../../assets/model-icons/gemini-2.5-flash.png'),
  'gemini-2.5-pro': require('../../assets/model-icons/gemini-2.5-pro.png'),
  'gemini-3.1-flash-lite': require('../../assets/model-icons/gemini-3.1-flash-lite.png'),
  'gemini-3.1-pro': require('../../assets/model-icons/gemini-3.1-pro.png'),
  'gemini-3.5-flash-lite': require('../../assets/model-icons/gemini-3.5-flash-lite.png'),
  'gemini-3.5-flash': require('../../assets/model-icons/gemini-3.5-flash.png'),
  'gemini-3.6-flash': require('../../assets/model-icons/gemini-3.6-flash.png'),
  'gemini-3.7-flash': require('../../assets/model-icons/gemini-3.7-flash.png'),
  'gemini-3.8-flash': require('../../assets/model-icons/gemini-3.8-flash.png'),
  'gemini-3.8-pro': require('../../assets/model-icons/gemini-3.8-pro.png'),
  'gpt-5-codex': require('../../assets/model-icons/gpt-5-codex.png'),
  'gpt-5.4-mini': require('../../assets/model-icons/gpt-5.4-mini.png'),
  'gpt-5.4': require('../../assets/model-icons/gpt-5.4.png'),
  'gpt-5.5': require('../../assets/model-icons/gpt-5.5.png'),
  'gpt-5.6-luna': require('../../assets/model-icons/gpt-5.6-luna.png'),
  'gpt-5.6-sol': require('../../assets/model-icons/gpt-5.6-sol.png'),
  'gpt-5.6-terra': require('../../assets/model-icons/gpt-5.6-terra.png'),
  'gpt-6-astra': require('../../assets/model-icons/gpt-6-astra.png'),
};

/** The model's own artwork, or null when only a company mark exists. */
export function modelArtwork(id: string): ImageSourcePropType | null {
  const key = modelArtworkKey(id);
  return key ? artwork[key] ?? null : null;
}
