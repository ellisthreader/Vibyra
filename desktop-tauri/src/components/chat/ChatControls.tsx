import { useCallback } from 'react';
import { AgentLogo } from '../common/AgentLogo';
import { useModelCatalogStore } from '../../state/modelCatalogStore';
import { AccessIcon } from './AccessIcon';
import { ChatAccessMenu } from './ChatAccessMenu';
import { ChatChip } from './ChatChip';
import { ChatEffortMenu } from './ChatEffortMenu';
import { ChatModelSwitcher } from './ChatModelSwitcher';
import { EffortBars } from './EffortBars';
import { accessWords, type ChatAccess } from './useChatAccess';
import { effortWords, type ChatModels } from './useChatModels';
import type { ChatCompany, CompanyModel } from './useCompanyModels';

export type ChatMenu = 'model' | 'effort' | 'access';

/** A saved chat only knows its model id ("gpt-6-astra"); the catalogue knows its name. */
function useModelLabel(name: string) {
  const groups = useModelCatalogStore(state => state.groups);
  if (!/^[a-z0-9.-]+$/.test(name)) return name;
  const found = (groups ?? []).flatMap(group => group.models).find(model => model.id.split('/').pop()?.replace(/\./g, '-') === name.replace(/\./g, '-'));
  return found?.label ?? name;
}

/**
 * The composer's settings row, left to right: the model (and company), how
 * hard it thinks, and what it may do without asking. Each opens its own menu.
 */
export function ChatControls({ models, access, companies, open, disabled, onOpen, onSwitch }: {
  models: ChatModels; access: ChatAccess; companies: ChatCompany[]; open: ChatMenu | null; disabled: boolean;
  onOpen(menu: ChatMenu | null): void; onSwitch(target: CompanyModel): Promise<boolean>;
}) {
  const close = useCallback(() => onOpen(null), [onOpen]);
  const toggle = (menu: ChatMenu) => onOpen(open === menu ? null : menu);
  const label = useModelLabel(models.name);
  const { ladder, effort, managed } = models;
  const level = managed ? 'Auto' : ladder.length || (effort && effort !== 'none') ? effortWords(effort).label : 'Default';
  const words = accessWords(access.level, access.provider);
  return <div className="chat-controls">
    <ChatChip title="Model" label={label} open={open === 'model'} disabled={disabled} onDismiss={close} onOpen={() => toggle('model')}
      icon={<AgentLogo agentId={models.agent.id} name={models.vendor} size={16} className="chat-chip__logo" />}
      menu={<ChatModelSwitcher models={models} companies={companies} onClose={close} onSwitch={onSwitch} />} />
    <ChatChip title="Thinking effort" label={level} open={open === 'effort'} disabled={disabled} onDismiss={close} onOpen={() => toggle('effort')}
      icon={<EffortBars index={managed ? -1 : ladder.indexOf(effort ?? '')} count={ladder.length} />}
      menu={<ChatEffortMenu models={models} onClose={close} />} />
    <ChatChip title="Access" label={words.label} open={open === 'access'} disabled={disabled} onDismiss={close} onOpen={() => toggle('access')}
      align="end" tone={access.level === 'full' ? 'warn' : undefined} icon={<AccessIcon level={access.level} />}
      menu={<ChatAccessMenu access={access} onClose={close} />} />
  </div>;
}
