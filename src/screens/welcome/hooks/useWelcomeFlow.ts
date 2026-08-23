import { useCallback, useEffect, useRef, useState } from "react";
import { AccessibilityInfo, BackHandler } from "react-native";
import { useAccountActions } from "../../../context/AccountContexts";
import { useDesktopActions, useDesktopConnection } from "../../../context/DesktopContexts";
import { WelcomeFlow, WelcomeStep } from "../types";

export function useWelcomeFlow(): WelcomeFlow {
  const accountActions = useAccountActions();
  const desktop = useDesktopConnection();
  const desktopActions = useDesktopActions();
  const [step, setStep] = useState<WelcomeStep>(() => desktop.paired ? "connected" : "hero");
  const [skipPromptOpen, setSkipPromptOpen] = useState(false);
  const announced = useRef<WelcomeStep | null>(null);

  useEffect(() => {
    if (desktop.pendingPhoneApproval && step !== "approve" && step !== "connected") {
      setStep("approve");
    }
  }, [desktop.pendingPhoneApproval, step]);

  useEffect(() => {
    if (desktop.paired && step !== "connected") {
      setStep("connected");
    }
  }, [desktop.paired, step]);

  useEffect(() => {
    if (announced.current === step) return;
    announced.current = step;
    const labels: Record<WelcomeStep, string> = {
      hero: "Welcome to Vibyra. Connect your PC.",
      download: "Download Vibyra Desktop on your computer.",
      setup: "Finding your PC.",
      approve: "Confirm the connection on your phone.",
      connected: "All set. You're connected."
    };
    AccessibilityInfo.announceForAccessibility(labels[step]);
  }, [step]);

  useEffect(() => {
    const handler = BackHandler.addEventListener("hardwareBackPress", () => {
      if (step === "connected") return true;
      if (step === "approve") {
        setSkipPromptOpen(true);
        return true;
      }
      if (step === "setup") {
        setStep("hero");
        return true;
      }
      if (step === "download") {
        setStep("hero");
        return true;
      }
      return false;
    });
    return () => handler.remove();
  }, [step]);

  const finish = useCallback(() => {
    accountActions.completePcSetup();
  }, [accountActions]);

  const requestSkip = useCallback(() => setSkipPromptOpen(true), []);
  const cancelSkip = useCallback(() => setSkipPromptOpen(false), []);
  const confirmSkip = useCallback(() => {
    setSkipPromptOpen(false);
    if (desktop.connection || desktop.pendingPhoneApproval || desktop.paired) desktopActions.disconnectDesktop();
    accountActions.skipPcSetup();
  }, [accountActions, desktop.connection, desktop.pendingPhoneApproval, desktop.paired, desktopActions]);

  const advance = useCallback((next: WelcomeStep) => setStep(next), []);
  const goToHero = useCallback(() => setStep("hero"), []);
  const goToDownload = useCallback(() => setStep("setup"), []);
  const goToSetup = useCallback(() => setStep("setup"), []);
  const goToApprove = useCallback(() => setStep("approve"), []);
  const goToConnected = useCallback(() => setStep("connected"), []);

  return {
    step, advance, goToHero, goToDownload, goToSetup, goToApprove, goToConnected,
    requestSkip, cancelSkip, confirmSkip, finish, skipPromptOpen
  };
}
