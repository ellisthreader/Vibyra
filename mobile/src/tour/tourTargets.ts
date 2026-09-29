import { useCallback } from 'react';
import type { View } from 'react-native';

/** The real controls the walkthrough can point at. */
export type TourTargetId = 'menu' | 'mode' | 'start';
export interface TargetRect { x: number; y: number; width: number; height: number }

const targets = new Map<TourTargetId, View>();

/**
 * Marks a real on-screen control as a walkthrough stop: put the returned ref on
 * its View (with `collapsable={false}`). The walkthrough measures it where it
 * actually is, so it points at the live app rather than a picture of it.
 */
export function useTourTarget(id: TourTargetId) {
  return useCallback((node: View | null) => {
    if (node) targets.set(id, node);
    else targets.delete(id);
  }, [id]);
}

/** Where a target is on screen right now, or null when it is not mounted or not showing. */
export function measureTarget(id: TourTargetId): Promise<TargetRect | null> {
  const node = targets.get(id);
  if (!node) return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      node.measureInWindow((x, y, width, height) =>
        resolve(width > 0 && height > 0 ? { x, y, width, height } : null));
    } catch {
      resolve(null);
    }
  });
}
