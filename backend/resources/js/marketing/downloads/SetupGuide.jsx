import React, { useState } from "react";
import { Icon, SectionLabel, TabKeys } from "../home/shared.jsx";
import { available, installCommand } from "./catalog.js";
import InstallCommand from "./InstallCommand.jsx";

const systems = ["Windows", "Linux", "macOS"];
const keys = ["windows", "linux", "macos"];
const steps = {
    windows: [
        [
            "Open the installer.",
            "Find the .exe in your Downloads folder and open it. Follow the installation steps.",
        ],
        [
            "Make it your workspace.",
            "Launch Vibyra and sign in. Connect an installed coding agent and its provider account, then open or create a project.",
        ],
        [
            "Give your idea a first step.",
            "Start with one clear task. Build, preview a supported project, and review what changes.",
        ],
    ],
    linux: [
        [
            "Choose your package.",
            "Use .deb for Debian or Ubuntu-based systems. Choose AppImage for a portable package on compatible Linux systems.",
        ],
        [
            "Install, then open Vibyra.",
            "For .deb, use your software installer or the terminal command below. For AppImage, make the file executable, then launch it.",
        ],
        [
            "Bring an agent and an idea.",
            "Sign in to Vibyra, then connect your installed coding CLI and its provider account. Open a project and give the first task its own terminal.",
        ],
    ],
    macos: [
        [
            "Choose your architecture.",
            "When available, pick Apple Silicon for M-series Macs or Intel for an Intel-based Mac.",
        ],
        ["Open the disk image.", "Open the downloaded .dmg and move Vibyra to Applications."],
        [
            "Make room for your next idea.",
            "Open Vibyra and sign in. Connect a compatible installed coding agent and bring in your project.",
        ],
    ],
};

export default function SetupGuide({ catalog, platform, onPlatformChange }) {
    const selected = Math.max(0, keys.indexOf(platform));
    const setSelected = (index) => onPlatformChange(keys[index]);
    const [appImage, setAppImage] = useState(false);
    const system = keys[selected];
    const macReady = available(catalog?.releases["macos-arm64"]) || available(catalog?.releases["macos-x64"]);
    const deb = available(catalog?.releases["linux-deb"]);
    const image = available(catalog?.releases.linux);
    const packageKey = (appImage && image) || !deb ? "linux" : "linux-deb";
    const command = installCommand(catalog?.releases[packageKey], packageKey);
    return (
        <section className="download-setup page-width section-space" id="setup" aria-labelledby="setup-title">
            <SectionLabel number="01">FROM DOWNLOAD TO FIRST IDEA</SectionLabel>
            <div className="section-heading">
                <h2 id="setup-title">
                    A few small steps.
                    <br />
                    <span>A whole lot of possibility.</span>
                </h2>
                <p>
                    You bring the idea.
                    <br />
                    Here’s how to get your workspace ready.
                </p>
            </div>
            <div className="download-setup-layout">
                <div className="download-guide">
                    <div
                        className="download-setup-tabs"
                        role="tablist"
                        aria-label="Installation platform"
                        onKeyDown={(event) => TabKeys(event, systems, selected, setSelected, "setup-tab")}
                    >
                        {systems.map((name, index) => (
                            <button
                                key={name}
                                id={`setup-tab-${index}`}
                                role="tab"
                                aria-selected={selected === index}
                                aria-controls="setup-panel"
                                tabIndex={selected === index ? 0 : -1}
                                onClick={() => setSelected(index)}
                            >
                                {name}
                            </button>
                        ))}
                    </div>
                    <div
                        role="tabpanel"
                        id="setup-panel"
                        aria-labelledby={`setup-tab-${selected}`}
                        tabIndex={0}
                    >
                        {system === "macos" && !macReady ? (
                            <div className="download-mac-guide">
                                <Icon name="spark" size={30} />
                                <h3>A little more time for Mac.</h3>
                                <p>
                                    Public macOS installers are coming soon. We’ll show Apple Silicon and
                                    Intel downloads here as each package becomes available.
                                </p>
                                <a className="text-link" href="/#walkthrough">
                                    Explore the workspace
                                    <Icon size={16} />
                                </a>
                            </div>
                        ) : (
                            <ol className="download-install-steps">
                                {steps[system].map(([title, copy], index) => (
                                    <li key={title}>
                                        <span>0{index + 1}</span>
                                        <div>
                                            <h3>{title}</h3>
                                            <p>{copy}</p>
                                        </div>
                                    </li>
                                ))}
                            </ol>
                        )}
                        {system === "linux" && command && (
                            <div className="download-linux-command">
                                {deb && image && (
                                    <div
                                        className="download-package-switch"
                                        aria-label="Linux package format"
                                    >
                                        <button
                                            aria-pressed={packageKey === "linux-deb"}
                                            onClick={() => setAppImage(false)}
                                        >
                                            .deb
                                        </button>
                                        <button
                                            aria-pressed={packageKey === "linux"}
                                            onClick={() => setAppImage(true)}
                                        >
                                            AppImage
                                        </button>
                                    </div>
                                )}
                                <InstallCommand command={command} />
                            </div>
                        )}
                    </div>
                </div>
                <aside className="download-update-card" aria-labelledby="download-update-title">
                    <span className="download-update-symbol">
                        <Icon name="download" size={27} />
                    </span>
                    <p className="download-eyebrow">ALREADY MAKING THINGS?</p>
                    <h3 id="download-update-title">
                        Keep your workspace.
                        <br />
                        <span>Get what’s next.</span>
                    </h3>
                    <p>
                        Vibyra’s built-in updater lets you check for new releases and install them from the
                        app.
                    </p>
                    <div className="download-update-example" aria-hidden="true">
                        <span>
                            <Icon name="spark" size={16} />
                            Vibyra Desktop
                        </span>
                        <p>Good things keep coming.</p>
                        <span className="download-update-action">
                            Check for updates
                            <Icon size={16} />
                        </span>
                    </div>
                    <p className="download-update-footnote">
                        Look for “Check for updates” in the app’s command bar. Follow the update and restart
                        prompts when a release is ready.
                    </p>
                </aside>
            </div>
        </section>
    );
}
