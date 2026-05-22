import { appApiRequest } from "./appApi";

type CommunityModerationResponse = {
  ok: boolean;
  moderation: {
    blocked: boolean;
    warning?: string | null;
  };
};

export async function moderateCommunityComment(authToken: string, text: string) {
  return appApiRequest<CommunityModerationResponse>(
    "/api/moderation",
    { method: "POST", body: JSON.stringify({ surface: "community.comment", text }) },
    authToken
  );
}
