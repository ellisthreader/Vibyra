/** HTTPS endpoints are enforced in provider_model_http.rs. No account keys enter settings. */
export const providerPresets = [
  { id: 'openai', name: 'OpenAI', detail: 'OpenAI models' },
  { id: 'openrouter', name: 'OpenRouter', detail: 'Models from many providers' },
  { id: 'xai', name: 'xAI', detail: 'Grok models' },
  { id: 'deepseek', name: 'DeepSeek', detail: 'DeepSeek models' },
  { id: 'mistral', name: 'Mistral', detail: 'Mistral models' },
] as const;
