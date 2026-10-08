import { invoke } from "@tauri-apps/api/core";
import { parseCloudOverview } from "../lib/cloudOverviewParsing";
import type { CloudLoginView, CloudOverview, CloudProvider } from "../lib/cloudOverviewTypes";

type Action = "wake" | "stop" | "disconnect" | "repair" | "provider" | "project";
type ActionOptions = { projectKey?: string; provider?: CloudProvider; enabled?: boolean; confirmed?: boolean; name?: string };
export const cloudPage = {
  read: async (): Promise<CloudOverview> => parseCloudOverview(await invoke("cloud_overview")),
  action: async (action: Action, options: ActionOptions = {}): Promise<CloudOverview> =>
    parseCloudOverview(await invoke("cloud_page_action", { action, ...options })),
  logins: () => invoke<CloudLoginView[]>("cloud_logins_status"),
  allowLogin: (provider: "claude" | "codex") => invoke<CloudLoginView[]>("cloud_logins_allow", { provider }),
  stopLogin: () => invoke<CloudLoginView[]>("cloud_logins_stop"),
};
