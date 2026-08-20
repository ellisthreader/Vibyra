import { createRoot } from "react-dom/client";

import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import "@xterm/xterm/css/xterm.css";

import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/base.part-02.css";
import "./styles/base.part-03.css";
import "./styles/chrome.css";
import "./styles/chrome.part-02.css";
import "./styles/chrome-account.css";
import "./styles/auth.css";
import "./styles/auth-backdrop.css";
import "./styles/auth.part-02.css";
import "./styles/auth-email.css";
import "./styles/auth-email.part-02.css";
import "./styles/first-welcome.css";
import "./styles/first-welcome-motion.css";
import "./styles/strip.css";
import "./styles/home.css";
import "./styles/home.part-02.css";
import "./styles/home.part-03.css";
import "./styles/rail.css";
import "./styles/rail.part-02.css";
import "./styles/rail.part-03.css";
import "./styles/launch-settings.css";
import "./styles/launch-controls.css";
import "./styles/launch-model-picker.css";
import "./styles/launch-approval.css";
import "./styles/workspace.css";
import "./styles/workspace.part-02.css";
import "./styles/workspace.part-03.css";
import "./styles/workspace.part-04.css";
import "./styles/project-modes.css";
import "./styles/preview.css";
import "./styles/preview-picker.css";
import "./styles/preview-device.css";
import "./styles/preview-overlay.css";
import "./styles/companion.css";
import "./styles/companion.part-02.css";
import "./styles/companion.part-03.css";
import "./styles/companion-shell.css";
import "./styles/companion-chat.css";
import "./styles/companion-chat-composer.css";
import "./styles/companion-memory.css";
import "./styles/companion-memory-import.css";
import "./styles/companion-memory-workbench.css";
import "./styles/companion-memory-document.css";
import "./styles/companion-files.css";
import "./styles/palette.css";
import "./styles/modals.css";
import "./styles/modals.part-02.css";
import "./styles/modals.part-03.css";
import "./styles/modals.part-04.css";
import "./styles/terminal-suspended.css";
import "./styles/settings-ai.css";
import "./styles/settings-ai.part-02.css";
import "./styles/settings-integrations.css";
import "./styles/settings-terminal-integrations.css";
import "./styles/screenshot-editor.css";
import "./styles/screenshot-controls.css";
import "./styles/screenshot-tray.css";
import "./styles/settings-graphics.css";
import "./styles/settings-hotkeys.css";
import "./styles/settings-profile.css";

import App from "./App";
import { initRendererPolicy } from "./lib/xtermRenderer";

// Resolves long before the first terminal can mount (post sign-in).
void initRendererPolicy();

createRoot(document.getElementById("root")!).render(<App />);

