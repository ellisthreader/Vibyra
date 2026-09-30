import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";

/** A newly released model from the shared backend feed. */
export interface ReleasedModel {
  id: string;
  name: string;
}

export function onModelsAvailable(callback: () => void): Promise<UnlistenFn> {
  return listen("models:available", callback);
}

export function takeModelReleases(): Promise<ReleasedModel[]> {
  return invoke<ReleasedModel[]>("take_model_releases");
}
