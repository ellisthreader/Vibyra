import { useRef } from "react";
import { LaunchModelMenu } from "./LaunchModelMenu";
import type { RunnerPlan } from "../../lib/modelRunners";
import type { CatalogModel, CompanyGroup } from "../../lib/openRouterCatalog";
import { ModelMark } from "../common/AgentMark";
import { CheckIcon, ChevronIcon, MoreIcon } from "../common/Icons";

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

const FEATURED = 3;

/** The first model of each company, the selection always among them. */
function featured(models: LaunchableModel[], selected: LaunchableModel | null) {
  const picks: LaunchableModel[] = [];
  for (const entry of models) {
    if (picks.length >= FEATURED) break;
    if (!picks.some((pick) => pick.group.company === entry.group.company)) picks.push(entry);
  }
  if (selected && !picks.some((pick) => pick.model.id === selected.model.id)) {
    const index = picks.findIndex((pick) => pick.group.company === selected.group.company);
    if (index >= 0) picks[index] = selected;
    else picks.splice(Math.max(0, picks.length - 1), 1, selected);
  }
  return picks;
}

/** Which model runs: the usual ones as tiles, every other one behind More. */
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
  const anchor = useRef<HTMLDivElement>(null);
  if (!selected) {
    return (
      <button
        type="button"
        className="launch-model__connect"
        aria-label={loading ? "Finding AI models" : "Connect your AI accounts"}
        disabled={loading}
        onClick={() => onConnectAccounts()}
      >
        <span>
          <strong>{loading ? "Finding AI models…" : "Connect your AI accounts"}</strong>
          <small>{loading ? "Checking installed AI tools" : "Open Settings → AI accounts"}</small>
        </span>
        {!loading && <ChevronIcon size={14} />}
      </button>
    );
  }

  const tiles = featured(models, selected);
  return (
    <div className="launch-model" role="group" aria-label="Model">
      <div className="launch-model__tiles" ref={anchor}>
        {tiles.map(({ model, group, plan }) => {
          const active = model.id === selected.model.id;
          return (
            <button
              key={model.id}
              type="button"
              className={`launch-tile${active ? " launch-tile--active" : ""}`}
              aria-pressed={active}
              style={{ "--pick-accent": group.accent } as React.CSSProperties}
              onClick={() => onSelect(model.id)}
            >
              <ModelMark modelId={model.id} label={model.label} providerKey={group.providerKey} accent={group.accent} size={34} />
              <span className="launch-tile__copy">
                <strong>{model.label}</strong>
                <small>{plan.runner?.name}</small>
              </span>
              {model.isNew && <em className="launch-tile__badge">New</em>}
              {active && <span className="launch-tile__check"><CheckIcon size={12} /></span>}
            </button>
          );
        })}
        <button
          type="button"
          className="launch-tile launch-tile--more"
          aria-expanded={open}
          onClick={() => onOpenChange(!open)}
        >
          <span className="launch-tile__more"><MoreIcon size={16} /></span>
          <span className="launch-tile__copy"><strong>More models</strong><small>{models.length} models</small></span>
        </button>
      </div>
      {open && <LaunchModelMenu anchor={anchor} models={models} selectedId={selected.model.id}
        onSelect={onSelect} onClose={() => onOpenChange(false)} onBrowseAll={onBrowseAll} />}
    </div>
  );
}
