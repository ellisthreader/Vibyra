import type { TeammateFields } from '../types';

export type SetupStep =
  'engine' | 'skills' | 'job' | 'memory' | 'tools' | 'routine' | 'review' | 'identity' | 'budget';
export interface RoutinePlan {
  routines: string[];
  requestedTools?: string;
  status: 'draft';
}
export interface SetupDraft {
  layout?: 'tabs';
  version: 2;
  revision?: number;
  step: SetupStep;
  text: string;
  job: string;
  fields: TeammateFields;
  routineSuggestion: string;
  routines: string[];
  requestedTools?: string;
  pending?: {
    id: string;
    revision?: number;
    fields: TeammateFields;
    routines: string[];
    requestedTools?: string;
  };
}
export const emptySetup = (): SetupDraft => ({
  version: 2,
  step: 'review',
  text: '',
  job: '',
  routineSuggestion: '',
  routines: [],
  fields: {
    model: 'auto',
    skillIds: [],
    name: '',
    brief: '',
    memory: '',
    avatar: 'assistant',
    budget: 5,
    integrations: [],
  },
});
export const routinePlanKey = (identity: string, id: string) =>
  `agent-plan.${encodeURIComponent(identity)}.${id}`;
