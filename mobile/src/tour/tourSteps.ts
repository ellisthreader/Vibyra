import type { TourTargetId } from './tourTargets';

export type TourScene = 'terminal' | 'funding' | 'connect';
interface Copy { title: string; body: string }
/** A stop that lights one real control on the home screen. */
export interface TargetStep extends Copy { kind: 'target'; target: TourTargetId }
/** A stop that shows one of the real screens beyond the home, on sample data. */
export interface SceneStep extends Copy { kind: 'scene'; scene: TourScene }
export type TourStep = TargetStep | SceneStep;

/**
 * The walkthrough, in order. Each stop is a title and one sentence that fits two
 * lines on a phone, so the card keeps the same height from stop to stop. A stop
 * whose control is not on screen (Agents off for this account, say) is left out.
 */
export function tourSteps({ connected, agentsAvailable }: { connected: boolean; agentsAvailable: boolean }): TargetStep[] {
  return [
    { kind: 'target', target: 'menu', title: 'Everything starts here',
      body: 'Your chats, projects and terminals live in this menu, along with Settings.' },
    ...(agentsAvailable ? [{ kind: 'target' as const, target: 'mode' as const, title: 'Two ways to work',
      body: 'Code is for projects and terminals. Agents are AI teammates you hand a task.' }] : []),
    connected
      ? { kind: 'target', target: 'start', title: 'Jump into a project',
        body: 'Open a project on your computer, or start one. It runs there — you steer here.' }
      : { kind: 'target', target: 'start', title: 'Bring your computer along',
        body: 'Pair Vibyra Desktop to see your projects and terminals on this phone.' },
  ];
}

/** After the home stops, the walkthrough opens the real screens on sample data; nothing on them can launch or save. */
export const sceneSteps: SceneStep[] = [
  { kind: 'scene', scene: 'terminal', title: 'Start a terminal in a tap',
    body: 'Choose an AI, or a plain terminal, and how much it may do. Nothing launches here.' },
  { kind: 'scene', scene: 'funding', title: 'Your AI, or ours',
    body: 'Use accounts you’ve connected, or spend Vibyra tokens from your balance (Pro).' },
  { kind: 'scene', scene: 'connect', title: 'See it live',
    body: 'Connect Vibyra Desktop once, then open any project’s Live Preview right here.' },
];

/** The most a stop's sentence may run; longer would wrap to a third line and make the card jump. */
export const BODY_LIMIT = 90;
