import type { DeepResearchPlanDraft } from "../types/chatTools";
import { appApiRequest } from "./appApi";

type ResearchPlanResponse = {
  ok: boolean;
  steps: string[];
  title: string;
};

export async function createDeepResearchPlan(authToken: string, prompt: string): Promise<DeepResearchPlanDraft> {
  const response = await appApiRequest<ResearchPlanResponse>("/api/chat/research-plan", {
    method: "POST",
    body: JSON.stringify({ prompt })
  }, authToken);

  return {
    title: response.title,
    steps: response.steps
  };
}
