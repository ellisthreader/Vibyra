/** Shared transport type for the active Cloud Sync client. */
export type Invoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;
