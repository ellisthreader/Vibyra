import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { randomUUID } from 'expo-crypto';
import { readFlag, writeFlag } from '../../transport/deviceFlags';
import { VibesError } from '../../vibes/api';
import { Button, Hint } from '../../ui/primitives';
import type { AgentSkill, AgentsApi } from '../types';
import { SetupField, SetupHeading, form } from './SetupForm';
export function NewSkill({
  api,
  storage,
  disabled,
  onSaved,
  onEditing,
}: {
  api: AgentsApi;
  storage: string;
  disabled: boolean;
  onSaved(skill: AgentSkill): void;
  onEditing(value: boolean): void;
}) {
  const savedCallback = useRef(onSaved);
  savedCallback.current = onSaved;
  const key = `inline-skill.${encodeURIComponent(storage)}`;
  const [draft, setDraft] = useState<AgentSkill | null>(null),
    [pending, setPending] = useState(false),
    [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const lock = useRef(false);
  const queue = useRef(Promise.resolve());
  useEffect(() => {
    let alive = true;
    void readFlag(key)
      .then((raw) => {
        if (!alive) return;
        if (raw) {
          const value = JSON.parse(raw);
          if (!value?.draft?.id || typeof value.draft.instructions !== 'string')
            throw new Error('Invalid saved skill');
          setDraft(value.draft);
          setPending(value.pending);
        }
        setReady(true);
      })
      .catch(() => {
        if (alive) setError('Could not restore the saved skill. Reopen this page to retry.');
      });
    return () => {
      alive = false;
    };
  }, [key]);
  useEffect(() => {
    onEditing(!ready || Boolean(draft));
  }, [ready, draft, onEditing]);
  const persist = (value: AgentSkill | null, unresolved: boolean) => {
    const next = queue.current
      .catch(() => {})
      .then(() =>
        writeFlag(key, value ? JSON.stringify({ draft: value, pending: unresolved }) : ''),
      );
    queue.current = next;
    return next;
  };
  const change = (patch: Partial<AgentSkill>) => {
    if (!draft || pending || busy) return;
    const next = { ...draft, ...patch };
    setDraft(next);
    void persist(next, false).catch(() =>
      setError('Could not save this skill draft on this phone.'),
    );
  };
  const begin = () => {
    const next = {
      id: randomUUID(),
      revision: 0,
      name: '',
      instructions: '',
      teammateIds: [],
    };
    setDraft(next);
    setError('');
    void persist(next, false).catch(() => setError('Could not save this skill draft.'));
  };
  const save = async () => {
    if (lock.current || !draft || !api.saveSkill || disabled) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      await persist(draft, true);
      setPending(true);
      const saved = await api.saveSkill(draft);
      savedCallback.current(saved);
      await persist(null, false);
      setDraft(null);
      setPending(false);
    } catch (e) {
      if (e instanceof VibesError && e.status >= 400 && e.status < 500) {
        setPending(false);
        await persist(draft, false).catch(() => {});
      }
      setError(
        e instanceof Error ? e.message : 'Skill save is unconfirmed. Retry the same request.',
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  if (!draft)
    return (
      <View style={{ gap: 10 }}>
        <Button
          secondary
          icon="add"
          title="New skill"
          disabled={disabled || !ready || !api.saveSkill}
          onPress={begin}
        />
        {error && <Hint error>{error}</Hint>}
      </View>
    );
  return (
    <View style={form.body}>
      <SetupHeading title="New skill" description="Describe a repeatable task or way of working." />
      <SetupField
        label="Name"
        accessibilityLabel="Skill name"
        maxLength={80}
        value={draft.name}
        editable={!disabled && !pending && !busy}
        placeholder="e.g. Review checklist"
        onChangeText={(name) => change({ name })}
      />
      <SetupField
        label="Instructions"
        accessibilityLabel="Skill instructions"
        maxLength={4000}
        multiline
        value={draft.instructions}
        editable={!disabled && !pending && !busy}
        placeholder="When to use it, the steps to follow, and the result to produce…"
        onChangeText={(instructions) => change({ instructions })}
      />
      <Hint>Saved to your library and selected here. Save the teammate to apply it.</Hint>
      {error && <Hint error>{error}</Hint>}
      <Button
        title={pending ? 'Retry skill save' : 'Save skill'}
        busy={busy}
        disabled={disabled || !draft.name.trim() || !draft.instructions.trim()}
        onPress={() => void save()}
      />
      {!pending && (
        <Button
          secondary
          title="Cancel skill"
          disabled={busy}
          onPress={() => {
            void persist(null, false)
              .then(() => setDraft(null))
              .catch(() => setError('Could not clear the draft.'));
          }}
        />
      )}
    </View>
  );
}
