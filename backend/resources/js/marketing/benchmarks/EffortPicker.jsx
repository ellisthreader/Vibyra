import React from "react";
import { EFFORT_LABELS } from "./effortSelection.js";

export default function EffortPicker({ value, models, onChange }) {
    const levels = Object.keys(EFFORT_LABELS).filter((level) => models.some((m) => m.effort === level));
    return (
        <div className="page-width bm-effort-controls">
            <label className="bm-select-label">Reasoning effort
                <select value={value} onChange={(e) => onChange(e.target.value)} aria-label="Reasoning effort">
                    <option value="highest">Highest reported per model</option>
                    <option value="all">All efforts ({models.length} profiles)</option>
                    {levels.map((level) => <option key={level} value={level}>{EFFORT_LABELS[level]}</option>)}
                </select>
            </label>
            <p>Each row uses one published effort. Unreported effort stays separate; effort names are provider settings, not equal compute budgets.</p>
        </div>
    );
}
