import { listen, type UnlistenFn } from "@tauri-apps/api/event";

/** A newly released model the Rust watcher found on OpenRouter. */
export interface ReleasedModel {
  id: string;
  name: string;
}

export function onModelsReleased(
  callback: (models: ReleasedModel[]) => void,
): Promise<UnlistenFn> {
  return listen<ReleasedModel[]>("models:released", (event) => callback(event.payload));
}
