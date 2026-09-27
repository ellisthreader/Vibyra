import React, { useEffect, useRef, useState } from "react";
import DeviceIcon from "./DeviceIcon.jsx";
import { ChatPanel, FilesPanel } from "./DockPanels.jsx";
import WorktreesPanel from "./WorktreesPanel.jsx";
import DockPreview from "./DockPreview.jsx";

const TABS = ["chat", "worktrees", "preview"];
const clampWidth = (value) => Math.max(320, Math.min(560, Math.round(value)));

// The right edge of the Code workspace mirrors the Mac companion sidebar.
// Files is a secondary Chat view, not a fourth primary tab.
export default function DeviceDock({ demo }) {
    const { tool, setTool, dockOpen, setDockOpen, size } = demo;
    const panel = useRef(null);
    const tabs = useRef({});
    const drag = useRef(null);
    const widthRef = useRef(clampWidth(demo.dockWidth ?? 380));
    const [width, setWidth] = useState(widthRef.current);
    const active = TABS.includes(tool) ? tool : "chat";

    useEffect(() => {
        if (drag.current) return;
        widthRef.current = clampWidth(demo.dockWidth ?? 380);
        setWidth(widthRef.current);
    }, [demo.dockWidth]);

    useEffect(() => {
        if (!dockOpen || size === "full") return undefined;
        let frame = 0;
        const move = (event) => {
            if (!drag.current) return;
            widthRef.current = clampWidth(drag.current.width + (drag.current.x - event.clientX) / drag.current.scale);
            if (frame) return;
            frame = requestAnimationFrame(() => {
                frame = 0;
                panel.current?.style.setProperty("--dock-w", `${widthRef.current}px`);
            });
        };
        const finish = () => {
            if (!drag.current) return;
            drag.current = null;
            document.body.classList.remove("vdev-resizing");
            setWidth(widthRef.current);
            demo.setDockWidth?.(widthRef.current);
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", finish);
        window.addEventListener("pointercancel", finish);
        return () => {
            cancelAnimationFrame(frame);
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", finish);
            window.removeEventListener("pointercancel", finish);
            document.body.classList.remove("vdev-resizing");
        };
    }, [dockOpen, size, demo.setDockWidth]);

    if (!dockOpen) return null;
    const select = (id) => setTool(id);
    const moveTabFocus = (event, index) => {
        const { key } = event;
        const next = key === "ArrowLeft" ? (index + 2) % 3 : key === "ArrowRight" ? (index + 1) % 3
            : key === "Home" ? 0 : key === "End" ? 2 : -1;
        if (next < 0) return;
        event.preventDefault();
        select(TABS[next]);
        tabs.current[TABS[next]]?.focus();
    };
    const resizeKey = (event) => {
        const step = event.shiftKey ? 32 : 16;
        const next = event.key === "ArrowLeft" ? widthRef.current + step
            : event.key === "ArrowRight" ? widthRef.current - step
                : event.key === "Home" ? 320 : event.key === "End" ? 560 : null;
        if (next === null) return;
        event.preventDefault();
        widthRef.current = clampWidth(next);
        setWidth(widthRef.current);
        demo.setDockWidth?.(widthRef.current);
    };
    return (
        <aside
            ref={panel}
            className="vdev-dock"
            data-size={size}
            data-tool={tool}
            aria-label="Workspace sidebar"
            style={{ "--dock-w": `${width}px` }}
            onKeyDown={(event) => {
                if (event.key === "Escape" && !event.defaultPrevented) {
                    event.stopPropagation();
                    setDockOpen(false);
                }
            }}
        >
            {size !== "full" && <div
                className="vdev-dock-grip"
                role="separator"
                aria-label="Resize project companion"
                aria-orientation="vertical"
                aria-valuemin={320}
                aria-valuemax={560}
                aria-valuenow={width}
                tabIndex={0}
                onPointerDown={(event) => {
                    if (event.button !== 0) return;
                    event.preventDefault();
                    const node = panel.current;
                    const scale = node ? node.getBoundingClientRect().width / Math.max(1, node.offsetWidth) : 1;
                    drag.current = { x: event.clientX, width: widthRef.current, scale: scale || 1 };
                    document.body.classList.add("vdev-resizing");
                }}
                onKeyDown={resizeKey}
                onDoubleClick={() => {
                    widthRef.current = 380;
                    setWidth(380);
                    demo.setDockWidth?.(380);
                }}
            />}
            <header className="vdev-dock-head">
                <nav className="vdev-dock-tabs" role="tablist" aria-label="Companion tools">
                    {TABS.map((id, index) => <button
                        key={id}
                        ref={(node) => { tabs.current[id] = node; }}
                        type="button"
                        role="tab"
                        aria-selected={active === id}
                        aria-controls="vdev-dock-panel"
                        tabIndex={active === id ? 0 : -1}
                        className={active === id ? "vdev-dock-tab-active" : ""}
                        onClick={() => select(id)}
                        onKeyDown={(event) => moveTabFocus(event, index)}
                    >{id === "worktrees" ? "Worktrees" : id[0].toUpperCase() + id.slice(1)}</button>)}
                </nav>
                <button type="button" className="vdev-icon-btn vdev-dock-expand"
                    aria-label={size === "full" ? "Restore sidebar" : active === "preview" ? "Expand Preview to full screen" : "Expand sidebar"}
                    aria-pressed={size === "full"}
                    onClick={() => demo.setSize(size === "full" ? "compact" : "full")}>
                    <DeviceIcon name="expand" size={15} />
                </button>
                <button type="button" className="vdev-icon-btn vdev-dock-close" aria-label="Close sidebar" onClick={() => setDockOpen(false)}>
                    <DeviceIcon name="close" size={15} />
                </button>
            </header>
            <div className="vdev-dock-body" id="vdev-dock-panel" role="tabpanel" aria-label={tool === "files" ? "Files" : active}>
                {tool === "files" ? <>
                    <button type="button" className="vdev-dock-back" onClick={() => select("chat")}>← Chat</button>
                    <FilesPanel data={demo.data} file={demo.file} onFile={demo.setFile} onWrite={demo.writeFile} changed={demo.changed} />
                </> : active === "chat" ? <ChatPanel demo={demo} onFiles={() => select("files")} />
                    : active === "worktrees" ? <WorktreesPanel demo={demo} onPreview={() => select("preview")} />
                        : <DockPreview data={demo.data} run={demo.run} onWrite={demo.writeFile} />}
            </div>
        </aside>
    );
}
