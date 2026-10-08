import { useEffect, useRef, useState } from 'react';
import { Keyboard } from 'react-native';
import type { Roster, Teammate } from './types';
import type { SetupStep } from './setup/types';

/** One selected teammate and a bounded cache of mounted conversations. */
export function useAgentNavigation(
  roster: Roster | null,
  requested: { id: string; nonce: number } | undefined,
  adopt: (agent: Teammate) => void,
  refresh: () => Promise<void>,
) {
  const [selected, setSelected] = useState<string | null>(null);
  const [visited, setVisited] = useState<Teammate[]>([]);
  const [setup, setSetup] = useState<{ agent: Teammate; key: string; step?: SetupStep; nonce: number } | null>(null);
  const [creating, setCreating] = useState(false);
  const [creationVisited, setCreationVisited] = useState(false);
  const [setupVisible, setSetupVisible] = useState(false);
  const handled = useRef<number | null>(null);
  const remember = (agent: Teammate) =>
    setVisited((agents) => [...agents.filter((old) => old.id !== agent.id).slice(-2), agent]);
  const open = (agent: Teammate) => {
    Keyboard.dismiss();
    setSetupVisible(false);
    setCreating(false);
    setSelected(agent.id);
    remember(agent);
  };
  useEffect(() => {
    if (!requested || handled.current === requested.nonce) return;
    const target = roster?.teammates.find((agent) => agent.id === requested.id);
    if (!target) return;
    handled.current = requested.nonce;
    Keyboard.dismiss();
    setSetupVisible(false);
    setCreating(false);
    setSelected(target.id);
    remember(target);
  }, [requested, roster?.teammates]);
  /** `step` opens a named tab (for example the Access tab from a plan card's "Choose access"). */
  const configure = (agent?: Teammate, step?: SetupStep) => {
    Keyboard.dismiss();
    if (!agent) {
      setSetupVisible(false);
      setCreationVisited(true);
      setCreating(true);
      return;
    }
    const key = `${agent.id}:${agent.revision}`;
    setSetup((current) => {
      const nonce = (current?.nonce ?? 0) + (step ? 1 : 0);
      return current?.key === key ? (step ? { ...current, step, nonce } : current) : { key, agent, step, nonce };
    });
    setSetupVisible(true);
  };
  const saved = (agent: Teammate) => {
    adopt(agent);
    setSetupVisible(false);
    setSetup(null);
    setCreating(false);
    setCreationVisited(false);
    open(agent);
  };
  /** Leaves any teammate, setup or creation view for the list (the activity feed opens over it). */
  const clear = () => {
    Keyboard.dismiss();
    setSetupVisible(false);
    setSelected(null);
    setCreating(false);
  };
  /** A starter just created this teammate (profile only): open its Access tab to tick what it may use. */
  const templated = (agent: Teammate) => {
    adopt(agent);
    setCreating(false);
    setCreationVisited(false);
    setSelected(agent.id);
    remember(agent);
    configure(agent, 'tools');
  };
  const back = () => {
    Keyboard.dismiss();
    if (setupVisible) setSetupVisible(false);
    else {
      setSelected(null);
      setCreating(false);
      void refresh();
    }
  };
  return {
    selected,
    visited,
    setup,
    creating,
    creationVisited,
    setupVisible,
    setSetupVisible,
    open,
    configure,
    saved,
    back,
    clear,
    templated,
  };
}
