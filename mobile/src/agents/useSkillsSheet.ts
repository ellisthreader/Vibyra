import { useEffect, useRef, useState } from 'react';
import { readFlag, writeFlag } from '../transport/deviceFlags';
import { VibesError } from '../vibes/api';
import { parseSavedSkill } from './savedSkill';
import type { AgentSkill, AgentsApi } from './types';

export function useSkillsSheet(visible: boolean, api: AgentsApi, identity: string) {
  const [skills, setSkills] = useState<AgentSkill[]>([]);
  const [draft, onDraft] = useState<AgentSkill | null>(null);
  const [pending, setPending] = useState<AgentSkill | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);
  const key = `agent-skill-save.${encodeURIComponent(identity)}`;

  useEffect(() => {
    if (!visible) return;
    let alive = true;
    setError('');
    if (api.skills) {
      void api
        .skills()
        .then((rows) => {
          if (alive) setSkills(rows);
        })
        .catch((cause) => {
          if (alive) setError(String(cause));
        });
    }
    void readFlag(key)
      .then((value) => {
        if (!alive) return;
        if (!value) {
          setPending(null);
          return;
        }
        try {
          setPending(parseSavedSkill(value));
        } catch {
          setError('Saved skill request is damaged.');
        }
      })
      .catch(() => {
        if (alive) setError('Could not restore the saved skill request. Reopen Skills to retry.');
      });
    return () => {
      alive = false;
    };
  }, [visible, api, key]);

  const current = pending ?? draft;
  const onSave = async () => {
    if (!current || lock.current || !api.saveSkill) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      await writeFlag(key, JSON.stringify(current));
      setPending(current);
      const saved = await api.saveSkill(current);
      await writeFlag(key, '');
      setPending(null);
      onDraft(null);
      setSkills((rows) => [saved, ...rows.filter((skill) => skill.id !== saved.id)]);
    } catch (cause) {
      if (cause instanceof VibesError && cause.status >= 400 && cause.status < 500) {
        try {
          await writeFlag(key, '');
          setPending(null);
          onDraft(current);
        } catch {
          setError(
            'Skill save was refused, but its local request could not be cleared. Reopen Skills to retry safely.',
          );
          return;
        }
        if (api.skills)
          void api
            .skills()
            .then(setSkills)
            .catch(() => {});
      }
      setError(cause instanceof Error ? cause.message : 'Skill could not be saved.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };

  return { current, pending, busy, error, skills, onDraft, onSave };
}
