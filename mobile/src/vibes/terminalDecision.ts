import { isTerminalModel } from '../ui/terminalModelPolicy';
import type { Effort } from './types';

export interface TerminalCandidate { id: string; name: string; efforts: Effort[] }
export interface TerminalDecision { model: string; name: string; effort: Effort | null }
export interface TerminalDecisionRequest { id: string; text: string; source: 'accounts' | 'vibyra'; consent: true; models: TerminalCandidate[] }
const efforts = new Set(['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']);
/** Bound classifier size while keeping each eligible company represented. */
export function terminalCandidates(models: { id: string; name: string; efforts?: string[] }[]): TerminalCandidate[] {
  const rows = models.filter(m => isTerminalModel(m.id)).map(m => ({ id: m.id, name: m.name.slice(0, 120),
    efforts: (m.efforts ?? []).filter(e => efforts.has(e)) as Effort[] }));
  const groups = new Map<string, TerminalCandidate[]>();
  for (const row of new Map(rows.map(row => [row.id, row])).values()) {
    const vendor = row.id.split('/')[0];
    const group = groups.get(vendor) ?? []; group.push(row); groups.set(vendor, group);
  }
  const result: TerminalCandidate[] = [];
  for (let index = 0; result.length < 64; index++) {
    let added = false;
    for (const group of groups.values()) if (group[index] && result.length < 64) { result.push(group[index]); added = true; }
    if (!added) break;
  }
  return result;
}
export function verifyTerminalDecision(value: unknown, models: TerminalCandidate[]): TerminalDecision {
  const row = value as TerminalDecision | null;
  const model = models.find(m => m.id === row?.model);
  if (!row || !model || typeof row.name !== 'string' || (row.effort === null ? model.efforts.length > 0 : !model.efforts.includes(row.effort)))
    throw new Error('Auto returned a model or effort that is no longer available. Choose again.');
  return { model: model.id, name: model.name, effort: row.effort };
}
