import { create } from "zustand";

export interface PendingLaunchApproval {
  projectName: string;
  changedFiles: number;
  continueLaunch: () => Promise<void>;
}

interface LaunchApprovalStore {
  pending: PendingLaunchApproval | null;
  request: (pending: PendingLaunchApproval) => void;
  clear: () => void;
}

export const useLaunchApprovalStore = create<LaunchApprovalStore>((set) => ({
  pending: null,
  request: (pending) => set({ pending }),
  clear: () => set({ pending: null }),
}));
