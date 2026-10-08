import { useState } from 'react';
import { View } from 'react-native';
import { Button, Hint } from '../../ui/primitives';
import type { RoutinesApi } from '../v2/routinesApi';
import { draftState, type ScheduleDraft } from '../v2/routinesModel';
import type { TriggerDraft } from '../v2/triggersModel';
import { SetupHeading } from './SetupForm';
import { SetupRoutines, type DraftScheduling } from './SetupRoutines';
import { ScheduleCard } from './ScheduleCard';
import { ScheduleEditor } from './ScheduleEditor';
import { SetupTriggers } from './SetupTriggers';
import { TemplateRoutineSuggestions } from './TemplateRoutineSuggestions';
import { scheduleSeed, triggerSeed, type Template } from '../v2/templatesModel';
import { useRoutines } from './useRoutines';

/**
 * The Access tab's routines area. Without v2 routines/triggers it is exactly today's
 * "Draft · not running yet" plans. With them, a draft can be scheduled by the person —
 * never automatically — and saved teammates get schedules and event triggers.
 */
export function RoutinesArea({ api, agentId, active, routines, suggestion, disabled, onChange, onOpenRun, template }: {
  api?: RoutinesApi; agentId?: string; active: boolean; routines: string[]; suggestion: string; disabled: boolean;
  onChange(routines: string[]): void; onOpenRun?(runId: string): void;
  /** The starter this teammate came from: its routine and trigger are offered as one-tap "Set up…". */
  template?: Template | null;
}) {
  const state = useRoutines(api, agentId, active);
  const { caps, schedules } = state;
  const [editing, setEditing] = useState<string | null>(null);
  const [seed, setSeed] = useState<Partial<ScheduleDraft> | undefined>();
  const [triggerSeedState, setTriggerSeed] = useState<{ draft: Partial<TriggerDraft>; nonce: number } | null>(null);
  const scheduling: DraftScheduling | undefined = caps.routines ? {
    note: agentId ? 'Drafts stay here and never run until you schedule one.' : 'Drafts never run on their own. Create the teammate, then schedule one.',
    stateOf: text => draftState(text, schedules),
    onSchedule: agentId ? text => setEditing(text) : undefined,
  } : undefined;
  const drafts = <SetupRoutines routines={routines} suggestion={suggestion} disabled={disabled} onChange={onChange} scheduling={scheduling} />;
  if (!api || !agentId || (!caps.routines && !caps.triggers)) return drafts;
  return (
    <View style={{ gap: 28 }}>
      {template && <TemplateRoutineSuggestions template={template} schedules={schedules} triggers={state.triggers}
        canSchedule={caps.routines} canTrigger={caps.triggers && Boolean(template.trigger && caps.triggerKinds.includes(template.trigger.kind))}
        onSchedule={() => { setSeed(scheduleSeed(template) ?? undefined); setEditing(template.schedule?.prompt ?? ''); }}
        onTrigger={() => { const draft = triggerSeed(template); if (draft) setTriggerSeed({ draft, nonce: (triggerSeedState?.nonce ?? 0) + 1 }); }} />}
      {drafts}
      {caps.routines && (
        <View style={{ gap: 12 }}>
          <SetupHeading title="Scheduled routines" description="These run on their own at the times below, on your Mac’s AI account." />
          {schedules.map(s => (
            <ScheduleCard key={s.id} api={api} schedule={s} onChange={next => state.putSchedule(next, s.id)} onOpenRun={onOpenRun} />
          ))}
          {editing !== null ? (
            <ScheduleEditor key={editing} api={api} agentId={agentId} prompt={editing} initial={seed} onCancel={() => { setEditing(null); setSeed(undefined); }}
              onSaved={schedule => { state.putSchedule(schedule, schedule.id); setEditing(null); setSeed(undefined); }} />
          ) : (
            <Button secondary title="Schedule a routine" onPress={() => setEditing('')} />
          )}
        </View>
      )}
      {caps.triggers && (
        <SetupTriggers api={api} agentId={agentId} kinds={caps.triggerKinds} triggers={state.triggers}
          onChange={state.putTrigger} onOpenRun={onOpenRun} seed={triggerSeedState} />
      )}
      {state.error ? <View style={{ gap: 8 }}><Hint error>{state.error}</Hint><Button secondary title="Refresh routines" onPress={() => void state.refresh()} /></View> : null}
    </View>
  );
}
