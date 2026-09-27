import React from "react";
import { logoPath, agents } from "../../agents.js";

// A teammate's face: a soft vinyl character with a smile and one prop for its
// job, with the engine it runs on as a small corner badge. The pictures live in
// /media/marketing/teammates/, one per face name.
export default function AgentAvatar({ face, engine, size = 34 }) {
    const mark = engine && agents.find((entry) => entry.id === engine);
    return (
        <span className="vdev-face" style={{ "--face": `${size}px` }}>
            <img
                className="vdev-face-art"
                src={`/media/marketing/teammates/${face}.webp`}
                alt=""
                width={size}
                height={size}
                decoding="async"
            />
            {mark && (
                <span className={`vdev-face-engine${mark.mono ? " vdev-face-engine-mono" : ""}`}>
                    <img src={logoPath(mark)} alt="" />
                </span>
            )}
        </span>
    );
}
