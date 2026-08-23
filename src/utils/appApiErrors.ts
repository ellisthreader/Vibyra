export type ApiErrorPayload = {
  burstCreditsResetAt?: string;
  error?: string;
  message?: string;
  weeklyCreditsResetAt?: string;
};

export class AppApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly endpoint: string,
    public readonly payload: ApiErrorPayload | Record<string, never>
  ) {
    super(message);
    this.name = "AppApiError";
  }
}

export class BackendOfflineError extends Error {
  constructor(url: string) {
    super(`Backend marked offline; skipping request to ${url}`);
    this.name = "BackendOfflineError";
  }
}

export function isAppSessionExpiredMessage(message: string) {
  const lower = message.toLowerCase();
  return lower.includes("your session expired")
    || lower.includes("missing app session token")
    || (lower.includes("log in") && lower.includes("session"));
}

export function isAppSessionExpiredError(error: unknown) {
  if (error instanceof AppApiError) {
    if (error.status !== 401) return false;
    return error.endpoint === "/api/session"
      || error.endpoint === "/api/session/state"
      || isAppSessionExpiredMessage(error.message);
  }

  return error instanceof Error && isAppSessionExpiredMessage(error.message);
}
