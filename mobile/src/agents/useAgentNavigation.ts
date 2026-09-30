import { useEffect, useRef, useState } from 'react';
import { Keyboard } from 'react-native';
import type { Roster, Teammate } from './types';

/** One selected teammate and a bounded cache of mounted conversations. */
export function useAgentNavigation(
  roster: Roster | null,
  requested: { id: string; nonce: number } | undefined,
  adopt: (agent: Teammate) => void,
  refresh: () => Promise<void>,
) {
  const [selected, setSelected] = useState<string | null>(null);
  const [visited, setVisited] = useState<string[]>([]);
  const [setup, setSetup] = useState<{ agent: Teammate; key: string } | null>(null);
  const [creating, setCreating] = useState(false);
  const [creationVisited, setCreationVisited] = useState(false);
  const [setupVisible, setSetupVisible] = useState(false);
  const handled = useRef<number | null>(null);
  const remember = (id: string) =>
    setVisited((ids) => [...ids.filter((old) => old !== id).slice(-2), id]);
  const open = (agent: Teammate) => {
    Keyboard.dismiss();
    setSetupVisible(false);
    setCreating(false);
    setSelected(agent.id);
    remember(agent.id);
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
    remember(target.id);
  }, [requested, roster?.teammates]);
  const configure = (agent?: Teammate) => {
    Keyboard.dismiss();
    if (!agent) {
      setSetupVisible(false);
      setCreationVisited(true);
      setCreating(true);
      return;
    }
    const key = `${agent.id}:${agent.revision}`;
    setSetup((current) => (current?.key === key ? current : { key, agent }));
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
  };
}
