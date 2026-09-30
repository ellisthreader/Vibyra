import { Sheet } from '../ui/Sheet';
import { SkillsSheetBody } from './SkillsSheetBody';
import { useSkillsSheet } from './useSkillsSheet';
import type { AgentsApi, Teammate } from './types';

type Props = {
  visible: boolean;
  api: AgentsApi;
  identity: string;
  teammates: Teammate[];
  onClose(): void;
};

export function SkillsSheet(props: Props) {
  return <SkillsSheetSession key={props.identity} {...props} />;
}

function SkillsSheetSession({ visible, api, identity, teammates, onClose }: Props) {
  const state = useSkillsSheet(visible, api, identity);
  return (
    <Sheet title="Skills" visible={visible} onClose={onClose} scroll={false}>
      <SkillsSheetBody {...state} teammates={teammates} />
    </Sheet>
  );
}
