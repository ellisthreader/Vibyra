/** Display identity comes from the selected computer session, never the phone catalogue. */
export function conversationProvider(provider?: string) {
  if (provider === 'claude' || provider === 'anthropic')
    return { name: 'Claude', company: 'Anthropic', vendor: 'anthropic' };
  if (provider === 'gemini' || provider === 'google')
    return { name: 'Gemini', company: 'Google', vendor: 'google' };
  if (!provider || provider === 'codex' || provider === 'openai')
    return { name: 'Codex', company: 'OpenAI', vendor: 'openai' };
  return { name: provider, company: provider, vendor: provider };
}
