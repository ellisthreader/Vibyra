import { useCallback } from "react";

import { answerAgentPrompt } from "../../lib/agentPromptScan";
import { runNotificationAction } from "../../lib/notificationActions";
import { notifyPromptUnanswered } from "../../lib/notificationTriggers";
import { timeoutFor } from "../../lib/notificationTiers.ts";
import { setTimersPaused, useNotificationStore } from "../../state/notificationStore";
import { useWorkspaceStore } from "../../state/workspaceStore";
import type { AgentPromptOption, NotificationItem } from "../../notificationTypes";
import { ToastStack } from "./ToastStack";

/** Connects the presentational stack to the store. The stack itself stays
 * prop-driven so it can be rendered from a fixture. */
export function Toasts() {
  const items = useNotificationStore((state) => state.visible);
  const overflow = useNotificationStore((state) => state.overflow);
  const dismiss = useNotificationStore((state) => state.dismiss);

  const onAction = useCallback((item: NotificationItem) => {
    if (item.action) runNotificationAction(item.action);
    dismiss(item.id);
  }, [dismiss]);

  const onAnswer = useCallback(
    (item: NotificationItem, option: AgentPromptOption) => {
      if (!item.prompt) return;
      // The guard lives in `answerAgentPrompt`, not here: this component cannot
      // know whether the pane still shows the question it drew a button for.
      const outcome = answerAgentPrompt(item.prompt, option);
      dismiss(item.id);
      if (outcome !== "sent") notifyPromptUnanswered(item.prompt.sessionId, outcome);
    },
    [dismiss],
  );

  const onOpenSettings = useCallback((item: NotificationItem) => {
    dismiss(item.id);
    useNotificationStore.getState().setCentreOpen(false);
    useWorkspaceStore.getState().openSettingsSection("notifications");
  }, [dismiss]);

  const openOverflow = useCallback(() => {
    useNotificationStore.getState().setCentreOpen(true);
  }, []);

  const lifetime = useCallback(
    (item: NotificationItem) => item.timeoutMs ?? timeoutFor(item.tier),
    [],
  );

  if (items.length === 0) return null;

  return (
    <ToastStack
      items={items}
      overflow={overflow}
      onDismiss={dismiss}
      onAction={onAction}
      onAnswer={onAnswer}
      onOpenSettings={onOpenSettings}
      onOpenOverflow={openOverflow}
      onHoverChange={setTimersPaused}
      timeoutFor={lifetime}
    />
  );
}
