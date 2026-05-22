import { readStorageItem, readStorageItemSync, writeStorageItem } from "../../../utils/nativeStorage";

const COMMUNITY_REACTIONS_KEY = "vibyra.community.reactions.v1";

export type CommunityReactionState = {
  bookmarkedPostIds: string[];
  likedPostIds: string[];
};

const emptyCommunityReactionState: CommunityReactionState = {
  bookmarkedPostIds: [],
  likedPostIds: []
};

export function loadCommunityReactions(): CommunityReactionState {
  return parseCommunityReactions(readStorageItemSync(COMMUNITY_REACTIONS_KEY));
}

export async function loadCommunityReactionsAsync(): Promise<CommunityReactionState> {
  return parseCommunityReactions(await readStorageItem(COMMUNITY_REACTIONS_KEY));
}

export async function saveCommunityReactions(state: CommunityReactionState) {
  try {
    await writeStorageItem(COMMUNITY_REACTIONS_KEY, JSON.stringify({
      bookmarkedPostIds: normalizeIdList(state.bookmarkedPostIds),
      likedPostIds: normalizeIdList(state.likedPostIds)
    }));
  } catch {
    // Explore reactions should keep working even when local persistence is unavailable.
  }
}

function parseCommunityReactions(raw: string | null): CommunityReactionState {
  try {
    if (!raw) return emptyCommunityReactionState;
    const parsed = JSON.parse(raw) as Partial<CommunityReactionState>;
    return {
      bookmarkedPostIds: normalizeIdList(parsed.bookmarkedPostIds),
      likedPostIds: normalizeIdList(parsed.likedPostIds)
    };
  } catch {
    return emptyCommunityReactionState;
  }
}

function normalizeIdList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map((id) => String(id).trim()).filter(Boolean))).slice(-500);
}
