import { appApiRequest } from "./appApi";
import type { ReferralSummaryResponse } from "./appApi";

export function fetchReferralSummary(authToken: string) {
  return appApiRequest<ReferralSummaryResponse>("/api/referrals/me", undefined, authToken);
}
