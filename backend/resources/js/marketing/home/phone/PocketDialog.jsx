import React, { useEffect, useRef } from "react";
import PhoneWaitlist from "../PhoneWaitlist.jsx";
import { Icon } from "../shared.jsx";
import PocketDemo from "./PocketDemo.jsx";

export default function PocketDialog({ kind, onClose, opener: invokingElement }) {
    const dialog = useRef(null);
    const preview = kind === "preview";
    useEffect(() => {
        const node = dialog.current;
        const opener = invokingElement?.current ?? document.activeElement;
        const overflow = document.body.style.overflow;
        node.showModal();
        document.body.style.overflow = "hidden";
        return () => {
            node.close();
            document.body.style.overflow = overflow;
            opener?.focus();
        };
    }, []);
    const backdrop = (event) => {
        if (event.target !== event.currentTarget) return;
        const rect = event.currentTarget.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose();
    };
    return (
        <dialog ref={dialog} className={`pocket-dialog ${preview ? "is-preview" : ""}`}
            aria-labelledby="pocket-dialog-title" onCancel={onClose} onClick={backdrop}>
            <div className="pocket-dialog-head">
                <h3 id="pocket-dialog-title">{preview ? "Build from your pocket." : "Your next desk. Your pocket."}</h3>
                <button type="button" onClick={onClose} aria-label="Close mobile dialog"><Icon name="close" size={22} /></button>
            </div>
            {preview ? <PocketDemo /> : <>
                <p className="pocket-dialog-intro">Coming October 2026. Join the list for the iPhone launch.</p>
                <PhoneWaitlist />
            </>}
        </dialog>
    );
}
