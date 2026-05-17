export type WelcomeStep = "hero" | "download" | "setup" | "approve" | "connected";

export type WelcomeFlow = {
  step: WelcomeStep;
  advance: (next: WelcomeStep) => void;
  goToHero: () => void;
  goToDownload: () => void;
  goToSetup: () => void;
  goToApprove: () => void;
  goToConnected: () => void;
  requestSkip: () => void;
  cancelSkip: () => void;
  confirmSkip: () => void;
  finish: () => void;
  skipPromptOpen: boolean;
};
