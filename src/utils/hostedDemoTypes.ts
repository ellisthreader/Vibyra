export type HostedDemoStatus = "ready" | "unavailable" | "failed" | "pending";

export type HostedDemoAsset = {
  body?: string;
  contentType?: string;
  encoding?: "utf8" | "base64";
  path: string;
  size?: number;
  url?: string;
};

export type HostedDemoPayload = {
  assets?: HostedDemoAsset[];
  entryPath?: string;
  entryHtml?: string;
  files?: HostedDemoAsset[];
  generatedAt?: string;
  html?: string;
  kind?: string;
  message?: string;
  metadata?: Record<string, unknown>;
  mountDirectory?: string;
  ok?: boolean;
  source?: "desktop";
  status: HostedDemoStatus;
  url?: string | null;
};

export type HostedRuntimePayload = {
  buildCommand?: string;
  code?: string;
  files?: HostedDemoAsset[];
  kind?: string;
  message?: string;
  metadata?: Record<string, unknown>;
  needsRuntime?: boolean;
  ok?: boolean;
  platform?: "laravel" | "node" | "python";
  runtimeReason?: string;
  source?: "desktop";
  startCommand?: string;
  status: HostedDemoStatus;
};
