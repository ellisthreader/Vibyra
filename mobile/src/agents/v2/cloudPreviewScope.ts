import type { CloudRuntimeStore } from './cloudRuntimeStore';
/** Clear a task preview when its execution context changes, while preserving persisted sends. */
export function observeRuntimeChoice(store: CloudRuntimeStore, invalidate: () => void): () => void {
  const scope = () => {
    const state = store.snapshot();
    return `${state.target}:${state.target === 'cloud' ? state.page?.policy?.runtimeId ?? 'unavailable' : 'local'}`;
  };
  let previous = scope();
  return store.subscribe(() => {
    const next = scope(); if (next === previous) return;
    previous = next; invalidate();
  });
}
