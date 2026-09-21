import { useEffect, useMemo, useState } from "react";

import { launchConfigured } from "../../lib/configuredLaunch";
import { homeRelative } from "../../lib/homeRelative";
import { modelEffortOptions, resolvedModelEffort } from "../../lib/modelEffort";
import { planRunner } from "../../lib/modelRunners";
import { keyLabel } from "../../lib/platform";
import { useAgentStore } from "../../state/agentStore";
import {
  useLaunchSettingsStore,
  useProjectLaunchSettings,
} from "../../state/launchSettingsStore";
import { useModelCatalogStore } from "../../state/modelCatalogStore";
import { useProjectStore } from "../../state/projectStore";
import { useProviderAccountStore } from "../../state/providerAccountStore";
import { useProjects, useSettingsStore } from "../../state/settingsStore";
import { useWorkspaceStore } from "../../state/workspaceStore";
import { connectedAccounts, launchAccountId } from "../../lib/providerAccountPolicy";
import { useProviderDefaultStore } from "../../state/providerDefaultStore";
import { LaunchAccountPicker } from "./LaunchAccountPicker";
import { LaunchAdvancedOptions } from "./LaunchAdvancedOptions";
import { LaunchEffortPicker } from "./LaunchEffortPicker";
import { LaunchModelPicker, type LaunchableModel } from "./LaunchModelPicker";
import { LaunchSafeMode } from "./LaunchSafeMode";
import { LaunchTerminalCount } from "./LaunchTerminalCount";

const NO_AGENT_IDS: string[] = [];
/** The launcher: one card. Model first, then how it runs, then Launch. */
export function LaunchSettingsPanel() {
  const projectId = useProjectStore((state) => state.activeId);
  const project = useProjects().find((candidate) => candidate.id === projectId) ?? null;
  const settings = useProjectLaunchSettings(projectId);
  const update = useLaunchSettingsStore((state) => state.update);
  const agents = useAgentStore((s) => s.agents);
  const agentsLoaded = useAgentStore((s) => s.loaded);
  const accountsLoaded = useProviderAccountStore((s) => s.loaded);
  const providers = useProviderAccountStore((s) => s.providers);
  const defaultAccounts = useProviderDefaultStore((s) => s.byRuntime);
  const enabledAgentIds = useSettingsStore((s) => s.settings?.enabledAgentIds ?? NO_AGENT_IDS);
  const groups = useModelCatalogStore((s) => s.groups);
  const openPicker = useWorkspaceStore((s) => s.openAgentPicker);
  const openSettingsSection = useWorkspaceStore((s) => s.openSettingsSection);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [launching, setLaunching] = useState(false);

  useEffect(() => setModelMenuOpen(false), [projectId]);

  // Only models backed by a selected, installed integration — catalog order.
  const launchable = useMemo<LaunchableModel[]>(
    () =>
      groups.flatMap((group) =>
        group.models
          .map((model) => ({ model, group, plan: planRunner(model, agents, enabledAgentIds) }))
          .filter(({ plan }) => !plan.blocked),
      ),
    [groups, agents, enabledAgentIds],
  );

  if (!projectId) return null;

  const selected =
    launchable.find(({ model }) => model.id === settings.modelId) ?? launchable[0] ?? null;
  const effortOptions = selected?.plan.runner
    ? modelEffortOptions(selected.model, selected.plan.runner.id)
    : [];
  const selectedEffort = selected?.plan.runner
    ? resolvedModelEffort(selected.model, selected.plan.runner.id, settings.effort)
    : null;
  const patch = (value: Partial<typeof settings>) => update(projectId, value);

  // Show accounts only for this launch provider.
  const runnerId = selected?.plan.runner?.id ?? null;
  const provider = providers.find((candidate) => candidate.runtimeId === runnerId) ?? null;
  const accounts = provider ? connectedAccounts(provider) : [];
  // Project pick, then the default chosen in Settings, then the first account.
  const selectedAccount = launchAccountId(accounts,
    settings.accountByProvider[runnerId ?? ""], defaultAccounts[runnerId ?? ""]) ?? "";

  const launch = async () => {
    if (!selected || launching) return;
    setLaunching(true);
    try {
      await launchConfigured(selected.plan.runner!, projectId, {
        model: selected.plan.launchModel,
        reasoningEffort: selectedEffort ?? undefined,
        reasoningEnabled: Boolean(selectedEffort),
        title: selected.model.label,
        // The only entry point that opens more than one — its button says so.
        count: settings.terminalCount,
      });
    } finally {
      setLaunching(false);
    }
  };

  return (
    <section
      className="launch-card"
      aria-label="New terminal"
      onKeyDown={(event) => {
        if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) void launch();
      }}
    >
      <header className="launch-card__head">
        <h2>New terminal</h2>
        <p>{project ? `${project.name} · ${homeRelative(project.root)}` : "This project"}</p>
      </header>

      <LaunchModelPicker
        models={launchable}
        selected={selected}
        loading={!agentsLoaded || !accountsLoaded}
        open={modelMenuOpen}
        onOpenChange={setModelMenuOpen}
        onSelect={(modelId) => {
          const next = launchable.find(({ model }) => model.id === modelId);
          const effort = next?.plan.runner
            ? resolvedModelEffort(next.model, next.plan.runner.id, settings.effort)
            : null;
          patch({ modelId, ...(effort ? { effort } : {}) });
          setModelMenuOpen(false);
        }}
        onBrowseAll={() => {
          setModelMenuOpen(false);
          openPicker();
        }}
        onConnectAccounts={() => openSettingsSection("ai", "terminalAccounts")}
      />

      {selected && (
        <>
          <div className="launch-card__rows">
            <LaunchTerminalCount
              value={settings.terminalCount}
              onChange={(terminalCount) => patch({ terminalCount })}
            />
            {selectedEffort && (
              <LaunchEffortPicker
                provider={runnerId ?? undefined}
                options={effortOptions}
                value={selectedEffort}
                onChange={(effort) => patch({ effort })}
              />
            )}
            {provider && runnerId ? (
              <LaunchAccountPicker
                product={provider.product}
                accounts={accounts}
                value={selectedAccount}
                onChange={(accountId) =>
                  patch({
                    accountByProvider: { ...settings.accountByProvider, [runnerId]: accountId },
                  })
                }
              />
            ) : null}
            <LaunchAdvancedOptions settings={settings} patch={patch} />
          </div>

          <footer className="launch-card__foot">
            <LaunchSafeMode
              projectRoot={project?.root ?? null}
              value={settings.safeMode}
              onChange={(safeMode) => patch({ safeMode })}
            />
            <button
              type="button"
              className="btn btn--primary launch-card__go"
              data-welcome-focus
              disabled={launching}
              onClick={() => void launch()}
            >
              {launching
                ? "Launching…"
                : settings.terminalCount > 1
                  ? `Launch ${settings.terminalCount} terminals`
                  : "Launch terminal"}
              <kbd>{keyLabel("Mod+Enter")}</kbd>
            </button>
          </footer>
        </>
      )}
    </section>
  );
}
