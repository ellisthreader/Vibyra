function patchTerminalSetupPanel(setup) {
  const currentFlow = setup?.querySelector?.(".terminal-setup-flow");
  const currentProgress = currentFlow?.querySelector?.(".terminal-setup-progress");
  const currentPanel = setup?.querySelector?.(".terminal-setup-panel");
  if (!currentFlow || !currentProgress || !currentPanel) return false;

  const template = document.createElement("template");
  template.innerHTML = setupView().trim();
  const nextSetup = template.content.querySelector(".terminal-setup");
  const nextFlow = template.content.querySelector(".terminal-setup-flow");
  const nextProgress = nextFlow?.querySelector(".terminal-setup-progress");
  const nextPanel = template.content.querySelector(".terminal-setup-panel");
  if (!nextSetup || !nextFlow || !nextProgress || !nextPanel) return false;

  const scrollTop = setup.scrollTop;
  setup.classList.toggle("terminal-setup--mode", nextSetup.classList.contains("terminal-setup--mode"));
  setup.classList.toggle("terminal-setup--configure", nextSetup.classList.contains("terminal-setup--configure"));
  currentFlow.classList.toggle("terminal-setup-flow--mode", nextFlow.classList.contains("terminal-setup-flow--mode"));
  const currentStep = currentProgress.querySelector('[aria-current="step"] em')?.textContent;
  const nextStep = nextProgress.querySelector('[aria-current="step"] em')?.textContent;
  if (currentStep !== nextStep) currentProgress.replaceWith(nextProgress);
  currentPanel.replaceWith(nextPanel);
  setup.scrollTop = scrollTop;
  bindTerminalControls();
  return true;
}
