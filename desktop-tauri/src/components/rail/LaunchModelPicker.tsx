import type { RunnerPlan } from "../../lib/modelRunners";
import type { CatalogModel, CompanyGroup } from "../../lib/openRouterCatalog";
import { ModelMark } from "../common/AgentMark";
import { ChevronDownIcon, ChevronIcon } from "../common/Icons";

export interface LaunchableModel {
  model: CatalogModel;
  group: CompanyGroup;
  plan: RunnerPlan;
}

interface LaunchModelPickerProps {
  models: LaunchableModel[];
  selected: LaunchableModel | null;
  loading: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (modelId: string) => void;
  onBrowseAll: () => void;
  onConnectAccounts: () => void;
}

export function LaunchModelPicker({
  models,
  selected,
  loading,
  open,
  onOpenChange,
  onSelect,
  onBrowseAll,
  onConnectAccounts,
}: LaunchModelPickerProps) {
  return (
    <div className="launch-model">
      <button
        type="button"
        className={`launch-model__current${!selected && !loading ? " launch-model__current--connect" : ""}`}
        aria-label={selected ? "Choose model" : loading ? "Finding AI models" : "Connect your AI accounts"}
        aria-haspopup={selected ? "listbox" : undefined}
        aria-expanded={selected ? open : undefined}
        disabled={loading}
        onClick={() => selected ? onOpenChange(!open) : onConnectAccounts()}
      >
        {selected ? (
          <>
            <ModelMark
              modelId={selected.model.id}
              label={selected.model.label}
              providerKey={selected.group.providerKey}
              accent={selected.group.accent}
              size={26}
            />
            <span className="launch-model__meta">
              <strong>{selected.model.label}</strong>
              <small>{selected.group.company} · {selected.plan.runner?.name}</small>
            </span>
          </>
        ) : (
          <span className="launch-model__meta">
            <strong>
              {loading ? "Finding AI models…" : "Connect your AI accounts"}
            </strong>
            <small>
              {loading ? "Checking installed AI tools" : "Open Settings → Integrations"}
            </small>
          </span>
        )}
        {selected ? <ChevronDownIcon size={12} /> : !loading ? <ChevronIcon size={12} /> : null}
      </button>
      {open && selected && (
        <>
          <div className="launch-model__backdrop" onClick={() => onOpenChange(false)} />
          <div className="launch-model__menu" role="listbox" aria-label="Model">
            {models.map(({ model, group }) => (
              <button
                key={model.id}
                type="button"
                role="option"
                aria-selected={model.id === selected.model.id}
                className={`launch-model__option${model.id === selected.model.id ? " launch-model__option--active" : ""}`}
                onClick={() => onSelect(model.id)}
              >
                <ModelMark
                  modelId={model.id}
                  label={model.label}
                  providerKey={group.providerKey}
                  accent={group.accent}
                  size={22}
                />
                <span>{model.label}</span>
              </button>
            ))}
            <button
              type="button"
              className="launch-model__option launch-model__option--more"
              onClick={onBrowseAll}
            >
              All models…
            </button>
          </div>
        </>
      )}
    </div>
  );
}
