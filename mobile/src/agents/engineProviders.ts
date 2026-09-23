/** Saved engine preferences. Concrete models remain a server-side routing choice. */
export const teammateProviders = [
  { id: 'auto', name: 'Auto' },
  { id: 'openai', name: 'OpenAI' },
  { id: 'anthropic', name: 'Anthropic' },
  { id: 'google', name: 'Google' },
  { id: 'x-ai', name: 'xAI' },
  { id: 'deepseek', name: 'DeepSeek' },
] as const;
export function engineProvider(model = 'auto'): string {
  return model.startsWith('provider:') ? model.slice(9) : model.split('/')[0];
}
export function providerPreference(model = 'auto'): string {
  const provider = engineProvider(model);
  if (!teammateProviders.some(item => item.id === provider)) return model;
  return provider === 'auto' ? 'auto' : `provider:${provider}`;
}
