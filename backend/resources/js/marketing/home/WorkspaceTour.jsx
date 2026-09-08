import React, { useLayoutEffect, useRef, useState } from "react";
import { Action, Brand, Icon, TabKeys } from "./shared.jsx";
import { TerminalDemo, PreviewDemo, ReviewDemo } from "./WorkspacePanels.jsx";

const steps = [
    {
        label: "Build",
        title: "An idea becomes a project.",
        copy: "Give your coding agents a clear brief. Keep their terminals together as they work on different parts of your project.",
        detail: "This example pairs an interface task with a code review. Your installed agents use their own provider accounts.",
        component: TerminalDemo,
    },
    {
        label: "Preview",
        title: "See it. Try it. Refine it.",
        copy: "Your supported local project runs beside the work. Switch the example between desktop and phone sizes to see how a layout adapts.",
        detail: "In Vibyra, Preview runs your actual project. The habit tracker here is an illustrative walkthrough.",
        component: PreviewDemo,
    },
    {
        label: "Review",
        title: "Make the final call.",
        copy: "Inspect the files your agents changed. Use an isolated Git worktree to try an idea, then merge or discard the changes.",
        detail: "You keep your repository and your Git workflow. Worktree isolation separates code changes; it is not a system sandbox.",
        component: ReviewDemo,
    },
];

export default function WorkspaceTour({ initialStep = 0, onClose }) {
    const dialog = useRef(null);
    const [selected, setSelected] = useState(initialStep);
    const step = steps[selected];
    const Panel = step.component;
    useLayoutEffect(() => {
        const opener = document.activeElement;
        const previousOverflow = document.body.style.overflow;
        dialog.current.showModal();
        document.body.style.overflow = "hidden";
        return () => {
            document.body.style.overflow = previousOverflow;
            opener?.focus({ preventScroll: true });
        };
    }, []);
    return (
        <dialog
            ref={dialog}
            className="tour-dialog"
            aria-labelledby="tour-title"
            onClose={onClose}
            onKeyDown={(event) => {
                if (event.key !== "Tab") return;
                const focusable = [
                    ...dialog.current.querySelectorAll('a[href], button, [tabindex="0"]'),
                ].filter(
                    (element) =>
                        element.tabIndex >= 0 && !element.disabled && element.getClientRects().length,
                );
                const first = focusable[0];
                const last = focusable.at(-1);
                if (event.shiftKey && document.activeElement === first) {
                    event.preventDefault();
                    last?.focus();
                } else if (!event.shiftKey && document.activeElement === last) {
                    event.preventDefault();
                    first?.focus();
                }
            }}
            onClick={(event) => {
                if (event.target === event.currentTarget) dialog.current.close();
            }}
        >
            <div className="tour-shell">
                <header className="tour-header">
                    <Brand />
                    <span className="tour-heading-label">THE WORKSPACE, UP CLOSE</span>
                    <button
                        autoFocus
                        className="tour-close"
                        aria-label="Close demo"
                        onClick={() => dialog.current.close()}
                    >
                        <Icon name="close" />
                    </button>
                </header>
                <div className="tour-navigation">
                    <div
                        className="tour-tabs"
                        role="tablist"
                        aria-label="Workspace tour"
                        onKeyDown={(event) => TabKeys(event, steps, selected, setSelected, "tour-tab")}
                    >
                        {steps.map((item, index) => (
                            <button
                                key={item.label}
                                id={`tour-tab-${index}`}
                                role="tab"
                                aria-controls="tour-panel"
                                aria-selected={selected === index}
                                tabIndex={selected === index ? 0 : -1}
                                onClick={() => setSelected(index)}
                            >
                                <span>0{index + 1}</span>
                                {item.label}
                            </button>
                        ))}
                    </div>
                    <span className="tour-example-label">Illustrative product demo</span>
                </div>
                <div
                    className="tour-body"
                    role="tabpanel"
                    id="tour-panel"
                    aria-labelledby={`tour-tab-${selected}`}
                    tabIndex={0}
                >
                    <div className="tour-story">
                        <div>
                            <h2 id="tour-title">{step.title}</h2>
                            <p>{step.copy}</p>
                        </div>
                        <p className="tour-detail">{step.detail}</p>
                    </div>
                    <div className={`tour-demo tour-demo-${selected}`} key={selected}>
                        <Panel />
                    </div>
                </div>
                <footer className="tour-footer">
                    <span>Windows & Linux · Desktop beta</span>
                    <Action icon="download">Get Vibyra for free</Action>
                </footer>
            </div>
        </dialog>
    );
}
