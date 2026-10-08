import { useEffect, useMemo } from 'react';
import type { CatalogModel } from '../../lib/openRouterCatalog';
import { planRunner } from '../../lib/modelRunners';
import { useAgentStore } from '../../state/agentStore';
import { useModelCatalogStore } from '../../state/modelCatalogStore';
import { useSettingsStore } from '../../state/settingsStore';
import type { ResolvedAgent } from '../../types';
import { conversationAgent } from '../../lib/conversationAgent';

/** The AI companies a chat can run on, in menu order. */
const CHAT_COMPANIES = [
  { agentId: 'codex', company: 'OpenAI' },
  { agentId: 'claude', company: 'Anthropic' },
  { agentId: 'gemini', company: 'Google' },
] as const;

export interface CompanyModel { model: CatalogModel; runner: ResolvedAgent; launchModel: string }
export interface ChatCompany { agentId: string; company: string; name: string; models: CompanyModel[]; blocked: string }

const NO_IDS: string[] = [];

/**
 * Every company a chat can switch to, with the catalogue models this Mac can
 * launch for it. A company that is not set up keeps its honest reason, so the
 * switcher can say what to do instead of hiding it.
 */
export function useCompanyModels(): ChatCompany[] {
  const groups = useModelCatalogStore(state => state.groups);
  const refresh = useModelCatalogStore(state => state.refresh);
  const agents = useAgentStore(state => state.agents);
  const enabled = useSettingsStore(state => state.settings?.enabledAgentIds ?? NO_IDS);
  useEffect(() => { void refresh(); }, [refresh]);
  return useMemo(() => CHAT_COMPANIES.map(({ agentId, company }) => {
    const plans = ((groups ?? []).find(group => group.company === company)?.models ?? [])
      .map(model => ({ model, plan: planRunner(model, agents ?? [], enabled ?? []) }));
    const models = plans.filter(({ plan }) => plan.runner?.id === agentId && plan.launchModel)
      .map(({ model, plan }) => ({ model, runner: plan.runner!, launchModel: plan.launchModel! }));
    const name = (agents ?? []).find(agent => agent.id === agentId)?.name ?? conversationAgent(agentId).name;
    const reason = plans.find(({ plan }) => plan.blocked)?.plan.blocked.replace(new RegExp(`\\b${agentId}\\b`), name);
    return { agentId, company, name, models, blocked: models.length ? '' : reason ?? `No ${company} models are available on this Mac.` };
  }), [groups, agents, enabled]);
}
