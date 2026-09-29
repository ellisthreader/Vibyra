import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import type { WorkspaceModel } from '../ui/types';
import type { PreviewListing } from './useLivePreviewTarget';
import { autoOpenRow, claimRunOpen, requestRunOpen, runWindowTarget } from './runOpen';

/** When a run this phone started (or approved) opens its window, show it once.
 *  The listing is already scoped to the visible project, so a late row for a
 *  project the person has left never opens here. */
export function useRunAutoOpen(workspace: WorkspaceModel, listing: PreviewListing, onOpen: () => void, active = true) {
  const openRef = useRef(onOpen);
  openRef.current = onOpen;
  const listingRef = useRef(listing);
  listingRef.current = listing;
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => setForeground(state === 'active'));
    return () => subscription.remove();
  }, []);
  const row = autoOpenRow(listing.runnables);
  const key = row ? `${row.projectId}:${row.runId}:${row.windowGrantId}` : '';
  useEffect(() => {
    if (!key || !active || !foreground || workspace.status !== 'connected' || !workspace.previewRunAvailable) return;
    const current = autoOpenRow(listingRef.current.runnables);
    if (!current?.runId || !claimRunOpen(current.runId)) return;
    requestRunOpen(runWindowTarget(current, listingRef.current.targets));
    openRef.current();
  }, [key, active, foreground, workspace.status, workspace.previewRunAvailable]);
}
