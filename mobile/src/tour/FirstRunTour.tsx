import { useMemo } from 'react';
import type { WorkspaceModel } from '../ui/types';
import { TourStage } from './TourStage';
import { tourSteps } from './tourSteps';
import { useFirstRunTour } from './useFirstRunTour';

/**
 * The walkthrough's place in the workspace: it opens by itself the first time
 * someone reaches the home screen from the welcome flow, and whenever it is asked
 * for from Settings. It waits while anything covers the home screen — the connect
 * sheet, a new project, the menu, Settings, Agents — so it never draws over them,
 * and appears once the screen it points at is actually showing.
 */
export function FirstRunTour({ workspace, connected, agentsAvailable, blocked, home, onPrepare }: {
  workspace: WorkspaceModel; connected: boolean; agentsAvailable: boolean; blocked: boolean;
  home: boolean; onPrepare(): void;
}) {
  const { open, close } = useFirstRunTour(workspace, onPrepare);
  const steps = useMemo(() => tourSteps({ connected, agentsAvailable }), [connected, agentsAvailable]);
  if (!open || blocked || !home) return null;
  return <TourStage steps={steps} workspace={workspace} onClose={close} />;
}
