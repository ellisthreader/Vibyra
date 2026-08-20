import { useEffect, useMemo, useState } from "react";

import { launchConfigured } from "../../lib/configuredLaunch";
import { modelEffortOptions, resolvedModelEffort } from "../../lib/modelEffort";
import { planRunner } from "../../lib/modelRunners";
import { useAgentStore } from "../../state/agentStore";
import {
  useLaunchSettingsStore,
  useProjectLaunchSettings,
} from "../../state/launchSettingsStore";
import { useModelCatalogStore } from "../../state/modelCatalogStore";
import { useProjectStore } from "../../state/projectStore";
import { useProviderAccountStore } from "../../state/providerAccountStore";
import { useSettingsStore } from "../../state/settingsStore";
import { useWorkspaceStore } from "../../state/workspaceStore";
import { LaunchAdvancedOptions } from "./LaunchAdvancedOptions";
import { LaunchEffortPicker } from "./LaunchEffortPicker";
import { LaunchModelPicker, type LaunchableModel } from "./LaunchModelPicker";
import { LaunchTerminalCount } from "./LaunchTerminalCount";

const NO_AGENT_IDS: string[] = [];

/** The launcher: model first, then how many terminals and how they run. */
export function LaunchSettingsPanel() {
  const projectId = useProjectStore((state) => state.activeId);
  const settings = useProjectLaunchSettings(projectId);
  const update = useLaunchSettingsStore((state) => state.update);
  const agents = useAgentStore((s) => s.agents);
  const agentsLoaded = useAgentStore((s) => s.loaded);
  const accountsLoaded = useProviderAccountStore((s) => s.loaded);
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
    <section className="launch-config launch-config--open">
      <div className="launch-config__body launch-config__body--flat">
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
          onConnectAccounts={() => openSettingsSection("integrations")}
        />

        {selected && (
          <>
            <LaunchTerminalCount
              value={settings.terminalCount}
              onChange={(terminalCount) => patch({ terminalCount })}
            />

            {selectedEffort && (
              <LaunchEffortPicker
                options={effortOptions}
                value={selectedEffort}
                onChange={(effort) => patch({ effort })}
              />
            )}

            <LaunchAdvancedOptions settings={settings} patch={patch} />

            <button
              type="button"
              className="btn btn--primary launch-config__go"
              data-welcome-focus
              disabled={launching}
              onClick={() => void launch()}
            >
              {launching
                ? "Launching…"
                : settings.terminalCount > 1
                  ? `Launch ${settings.terminalCount} terminals`
                  : "Launch terminal"}
            </button>
          </>
        )}
      </div>
    </section>
  );
}
