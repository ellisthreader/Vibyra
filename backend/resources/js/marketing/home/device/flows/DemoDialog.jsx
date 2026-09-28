import React, { useEffect, useRef } from "react";

/** Modal stays within the illustrated app; keyboard isolation includes the page. */
export default function DemoDialog({ title, kind, onClose, returnFocus, children }) {
    const ref = useRef(null);
    const close = useRef(onClose);
    close.current = onClose;
    useEffect(() => {
        const previous = returnFocus ?? document.activeElement;
        const disabled = [];
        let node = ref.current.parentElement;
        while (node && node !== document.body) {
            for (const sibling of node.parentElement.children) {
                if (sibling !== node && !sibling.inert) { sibling.inert = true; disabled.push(sibling); }
            }
            node = node.parentElement;
        }
        ref.current.focus({ preventScroll: true });
        const key = (event) => {
            if (event.key === "Escape" && !event.defaultPrevented) { event.preventDefault(); event.stopPropagation(); close.current(); }
            if (event.key !== "Tab") return;
            const controls = [...ref.current.querySelectorAll('button:not(:disabled), input:not(:disabled), select, summary, [tabindex="0"]')].filter(el => el.getClientRects().length);
            const first = controls[0], last = controls.at(-1);
            if (!first) { event.preventDefault(); return; }
            if (event.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) { event.preventDefault(); last.focus(); }
            else if (!event.shiftKey && (document.activeElement === last || document.activeElement === ref.current)) { event.preventDefault(); first.focus(); }
        };
        document.addEventListener("keydown", key);
        return () => {
            document.removeEventListener("keydown", key);
            disabled.forEach(el => { el.inert = false; });
            if (previous?.isConnected) previous.focus({ preventScroll: true });
        };
    }, []);
    return <div className={`vdev-modal-backdrop vdev-flow-backdrop vdev-flow-${kind}`} onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
        <section ref={ref} tabIndex={-1} className="vdev-modal vdev-flow" role="dialog" aria-modal="true" aria-label={title}>
            <header><h2>{title}</h2><span className="vdev-demo-label">Interactive demo</span><button type="button" aria-label="Close dialog" onClick={onClose}>×</button></header>
            {children}
        </section>
    </div>;
}
