import { createContext, useContext } from 'react';
import { hostNoun } from '../ui/hostIdentity';
import type { WorkspaceModel } from '../ui/types';

export type HostNoun = ReturnType<typeof hostNoun>;
/** The Preview sheet says which computer it talks to; its pages read it here. */
export const PreviewHostNounContext = createContext<HostNoun>('computer');
export const usePreviewHostNoun = () => useContext(PreviewHostNounContext);

/** The noun from this host's last Preview list; “computer” until one arrives. */
export function previewHostNoun(workspace: Pick<WorkspaceModel, 'host' | 'previewHost'>): HostNoun {
  const known = workspace.previewHost;
  return known && known.hostId === workspace.host?.id ? hostNoun(known.platform) : 'computer';
}
