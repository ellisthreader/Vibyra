let terminalTestLaunch = null;
let terminalTestLaunchError = "";
let terminalTestLoadingSince = 0;
let terminalTestLoadingTimer = 0;

function beginTerminalTestLoading(launch, status) {
  if (launch) terminalTestLaunch = launch;
  terminalTestLaunchError = "";
  terminalTestLoading = true;
  terminalTestLoadingSince = Date.now();
  terminalTestStatus = status || "Preparing project preview...";
  clearInterval(terminalTestLoadingTimer);
  terminalTestLoadingTimer = setInterval(() => syncTerminalTestWorkspace(), 700);
  syncTerminalTestWorkspace();
}

function finishTerminalTestLoading(error = "") {
  terminalTestLoading = false;
  terminalTestLaunchError = String(error || "");
  stopTerminalTestStartupFeed();
  clearInterval(terminalTestLoadingTimer);
  terminalTestLoadingTimer = 0;
  if (!error) terminalTestStartupTargetId = "";
  syncTerminalTestWorkspace();
}

function clearTerminalTestRunner() {
  terminalTestLaunch = null;
  terminalTestLaunchError = "";
  terminalTestLoading = false;
  clearTerminalTestStartupFeed();
  clearInterval(terminalTestLoadingTimer);
  terminalTestLoadingTimer = 0;
}

function terminalTestRunnerHtml() {
  return `<section class="terminal-test-runner" data-terminal-test-runner hidden aria-live="polite">
    <div class="terminal-test-runner-body">
      <span class="terminal-test-runner-mark"><img src="/app-assets/vibyra.png" alt=""></span>
      <div class="terminal-test-runner-copy"><strong data-terminal-test-runner-title>Preparing preview</strong><p data-terminal-test-runner-message>Vibyra is getting your project ready.</p></div>
      <span class="terminal-test-runner-progress" aria-hidden="true"><i></i></span>
      <div class="terminal-test-runner-feed" data-terminal-test-runner-feed hidden><div><span></span><span></span><span></span><small>startup</small></div><pre data-terminal-test-runner-output></pre></div>
      <details class="terminal-test-runner-details"><summary>Command</summary><code data-terminal-test-runner-command></code></details>
      <button type="button" data-terminal-test-runner-retry hidden>Retry preview</button>
    </div>
  </section>`;
}

function refreshTerminalTestRunner(root) {
  const runner = root.querySelector("[data-terminal-test-runner]");
  if (!runner) return;
  const visible = terminalTestLoading || Boolean(terminalTestLaunchError);
  runner.hidden = !visible;
  if (!visible) return;
  const framework = terminalTestLaunch?.framework || "project";
  runner.querySelector("[data-terminal-test-runner-title]").textContent = terminalTestLaunchError
    ? "Preview could not start"
    : `Starting ${framework}`;
  runner.classList.toggle("is-error", Boolean(terminalTestLaunchError));
  runner.querySelector("[data-terminal-test-runner-command]").textContent = terminalTestLaunch?.command || "Detecting project runtime...";
  runner.querySelector("[data-terminal-test-runner-message]").textContent = terminalTestRunnerMessage();
  const feed = runner.querySelector("[data-terminal-test-runner-feed]");
  feed.hidden = !terminalTestStartupOutput;
  const output = runner.querySelector("[data-terminal-test-runner-output]");
  if (output.textContent !== terminalTestStartupOutput) {
    output.textContent = terminalTestStartupOutput;
    output.scrollTop = output.scrollHeight;
  }
  runner.querySelector("[data-terminal-test-runner-retry]").hidden = !terminalTestLaunchError || !terminalTestLaunch?.available;
}

function terminalTestRunnerMessage() {
  if (terminalTestLaunchError) return terminalTestLaunchError;
  const latest = terminalTestStartupOutput.trim().split(/\r?\n/).filter(Boolean).at(-1);
  if (latest) return latest.replace(/\x1b\[[0-9;]*m/g, "").slice(0, 180);
  const elapsed = Date.now() - terminalTestLoadingSince;
  if (!terminalTestLaunch) return "Inspecting the project and finding the best browser preview.";
  if (elapsed < 1800) return "Launching the approved local command.";
  if (elapsed < 4600) return "Waiting for the development server to become available.";
  return "Checking the live response before opening your preview.";
}
