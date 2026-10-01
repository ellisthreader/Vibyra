import React, { useRef, useState } from "react";
import { Icon } from "./shared.jsx";
import PocketArtwork from "./phone/PocketArtwork.jsx";
import PocketDialog from "./phone/PocketDialog.jsx";

export default function Mobile() {
    const [dialog, setDialog] = useState(null);
    const previewButton = useRef(null);
    const waitlistButton = useRef(null);
    return (
        <section className="pocket-section" id="mobile" aria-labelledby="mobile-title">
            <div className="pocket-scene">
                <PocketArtwork />
                <div className="pocket-copy">
                    <p className="pocket-eyebrow">VIBYRA MOBILE</p>
                    <h2 id="mobile-title">Your desk,<br /><span>in your pocket.</span></h2>
                    <p className="pocket-description">Your projects, terminals, and agents.<br className="pocket-desktop-break" /> Wherever you are.</p>
                    <div className="pocket-actions">
                        <button type="button" className="pocket-join pocket-apple" ref={waitlistButton} onClick={() => setDialog("waitlist")}>
                            <svg viewBox="0 0 24 24" width="23" height="23" fill="currentColor" aria-hidden="true"><path d="M17.05 12.54c.02 3.3 2.9 4.4 2.93 4.41-.02.08-.46 1.57-1.52 3.1-.92 1.33-1.87 2.66-3.37 2.69-1.47.04-1.95-.87-3.63-.87-1.68 0-2.21.84-3.6.91-1.45.05-2.55-1.44-3.48-2.77C2.49 17.29 1 12.34 2.94 8.99a5.4 5.4 0 0 1 4.57-2.77c1.43-.02 2.79.97 3.66.97.88 0 2.52-1.2 4.25-1.02.72.03 2.73.3 4.02 2.18-.1.06-2.4 1.39-2.39 4.19ZM14.29 4.37c.77-.94 1.29-2.24 1.15-3.54-1.11.04-2.46.74-3.26 1.68-.72.84-1.35 2.18-1.18 3.46 1.24.1 2.51-.64 3.29-1.6Z" /></svg> Join the iOS waitlist
                        </button>
                        <button type="button" className="pocket-preview" ref={previewButton} onClick={() => setDialog("preview")}>
                            <span className="pocket-play"><Icon name="play" size={17} /></span> See preview
                        </button>
                    </div>
                    <p className="pocket-availability">Coming October 2026.</p>
                </div>
            </div>
            {dialog && <PocketDialog opener={dialog === "preview" ? previewButton : waitlistButton} kind={dialog} onClose={() => setDialog(null)} />}
        </section>
    );
}
