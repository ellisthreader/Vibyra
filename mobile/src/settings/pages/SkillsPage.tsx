import { SkillsSheetBody } from '../../agents/SkillsSheetBody';
import { useSkillsSheet } from '../../agents/useSkillsSheet';
import { useRoster } from '../../agents/useRoster';
import type { AgentsApi } from '../../agents/types';
import { EmptyState, Hint } from '../../ui/primitives';
import type { SettingsPageProps } from '../pages';
export function SkillsPage({ routes, workspace }: SettingsPageProps) {
  return routes.agents && (workspace.account || workspace.demo)
    ? <SkillLibrary key={routes.agents.identity} {...routes.agents} />
    : <EmptyState icon="sparkles-outline" title="Skills unavailable" detail="Sign in to manage your teammates’ skills." />;
}
function SkillLibrary({ api, identity }: { api: AgentsApi; identity: string }) {
  const state = useSkillsSheet(true, api, identity);
  const { roster, error } = useRoster(api, true);
  return <>{error && <Hint error>{error}</Hint>}<SkillsSheetBody {...state} teammates={roster?.teammates ?? []} /></>;
}
