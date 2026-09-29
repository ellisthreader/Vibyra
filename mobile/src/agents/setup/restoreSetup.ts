import type { TeammateFields } from '../types';
import { emptySetup, type SetupDraft } from './types';

const strings = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((v) => typeof v === 'string');
function validFields(value: unknown): value is TeammateFields {
  if (!value || typeof value !== 'object') return false;
  const f = value as TeammateFields;
  return (
    typeof f.name === 'string' &&
    typeof f.brief === 'string' &&
    typeof f.memory === 'string' &&
    typeof f.avatar === 'string' &&
    typeof f.budget === 'number' &&
    Number.isFinite(f.budget) &&
    strings(f.integrations) &&
    (f.model === undefined || typeof f.model === 'string') &&
    (f.skillIds === undefined || strings(f.skillIds))
  );
}
function validPending(value: unknown): value is NonNullable<SetupDraft['pending']> {
  if (!value || typeof value !== 'object') return false;
  const p = value as NonNullable<SetupDraft['pending']>;
  return typeof p.id === 'string' && Boolean(p.id) && validFields(p.fields) && strings(p.routines);
}
/** Preserve old intake text and exact ambiguous requests while changing presentation. */
export function restoreSetup(raw: string | null, legacy: string | null): SetupDraft {
  const value = raw ? JSON.parse(raw) : emptySetup();
  if (
    !value ||
    ![1, 2].includes(value.version) ||
    ![
      'engine',
      'skills',
      'job',
      'memory',
      'tools',
      'routine',
      'review',
      'identity',
      'budget',
    ].includes(value.step) ||
    !validFields(value.fields) ||
    !strings(value.routines) ||
    value.routines.length > 2 ||
    !['text', 'job', 'routineSuggestion'].every((key) => typeof value[key] === 'string') ||
    (value.requestedTools !== undefined && typeof value.requestedTools !== 'string')
  )
    throw new Error('Invalid setup');
  if (value.pending !== undefined && !validPending(value.pending))
    throw new Error('Invalid pending request');
  if (!value.pending && legacy) {
    const previous = JSON.parse(legacy);
    const pending = { ...previous, routines: [] };
    if (!validPending(pending)) throw new Error('Invalid legacy request');
    value.pending = pending;
  }
  if (value.pending) {
    value.fields = value.pending.fields;
    value.step = 'review';
  } else if (value.version === 1) {
    if (value.step === 'memory')
      value.text = [value.fields.memory, value.text].filter(Boolean).join('\n');
    if (value.step === 'routine' && value.text.trim()) {
      value.routines = [value.text];
      value.text = '';
    }
  }
  return { ...value, version: 2 };
}

/** Carry uncommitted old section text into the direct-field editor exactly once. */
export function tabbedSetup(draft: SetupDraft): SetupDraft {
  if (draft.pending || draft.layout === 'tabs') return draft;
  const next = { ...draft, fields: { ...draft.fields }, layout: 'tabs' as const, text: '' };
  if (draft.step === 'job' && draft.text.trim()) next.fields.brief = draft.text;
  if (draft.step === 'memory') next.fields.memory = draft.text;
  if (draft.step === 'tools') next.requestedTools = draft.text.trim() || undefined;
  return next;
}
