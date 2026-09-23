// Wire shapes for launchable terminal agents, mirroring the serde renames in
// src-tauri/crates/vibyra-core/src/agents/.
//
// Kept out of types.ts for the 200-line source standard; re-exported there so
// every existing import keeps working.

export interface AgentSpec {
  id: string;
  name: string;
  program: string;
  args: string[];
  env: [string, string][];
  accent: string;
  description: string;
  custom: boolean;
}

export interface AgentInstallHint {
  manager: "npm" | "manual";
  /** What is installed; also what the UI names. */
  package: string;
  /** The exact command, shown for a manual install and copyable. */
  command: string;
}

export interface ResolvedAgent extends AgentSpec {
  installed: boolean;
  /** How this agent gets onto the machine; null for a custom entry the user
   * pointed at themselves. See agents/install.rs. */
  install: AgentInstallHint | null;
}
