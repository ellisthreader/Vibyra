import { useNotificationStore } from "../state/notificationStore";
import type { RendererPolicy } from "../types";

let announced = false;

/** Says once per process that startup moved a promoted NVIDIA "accelerated"
 * mode back to Automatic — the user should know why the choice changed under
 * them, and that it is theirs to change back. */
export function announceRendererHeal(policy: RendererPolicy): void {
  if (!policy.healedThisLaunch || announced) return;
  announced = true;
  useNotificationStore.getState().push({
    category: "performance",
    severity: "info",
    title: "Graphics set back to Automatic",
    body: "GPU mode was slowing this NVIDIA system down and made typing lag. Automatic is the fast path here; change it any time in Settings → Performance.",
    dedupeKey: "perf:renderer-healed",
    osEligible: false,
  });
}
