import type { CatalogModel, CompanyGroup } from "../../lib/openRouterCatalog";
import { ModelMark } from "../common/AgentMark";

function contextLabel(tokens: number): string {
  if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toFixed(tokens % 1_000_000 ? 1 : 0)}M ctx`;
  }
  if (tokens >= 1_000) return `${Math.round(tokens / 1_000)}K ctx`;
  return "";
}

export function AgentPickerModelRow({ model, group, onLaunch }: {
  model: CatalogModel;
  group: CompanyGroup;
  onLaunch: (model: CatalogModel) => void;
}) {
  const detail = [contextLabel(model.contextLength), model.tier].filter(Boolean).join(" · ");
  return (
    <button
      className="model-row"
      title={`Launch ${model.label}`}
      style={{ "--pick-accent": group.accent } as React.CSSProperties}
      onClick={() => onLaunch(model)}
    >
      <ModelMark modelId={model.id} label={model.label} providerKey={group.providerKey} accent={group.accent} size={28} />
      <span className="model-row__meta">
        <strong>{model.label}</strong>
        <small>{detail}</small>
      </span>
      {model.isNew && <em className="model-row__badge">New</em>}
    </button>
  );
}
