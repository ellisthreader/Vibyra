import type { ReleasedModel } from "../ipc/models";
import type { NotificationInput } from "../notificationTypes";

export function modelReleaseNotice(model: ReleasedModel): NotificationInput {
  return {
    category: "models",
    severity: "info",
    title: "New model released",
    body: `${model.name} · ${model.id}`,
    dedupeKey: `model:${model.id}`,
    osEligible: false,
  };
}
