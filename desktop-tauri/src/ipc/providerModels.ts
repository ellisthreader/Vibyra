import { invoke } from '@tauri-apps/api/core';
export interface ProviderStatus { provider: string; configured: boolean; hint: string }
export const providerStatus = () => invoke<ProviderStatus[]>('provider_model_status');
export const saveProviderKey = (provider: string, key: string) => invoke<void>('provider_model_save_key', { provider, key });
export const removeProviderKey = (provider: string) => invoke<void>('provider_model_remove_key', { provider });
export const listProviderModels = (provider: string, key?: string) => invoke<string[]>('provider_model_list_models', { provider, key: key || null });
