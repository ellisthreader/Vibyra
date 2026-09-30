import type { NotificationCategory, NotificationSeverity } from "../../notificationTypes";

export interface CategoryDescriptor {
  id: NotificationCategory;
  label: string;
  /** Only where the label does not carry the consequence on its own. Most
   * event names explain themselves, and a hint under each of nine rows turns
   * a scannable list into a wall. */
  hint?: string;
  /** Colours the row's mark. The same severity the event actually arrives
   * with, so the list is a legend for the bell. */
  tone: NotificationSeverity;
  /** Categories that cannot reach the operating system hide the "system" choice. */
  osCapable: boolean;
  /** App errors cannot be silenced individually — an app that fails quietly just
   * looks broken. The master switch above still turns them off. */
  locked?: boolean;
}

export const CATEGORY_DESCRIPTORS: CategoryDescriptor[] = [
  {
    id: "agentDone",
    tone: "success",
    label: "Agent finished",
    hint: "A run ended on its own, cleanly.",
    osCapable: true,
  },
  {
    id: "agentFailed",
    tone: "danger",
    label: "Agent failed",
    hint: "A run exited with an error, or could not start.",
    osCapable: true,
  },
  {
    id: "agentAttention",
    tone: "info",
    label: "Agent needs you",
    hint: "A run is waiting on an answer before it can carry on.",
    osCapable: true,
  },
  {
    id: "aiSpend",
    tone: "warning",
    label: "Spend limits",
    hint: "You are approaching a daily or monthly cap on your own key.",
    osCapable: true,
  },
  {
    id: "performance",
    tone: "warning",
    label: "Performance",
    hint: "Your machine is under load and Vibyra may feel slow. Never sent to the desktop.",
    osCapable: false,
  },
  {
    id: "preview",
    tone: "info",
    label: "Preview",
    hint: "A project preview started, or its dev server stopped.",
    osCapable: false,
  },
  {
    id: "models",
    tone: "info",
    label: "New models",
    hint: "OpenRouter has added a model. Availability in Vibyra varies.",
    osCapable: false,
  },
  {
    id: "appUpdate",
    tone: "info",
    label: "Vibyra updates",
    hint: "A new version of Vibyra is ready to install.",
    osCapable: true,
  },
  {
    id: "system",
    tone: "danger",
    label: "App problems",
    hint: "Failures Vibyra cannot recover from on its own.",
    osCapable: false,
    locked: true,
  },
];
