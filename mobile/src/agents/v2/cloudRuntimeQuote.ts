/** Agent Cloud quotes are independent of the separately released Cloud Preview client. */
export interface CloudAgentQuote {
  id: string; profile: 'standard'; cpus: number; memoryMb: number; unitsPerHour: number; unitScale: 10000;
  budgetUnits: number; deadlineSeconds: number; expiresAt: number; deviceId: string; trial: boolean; native: boolean;
}
export function parseCloudAgentQuote(value: unknown): CloudAgentQuote {
  const v = value as Record<string, unknown> | null;
  if (!v || v.profile !== 'standard' || typeof v.id !== 'string' || typeof v.deviceId !== 'string' || v.unitScale !== 10000
    || ['cpus','memoryMb','unitsPerHour','budgetUnits','deadlineSeconds','expiresAt'].some(k => !Number.isSafeInteger(v[k]) || Number(v[k]) <= 0))
    throw new Error('The Cloud Agent price could not be verified. Request a fresh quote.');
  return v as unknown as CloudAgentQuote;
}
