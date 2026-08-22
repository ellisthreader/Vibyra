// The single source of the notification visual language. Severity is carried
// by a small `.nmark` glyph plus a hairline rail — never by tinting the whole
// card, which would break the 90 / 8 / 2 graphite-cobalt-status ratio and read
// badly on the light `--elevated`.
import type { ComponentType } from "react";

import type { NotificationCategory, NotificationSeverity } from "../../notificationTypes";
import { BotIcon, EyeIcon, SparklesIcon } from "../common/Icons";
import {
  AppIcon,
  CoinIcon,
  DangerIcon,
  GaugeIcon,
  InfoIcon,
  SuccessIcon,
  WarnIcon,
} from "../common/StatusIcons";

export type Glyph = ComponentType<{ size?: number }>;

export interface SeverityMark {
  Icon: Glyph;
  /** Full class list for the mark element, e.g. `nmark nmark--danger`. */
  className: string;
}

const SEVERITY: Record<NotificationSeverity, Glyph> = {
  info: InfoIcon,
  success: SuccessIcon,
  warning: WarnIcon,
  danger: DangerIcon,
};

export function markFor(severity: NotificationSeverity): SeverityMark {
  return { Icon: SEVERITY[severity], className: `nmark nmark--${severity}` };
}

export interface CategoryMark {
  Icon: Glyph;
  label: string;
}

const CATEGORY: Record<NotificationCategory, CategoryMark> = {
  agentAttention: { Icon: BotIcon, label: "Agent" },
  agentDone: { Icon: BotIcon, label: "Agent" },
  agentFailed: { Icon: BotIcon, label: "Agent" },
  performance: { Icon: GaugeIcon, label: "Performance" },
  preview: { Icon: EyeIcon, label: "Preview" },
  aiSpend: { Icon: CoinIcon, label: "AI usage" },
  models: { Icon: SparklesIcon, label: "Models" },
  system: { Icon: AppIcon, label: "Vibyra" },
};

export function categoryMark(category: NotificationCategory): CategoryMark {
  return CATEGORY[category];
}

/** Warnings and failures interrupt; good news waits its turn. */
export function isLoud(severity: NotificationSeverity): boolean {
  return severity === "warning" || severity === "danger";
}
