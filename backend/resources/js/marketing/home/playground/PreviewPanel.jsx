import React, { useState } from "react";
import { Icon } from "../shared.jsx";
import { encode } from "./projectState.js";

export default function PreviewPanel({ workspace, compact = false }) {
    const { project, update, run } = workspace;
    const [phone, setPhone] = useState(false);
    const config = JSON.parse(project.files["app.json"]);
    const done = config.habits.filter((habit) => habit.done).length;
    return (
        <div className={`pg-preview ${compact ? "pg-preview-compact" : ""}`}>
            <div className="pg-preview-toolbar"><span><i />{compact ? "Live sample preview" : "Preview"}</span>
                {!compact && <div>{[[false, "Desktop", "monitor"], [true, "Phone", "phone"]].map(([value, name, icon]) =>
                    <button key={name} onClick={() => setPhone(value)} aria-pressed={phone === value} aria-label={`${name} sample preview`}><Icon name={icon} size={15} /></button>)}</div>}
            </div>
            <div className={`pg-preview-stage ${phone ? "pg-preview-phone" : ""}`}>
                <div className="pg-orbit" data-theme={config.theme}>
                    <nav aria-label="Sample app"><strong><i />{project.name.toLowerCase()}</strong><span>Today <b>Y</b></span></nav>
                    <div className="pg-orbit-content"><span className="pg-orbit-kicker">A LITTLE BETTER, EVERY DAY</span>
                        <h3>{config.title}</h3><p>Make a little space for yourself.</p>
                        <div className="pg-orbit-week" aria-label="Example week, Friday selected">{["M", "T", "W", "T", "F", "S", "S"].map((day, index) =>
                            <span key={index} className={index === 4 ? "selected" : ""}>{day}<b>{7 + index}</b></span>)}</div>
                        <div className="pg-habits">{config.habits.map((habit, index) => <button key={index} className="pg-habit" aria-pressed={habit.done} disabled={!!run}
                            onClick={() => update({ type: "file", name: "app.json", value: encode({ ...config, habits: config.habits.map((item, i) => i === index ? { ...item, done: !item.done } : item) }) })}>
                            <span className="pg-habit-symbol">{index % 2 ? "≈" : "↗"}</span><span>{habit.name}<small>{habit.done ? "A little win. Well done." : "A moment, just for you."}</small></span>
                            <i>{habit.done && <Icon name="check" size={14} />}</i></button>)}</div>
                        {config.summary && <div className="pg-weekly"><span>YOUR WEEKLY SUMMARY</span><strong>{done} of {config.habits.length} habits complete</strong><progress value={done} max={config.habits.length} aria-label="Habits completed" /></div>}
                        <div className="pg-momentum"><span>YOUR MOMENTUM</span><div>{[23, 36, 28, 44, 36, 58, 68, 54, 78, 66, 89, 96].map((height, index) => <i key={index} style={{ height: `${height}%` }} />)}</div><strong>Look at you go.</strong></div>
                    </div>
                </div>
            </div>
        </div>
    );
}
