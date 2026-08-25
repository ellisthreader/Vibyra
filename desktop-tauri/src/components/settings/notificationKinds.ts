import type { NotificationKind } from "../../notificationTypes";

export interface KindDescriptor {
  id: NotificationKind;
  label: string;
  hint: string;
  /** Kinds that cannot reach the operating system hide the "desktop" choice. */
  osCapable: boolean;
  /** Two kinds cannot be silenced individually: a decision nobody is told about
   * looks like a hung app, and an app that fails quietly looks broken. The
   * master switch above still turns them off. */
  locked?: boolean;
}

/**
 * The rows of Settings → Notifications, in the order they are read.
 *
 * Ordered by how much they can cost you to miss, not alphabetically and not by
 * how often they fire — a spend cap you did not see is worse than four preview
 * restarts you did.
 */
export const KIND_DESCRIPTORS: KindDescriptor[] = [
  {
    id: "approval",
    label: "Needs your permission",
    hint: "An agent is waiting on an answer, or Vibyra needs a grant from your desktop.",
    osCapable: true,
    locked: true,
  },
  {
    id: "agent",
    label: "Agent runs",
    hint: "A run finished on its own, exited with an error, or could not start.",
    osCapable: true,
  },
  {
    id: "update",
    label: "Updates",
    hint: "A new version of Vibyra is available, downloading, or waiting on a restart.",
    osCapable: true,
  },
  {
    id: "account",
    label: "Accounts",
    hint: "A sign-in expired, or a connected provider stopped answering.",
    osCapable: true,
  },
  {
    id: "spend",
    label: "Spend limits",
    hint: "You are approaching a daily or monthly cap on your own key.",
    osCapable: true,
  },
  {
    id: "preview",
    label: "Preview",
    hint: "A project preview started, or its dev server stopped.",
    osCapable: false,
  },
  {
    id: "performance",
    label: "Performance",
    hint: "Your machine is under load and Vibyra may feel slow. Never sent to the desktop.",
    osCapable: false,
  },
  {
    id: "project",
    label: "Projects",
    hint: "A workspace was restored, or a pane could not continue where it left off.",
    osCapable: false,
  },
  {
    id: "models",
    label: "New models",
    hint: "A model you can pick has been released.",
    osCapable: false,
  },
  {
    id: "app",
    label: "App problems",
    hint: "Failures Vibyra cannot recover from on its own.",
    osCapable: false,
    locked: true,
  },
];
