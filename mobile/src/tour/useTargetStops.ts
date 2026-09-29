import { useEffect, useState } from 'react';
import type { RefObject } from 'react';
import type { View } from 'react-native';
import type { Rect, Size } from './tourLayout';
import type { TargetStep } from './tourSteps';
import { measureTarget } from './tourTargets';

export interface TargetStop { step: TargetStep; rect: Rect }

/**
 * Finds where each stop's real control is on screen, relative to the overlay. Native
 * layout can register the header before the scroll view's rows, so it waits, a few
 * times, for the whole home surface before fixing the stop count for this opening.
 * Stops whose control is not on screen are left out; with none at all it closes.
 */
export function useTargetStops(steps: TargetStep[], root: RefObject<View | null>, screen: Size, onClose: () => void) {
  const [stops, setStops] = useState<TargetStop[] | null>(null);
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const measure = (attempt: number) => root.current?.measureInWindow(async (ox, oy) => {
      const found = await Promise.all(steps.map(async step => ({ step, rect: await measureTarget(step.target) })));
      if (!active) return;
      if (found.some(({ rect }) => !rect) && attempt < 7) {
        timer = setTimeout(() => measure(attempt + 1), 140);
        return;
      }
      const live = found.flatMap(({ step, rect }) => rect ? [{ step, rect: { ...rect, x: rect.x - ox, y: rect.y - oy } }] : []);
      if (live.length) setStops(live); else onClose();
    });
    timer = setTimeout(() => measure(0), 60);
    return () => { active = false; clearTimeout(timer); };
  }, [steps, root, screen.width, screen.height, onClose]);
  return stops;
}
