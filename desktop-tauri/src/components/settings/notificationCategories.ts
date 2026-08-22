import type { NotificationCategory } from "../../notificationTypes";

export interface CategoryDescriptor {
  id: NotificationCategory;
  label: string;
  hint: string;
  /** Categories that cannot reach the operating system hide the "system" choice. */
  osCapable: boolean;
  /** App errors cannot be silenced individually — an app that fails quietly just
   * looks broken. The master switch above still turns them off. */
  locked?: boolean;
}

export const CATEGORY_DESCRIPTORS: CategoryDescriptor[] = [
  {
    id: "agentDone",
    label: "Agent finished",
    hint: "A run ended on its own, cleanly.",
    osCapable: true,
  },
  {
    id: "agentFailed",
    label: "Agent failed",
    hint: "A run exited with an error, or could not start.",
    osCapable: true,
  },
  {
    id: "agentAttention",
    label: "Agent needs you",
    hint: "A run is waiting on an answer before it can carry on.",
    osCapable: true,
  },
  {
    id: "aiSpend",
    label: "Spend limits",
    hint: "You are approaching a daily or monthly cap on your own key.",
    osCapable: true,
  },
  {
    id: "performance",
    label: "Performance",
    hint: "Your machine is under load and Vibyra may feel slow. Never sent to the desktop.",
    osCapable: false,
  },
  {
    id: "preview",
    label: "Preview",
    hint: "A project preview started, or its dev server stopped.",
    osCapable: false,
  },
  {
    id: "models",
    label: "New models",
    hint: "A model you can pick has been released.",
    osCapable: false,
  },
  {
    id: "system",
    label: "App problems",
    hint: "Failures Vibyra cannot recover from on its own.",
    osCapable: false,
    locked: true,
  },
];
