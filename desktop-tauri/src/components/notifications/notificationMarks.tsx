// The single source of the notification visual language.
//
// Tier is carried by a small `.nmark` glyph plus a hairline rail — never by
// tinting the whole card, which would break the 90 / 8 / 2 graphite-cobalt-
// status ratio and read badly on the light `--elevated`. Kind is carried by
// the chip above the title: an icon and two words, so a permission request and
// a released model stop looking like the same notice.
import type { ComponentType } from "react";

import { TIER_LABELS } from "../../lib/notificationTiers.ts";
import type { NotificationKind, NotificationTier } from "../../notificationTypes";
import { BotIcon, EyeIcon, FolderIcon, SparklesIcon, UserIcon } from "../common/Icons";
import {
  AppIcon,
  AskIcon,
  BusyIcon,
  CoinIcon,
  DangerIcon,
  DownloadIcon,
  GaugeIcon,
  InfoIcon,
  KeyIcon,
  SuccessIcon,
  WarnIcon,
} from "../common/StatusIcons";

export type Glyph = ComponentType<{ size?: number }>;

export interface TierMark {
  Icon: Glyph;
  /** Full class list for the mark element, e.g. `nmark nmark--fail`. */
  className: string;
  /** How the tier reads on the chip, beside the kind. */
  label: string;
}

const TIER_GLYPHS: Record<NotificationTier, Glyph> = {
  ask: AskIcon,
  fail: DangerIcon,
  risk: WarnIcon,
  busy: BusyIcon,
  done: SuccessIcon,
  news: InfoIcon,
};

export function markFor(tier: NotificationTier): TierMark {
  return {
    Icon: TIER_GLYPHS[tier],
    className: `nmark nmark--${tier}`,
    label: TIER_LABELS[tier],
  };
}

export interface KindMark {
  Icon: Glyph;
  label: string;
}

const KIND: Record<NotificationKind, KindMark> = {
  agent: { Icon: BotIcon, label: "Agent" },
  approval: { Icon: KeyIcon, label: "Approval" },
  update: { Icon: DownloadIcon, label: "Update" },
  account: { Icon: UserIcon, label: "Account" },
  spend: { Icon: CoinIcon, label: "Spend" },
  performance: { Icon: GaugeIcon, label: "Performance" },
  preview: { Icon: EyeIcon, label: "Preview" },
  models: { Icon: SparklesIcon, label: "Models" },
  project: { Icon: FolderIcon, label: "Project" },
  app: { Icon: AppIcon, label: "Vibyra" },
};

export function kindMark(kind: NotificationKind): KindMark {
  return KIND[kind];
}
