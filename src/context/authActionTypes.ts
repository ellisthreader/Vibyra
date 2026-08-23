import { useAppState } from "./useAppState";

export type AuthStore = ReturnType<typeof useAppState>;
export type AuthLogs = {
  appendLog: (message: string, source?: string, tone?: "info" | "success" | "warning" | "error") => void;
};
