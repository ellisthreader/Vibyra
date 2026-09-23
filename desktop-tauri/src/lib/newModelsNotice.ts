interface ModelNoticeCampaign {
  id: string;
  latestReleaseDate: string;
}

// Advance this campaign only with a reviewed, launchable major-model rollout.
// The window follows the catalog's 45-day New badge after the latest release.
export const MODEL_NOTICE_CAMPAIGN: ModelNoticeCampaign = {
  id: "2026-09-gpt-6-claude-opus-5-5",
  latestReleaseDate: "2026-09-22",
};

const NOTICE_WINDOW_MS = 45 * 24 * 60 * 60 * 1000;
const LEGACY_KEY = "vibyra.desktop.newModels2026.hidden";
const LEGACY_CAMPAIGN_ID = "2026-09-gpt-6-claude-opus-5-5";
const keyFor = (id: string) => `vibyra.desktop.modelNotice.${id}.hidden`;

interface NoticeStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
}

function browserStorage(): NoticeStorage | null {
  try { return globalThis.localStorage ?? null; } catch { return null; }
}

export function newModelsNoticeHidden(
  campaign: ModelNoticeCampaign = MODEL_NOTICE_CAMPAIGN,
  storage: NoticeStorage | null = browserStorage(),
  now = Date.now(),
): boolean {
  const releasedAt = Date.parse(`${campaign.latestReleaseDate}T00:00:00Z`);
  if (!Number.isFinite(releasedAt) || now < releasedAt || now >= releasedAt + NOTICE_WINDOW_MS) return true;
  try {
    return storage?.getItem(keyFor(campaign.id)) === "true" ||
      (campaign.id === LEGACY_CAMPAIGN_ID && storage?.getItem(LEGACY_KEY) === "true");
  } catch {
    return false;
  }
}

export function hideNewModelsNotice(
  campaign: ModelNoticeCampaign = MODEL_NOTICE_CAMPAIGN,
  storage: NoticeStorage | null = browserStorage(),
): void {
  try {
    storage?.setItem(keyFor(campaign.id), "true");
  } catch {
    // A blocked storage write only means the notice can return next launch.
  }
}
