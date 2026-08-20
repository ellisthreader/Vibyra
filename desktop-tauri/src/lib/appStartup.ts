export type AppStartupScope = "workspace" | "agents" | "models";

interface AppStartupTasks {
  initializeWorkspace: () => Promise<void>;
  refreshAgents: () => Promise<void>;
  refreshModels: () => Promise<void>;
}

export function startAppRuntime(
  tasks: AppStartupTasks,
  onFailure: (scope: AppStartupScope, error: unknown) => void,
): void {
  const startupTasks: Array<[AppStartupScope, () => Promise<void>]> = [
    ["agents", tasks.refreshAgents],
    ["models", tasks.refreshModels],
    ["workspace", tasks.initializeWorkspace],
  ];
  for (const [scope, start] of startupTasks) {
    void start().catch((error) => onFailure(scope, error));
  }
}
