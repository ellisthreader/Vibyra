import React, { useEffect, useRef, useState } from "react";
import { Icon } from "../home/shared.jsx";

export default function InstallCommand({ command }) {
    const [status, setStatus] = useState("");
    const current = useRef(command);
    const timer = useRef(null);
    useEffect(() => {
        current.current = command;
        setStatus("");
        return () => {
            current.current = null;
            clearTimeout(timer.current);
        };
    }, [command]);
    const copy = async () => {
        try {
            if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
            await navigator.clipboard.writeText(command);
            if (current.current !== command) return;
            setStatus("copied");
            clearTimeout(timer.current);
            timer.current = setTimeout(() => setStatus(""), 2500);
        } catch {
            if (current.current === command) setStatus("error");
        }
    };
    return (
        <div className="download-command">
            <div>
                <span>AFTER DOWNLOADING · TERMINAL</span>
                <button onClick={copy} aria-label="Copy installation command">
                    <Icon name={status === "copied" ? "check" : "file"} size={15} />
                    {status === "copied" ? "Copied" : "Copy"}
                </button>
            </div>
            <pre tabIndex={0} aria-label="Linux installation command">
                <code>{command}</code>
            </pre>
            <p role="status">
                {status === "error"
                    ? "Copy unavailable. Select the command above to copy it manually."
                    : status === "copied"
                      ? "Installation command copied."
                      : "Run this after downloading the package to your Downloads folder."}
            </p>
        </div>
    );
}
