import { useMemo, type ReactNode } from 'react';
import { groupCompanies, isNew } from '../ui/modelGroups';
import { pickerModels } from '../ui/pickerModels';
import { InlineModelPicker } from './InlineModelPicker';
import type { VibesModel } from './types';

/** The phone's curated, membership-aware catalogue in the shared inline picker. */
export function ComposerModelPicker({
  selection,
  models,
  paid,
  onSelect,
  onClose,
  onUpgrade,
  notice,
  disabled,
}: {
  selection: string;
  models: VibesModel[];
  paid: boolean;
  onSelect(id: string): void | Promise<boolean>;
  onClose(): void;
  onUpgrade?(): void;
  notice?: ReactNode;
  disabled?: boolean;
}) {
  const now = useMemo(() => Date.now(), []);
  const companies = useMemo(
    () =>
      groupCompanies(pickerModels(models), now).map((company) => ({
        vendor: company.vendor,
        name: company.name,
        models: company.models.map((model) => ({
          id: model.id,
          name: model.name,
          fresh: isNew(model, now),
          locked: !model.trial && !paid,
        })),
      })),
    [models, now, paid],
  );
  return (
    <InlineModelPicker
      selection={selection}
      companies={companies}
      onSelect={onSelect}
      onClose={onClose}
      onUpgrade={onUpgrade}
      notice={notice}
      disabled={disabled}
    />
  );
}
