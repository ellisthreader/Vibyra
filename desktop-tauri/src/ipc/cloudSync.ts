import { invoke } from "@tauri-apps/api/core";

import type { Invoke } from "../lib/cloudComputerClient";
import { createCloudSyncClient } from "../lib/cloudSyncClient";

export const cloudSync = createCloudSyncClient(invoke as Invoke);
