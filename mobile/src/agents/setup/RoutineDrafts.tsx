import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { readFlag } from '../../transport/deviceFlags';
import { Hint } from '../../ui/primitives';
import { routinePlanKey, type RoutinePlan } from './types';

export function RoutineDrafts({ identity, id }: { identity: string; id: string }) {
  const [plan, setPlan] = useState<RoutinePlan | null>(null); const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    void readFlag(routinePlanKey(identity, id)).then(raw => {
      const value = raw ? JSON.parse(raw) as RoutinePlan : null;
      if (value && (value.status !== 'draft' || !Array.isArray(value.routines))) throw new Error('Invalid plan');
      if (active) setPlan(value);
    }).catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [identity, id]);
  if (error) return <Hint error>Your saved routine plans could not be loaded.</Hint>;
  if (!plan || !plan.routines.length && !plan.requestedTools) return null;
  return <View style={{ gap: 8 }}><Hint>Plans on this phone · not activated</Hint>
    {plan.requestedTools && <Hint>Planned tools: {plan.requestedTools}</Hint>}
    {plan.routines.map((routine, i) => <Hint key={i}>Routine draft {i + 1}: {routine}</Hint>)}
  </View>;
}
