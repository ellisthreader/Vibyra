import { useEffect, useMemo, useState } from "react";

import { accentFor } from "../../lib/providerAccents";
import { launchConfigured } from "../../lib/configuredLaunch";
import { resolvedModelEffort } from "../../lib/modelEffort";
import { planRunner } from "../../lib/modelRunners";
import type { CatalogModel } from "../../lib/openRouterCatalog";
import { useAgentStore } from "../../state/agentStore";
import { useModelCatalogStore } from "../../state/modelCatalogStore";
import { useLaunchSettingsStore } from "../../state/launchSettingsStore";
import { useProjectStore } from "../../state/projectStore";
import { useSettingsStore } from "../../state/settingsStore";
import { useWorkspaceStore } from "../../state/workspaceStore";
import { AgentMark, ProviderMark } from "../common/AgentMark";
import { ChevronDownIcon, CloseIcon, SearchIcon } from "../common/Icons";
import { AgentPickerModelRow } from "./AgentPickerModelRow";

const NO_AGENT_IDS: string[] = [];

/** The terminal adder: company first, then a clean drop of its models. */
export function AgentPickerModal() {
  const open = useWorkspaceStore((s) => s.agentPickerOpen);
  const close = useWorkspaceStore((s) => s.closeAgentPicker);
  const agents = useAgentStore((s) => s.agents);
  const enabledAgentIds = useSettingsStore((s) => s.settings?.enabledAgentIds ?? NO_AGENT_IDS);
  const refreshAgents = useAgentStore((s) => s.refresh);
  const groups = useModelCatalogStore((s) => s.groups);
  const refreshCatalog = useModelCatalogStore((s) => s.refresh);
  const activeProjectId = useProjectStore((s) => s.activeId);
  const openSettingsSection = useWorkspaceStore((s) => s.openSettingsSection);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (open) {
      setQuery("");
      void refreshAgents();
      void refreshCatalog();
    }
  }, [open, refreshAgents, refreshCatalog]);

  const availableGroups = useMemo(() => groups
    .map((group) => ({
      ...group,
      models: group.models.filter((model) => !planRunner(model, agents, enabledAgentIds).blocked),
    }))
    .filter((group) => group.models.length > 0), [groups, agents, enabledAgentIds]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    return availableGroups
      .map((group) => ({
        group,
        models: group.models.filter(
          (m) =>
            m.label.toLowerCase().includes(q) ||
            m.company.toLowerCase().includes(q) ||
            m.id.toLowerCase().includes(q),
        ),
      }))
      .filter((r) => r.models.length > 0);
  }, [availableGroups, query]);

  if (!open) return null;

  const tools = agents.filter((a) => a.installed && (a.id === "shell" || a.custom));

  const launch = (model: CatalogModel) => {
    const plan = planRunner(model, agents, enabledAgentIds);
    if (!plan.runner || !activeProjectId) return;
    const currentEffort = useLaunchSettingsStore.getState().get(activeProjectId).effort;
    const effort = resolvedModelEffort(model, plan.runner.id, currentEffort);
    close();
    void launchConfigured(plan.runner, activeProjectId, {
      model: plan.launchModel,
      reasoningEffort: effort ?? undefined,
      reasoningEnabled: Boolean(effort),
      title: model.label,
    });
  };

  return (
    <div className="modal-backdrop" onClick={close}>
      <div className="modal picker" onClick={(e) => e.stopPropagation()}>
        <header className="modal__header">
          <div className="modal__heading">
            <h2 className="modal__title">New terminal</h2>
            <p className="modal__subtitle">Pick a company, then the model that runs in it</p>
          </div>
          <button className="icon-btn" onClick={close} title="Close">
            <CloseIcon size={15} />
          </button>
        </header>
        <label className="picker__search">
          <SearchIcon size={14} />
          <input
            value={query}
            placeholder="Search models…"
            spellCheck={false}
            autoFocus
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") close();
            }}
          />
        </label>
        <div className="modal__body picker__scroll">
          {results
            ? results.map(({ group, models }) => (
                <section key={group.company} className="picker__hits">
                  <p className="picker__section-head">{group.company}</p>
                  {models.map((model) => (
                    <AgentPickerModelRow key={model.id} model={model} group={group} onLaunch={launch} />
                  ))}
                </section>
              ))
            : availableGroups.map((group) => {
                const isOpen = expanded === group.company;
                return (
                  <section key={group.company} className={`company${isOpen ? " company--open" : ""}`}>
                    <button
                      className="company__row"
                      aria-expanded={isOpen}
                      style={{ "--pick-accent": group.accent } as React.CSSProperties}
                      onClick={() => setExpanded(isOpen ? null : group.company)}
                    >
                      <ProviderMark provider={group.providerKey} label={group.company} accent={group.accent} size={30} />
                      <strong>{group.company}</strong>
                      <span className="company__count">{group.models.length}</span>
                      <span className="company__chevron">
                        <ChevronDownIcon size={13} />
                      </span>
                    </button>
                    {isOpen && (
                      <div className="company__models">
                        {group.models.map((model) => (
                          <AgentPickerModelRow key={model.id} model={model} group={group} onLaunch={launch} />
                        ))}
                      </div>
                    )}
                  </section>
                );
              })}
          {availableGroups.length === 0 && (
            <div className="settings-empty">
              <span>Select an installed terminal integration to see its models.</span>
              <button
                type="button"
                className="btn btn--secondary"
                onClick={() => {
                  close();
                  openSettingsSection("integrations");
                }}
              >
                Connect your AI accounts
              </button>
            </div>
          )}
          {!query && tools.length > 0 && (
            <section className="picker__tools">
              <p className="picker__section-head">Tools</p>
              {tools.map((agent) => {
                const accent = accentFor(agent.id, agent.accent);
                return (
                  <button
                    key={agent.id}
                    className="model-row"
                    style={{ "--pick-accent": accent } as React.CSSProperties}
                    title={`Launch ${agent.name}`}
                    onClick={() => {
                      close();
                      if (activeProjectId) void launchConfigured(agent, activeProjectId);
                    }}
                  >
                    <AgentMark agentId={agent.id} name={agent.name} accent={accent} size={28} />
                    <span className="model-row__meta">
                      <strong>
                        {agent.name}
                        {agent.custom && <em className="agent-row__custom-tag">custom</em>}
                      </strong>
                      <small>{agent.description}</small>
                    </span>
                  </button>
                );
              })}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
