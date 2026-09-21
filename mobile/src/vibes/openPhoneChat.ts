import { AUTO } from '../ui/agents';
import { pickerModels } from '../ui/pickerModels';
import type { VibesStore } from './VibesStore';

/** Prepare a phone chat locally; selecting a model never sends computer history or starts a turn. */
export async function openPhoneChat(store: VibesStore, model: string, open: () => void) {
  if (store.state.pending) throw new Error('Wait for your phone AI reply to finish first.');
  if (model !== AUTO) {
    const offered = pickerModels(store.state.models).find(item => item.id === model);
    if (!offered) throw new Error('This phone model is no longer available. Choose another model.');
    if (!offered.trial && !store.state.wallet?.paidAvailable) throw new Error('This model needs a membership.');
  }
  await store.select(null);
  store.setModel(model);
  open();
}
