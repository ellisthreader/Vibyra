/** Public catalogue IDs must resolve to an account-advertised version, never a guessed family fallback. */
export interface AccountModel {
  model: string; resolvedModel?: string; displayName?: string;
  supportedReasoningEfforts?: { reasoningEffort: string }[];
}
const normal = (id: string) => id.replace(/^[^/]+\//, '').toLowerCase().replace(/\./g, '-');
export function accountModelFor(wanted: string, rows: AccountModel[]): AccountModel | undefined {
  const key = normal(wanted);
  const exact = rows.find(row => [row.model, row.resolvedModel].some(id => id && normal(id) === key));
  if (exact) return exact;
  const dated = rows.filter(row => row.resolvedModel && normal(row.resolvedModel).replace(/-\d{8}$/, '') === key);
  const versions = new Set(dated.map(row => row.resolvedModel));
  return versions.size === 1 ? dated[0] : undefined;
}
