export type WelcomeStep = "hero" | "setup" | "approve" | "connected";

export type WelcomeFlow = {
  step: WelcomeStep;
  advance: (next: WelcomeStep) => void;
  goToHero: () => void;
  goToSetup: () => void;
  goToApprove: () => void;
  goToConnected: () => void;
  requestSkip: () => void;
  cancelSkip: () => void;
  confirmSkip: () => void;
  finish: () => void;
  skipPromptOpen: boolean;
};
