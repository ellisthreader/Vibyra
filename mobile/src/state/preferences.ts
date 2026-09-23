import { clampFontSize } from '../terminal/fontFit';
import { isAccentId, type AccentId } from '../theme';
import { initialState } from './types';
import type { WorkspaceStore } from './WorkspaceStore';

/** The interaction colour: kept beside the theme in the one store, on the phone as 'accent'. */
export function setAccent(store: WorkspaceStore, accent: AccentId) {
  if (!isAccentId(accent)) return;
  store.update({ accent });
  void store.deps.storage.write('accent', accent).catch((error) => store.report(error));
}
/** Read on its own so a colour never waits behind the account check, and applied only
 *  while the accent is still the default so a pick made meanwhile stands. */
export function restoreAccent(store: WorkspaceStore) {
  void store.deps.storage.read('accent').then(
    (value) => {
      if (isAccentId(value) && store.state.accent === initialState.accent)
        store.update({ accent: value });
    },
    () => {},
  );
}
/** The terminal's type size was saved on every pinch but never read back, so each
 *  launch started at the default again. Same rule: a size set meanwhile stands. */
export function restoreTerminalFontSize(store: WorkspaceStore) {
  void store.deps.storage.read('terminalFontSize').then(
    (value) => {
      const size = Number(value);
      if (
        !value ||
        !Number.isFinite(size) ||
        store.state.terminalFontSize !== initialState.terminalFontSize
      )
        return;
      store.update({ terminalFontSize: clampFontSize(size) });
    },
    () => {},
  );
}
