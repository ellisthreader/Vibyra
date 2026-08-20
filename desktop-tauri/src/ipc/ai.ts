import { invoke } from "@tauri-apps/api/core";

import type { AiServiceStatus } from "../types";

export function aiServiceStatus(): Promise<AiServiceStatus> {
  return invoke("ai_service_status");
}

/** Validated and proved against OpenAI before it reaches the credential store. */
export function setOpenAiKey(key: string): Promise<AiServiceStatus> {
  return invoke("set_openai_key", { key });
}

export function clearOpenAiKey(): Promise<AiServiceStatus> {
  return invoke("clear_openai_key");
}

export function openOpenAiKeyPage(): Promise<void> {
  return invoke("open_openai_key_page");
}
