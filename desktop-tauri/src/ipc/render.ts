import { invoke } from "@tauri-apps/api/core";
import type { RendererPolicy } from "../types";

/** What the running webview actually composites with, and why. */
export function rendererPolicy(): Promise<RendererPolicy> {
  return invoke("renderer_policy");
}
