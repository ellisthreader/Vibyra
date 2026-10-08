import React from "react";
import { CONSENSUS_SOURCES } from "./data.js";

export default function SourcePicker({ value, onChange }) {
    if (!CONSENSUS_SOURCES) return null;
    return (
        <label className="bm-select-label">Score source
            <select aria-label="Score source" value={value} onChange={(e) => onChange(e.target.value)}>
                <option value="consensus">Vibyra consensus</option>
                {[ ["Capability benchmarks", (s) => s.consensus !== false && s.category !== "preference"],
                    ["Human preference", (s) => s.consensus !== false && s.category === "preference"],
                    ["Reference only", (s) => s.consensus === false],
                ].map(([label, filter]) => <optgroup key={label} label={label}>
                    {CONSENSUS_SOURCES.filter(filter).map((s) => <option value={s.id} key={s.id}>{s.name}</option>)}
                </optgroup>)}
            </select>
        </label>
    );
}
