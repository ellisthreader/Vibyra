import React, { useState } from "react";
import { Icon } from "../shared.jsx";
import { encode } from "./projectState.js";

const WEEK = ["M", "T", "W", "T", "F", "S", "S"];
const DATE = new Intl.DateTimeFormat("en", { weekday: "long", month: "long", day: "numeric" });

export default function PreviewPanel({ workspace, compact = false, hideToolbar = false, device = "laptop" }) {
    const { project, update, run } = workspace;
    const [phone, setPhone] = useState(false);
    const config = JSON.parse(project.files["app.json"]);
    const done = config.habits.filter((habit) => habit.done).length;
    const progress = Math.round((done / config.habits.length) * 100);
    const today = new Date();
    const weekday = (today.getDay() + 6) % 7;
    const mobile = compact ? device === "phone" : phone;
    const toggleHabit = (index) => update({ type: "file", name: "app.json", value: encode({
        ...config,
        habits: config.habits.map((habit, position) => position === index ? { ...habit, done: !habit.done } : habit),
    }) });

    return <div className={`pg-preview${compact ? " pg-preview-compact" : ""}`}>
        {!compact && !hideToolbar && <div className="pg-preview-toolbar"><span><i />Live sample preview</span><div>{[[false, "Desktop", "monitor"], [true, "Phone", "phone"]].map(([value, name, icon]) =>
            <button type="button" key={name} onClick={() => setPhone(value)} aria-pressed={phone === value} aria-label={`${name} sample preview`}><Icon name={icon} size={15} /></button>)}</div></div>}
        <div className={`pg-preview-stage${mobile ? " pg-preview-phone" : ""}`}>
            <article className="pg-orbit" data-theme={config.theme} aria-label={`${project.name} interactive sample app`}>
                <header className="pg-orbit-header"><div className="pg-orbit-brand"><span className="pg-orbit-logo" />{project.name.toLowerCase()}</div><div className="pg-orbit-today">Today <span>Y</span></div></header>
                <main className="pg-orbit-content">
                    <div className="pg-orbit-intro"><span className="pg-orbit-kicker">A LITTLE BETTER, EVERY DAY</span><h3>{config.title}</h3><p>Make a little space for yourself.</p></div>
                    <section className="pg-orbit-progress" aria-label={`${done} of ${config.habits.length} habits complete`}>
                        <div><span>TODAY'S PROGRESS</span><strong>{done === config.habits.length ? "All done for today" : "You're finding your rhythm"}</strong><small>{DATE.format(today)}</small></div>
                        <div className="pg-progress-ring" role="progressbar" aria-valuemin="0" aria-valuemax={config.habits.length} aria-valuenow={done} aria-label="Habits complete" style={{ "--progress": `${progress}%` }}><b>{done}<small>/{config.habits.length}</small></b></div>
                    </section>
                    <div className="pg-orbit-week" aria-label="This week, today selected">{WEEK.map((day, index) => <span key={index} className={index === weekday ? "selected" : ""}><small>{day}</small><b>{index === weekday ? "●" : index < weekday ? "✓" : "·"}</b></span>)}</div>
                    <section className="pg-orbit-habits"><div className="pg-section-heading"><h4>Your habits</h4><span>{done} of {config.habits.length} done</span></div><div className="pg-habits">{config.habits.map((habit, index) => <button type="button" key={`${habit.name}-${index}`} className="pg-habit" aria-pressed={habit.done} disabled={!!run} onClick={() => toggleHabit(index)}>
                        <span className="pg-habit-symbol">{["↗", "≈", "✧", "◌"][index % 4]}</span><span className="pg-habit-copy"><strong>{habit.name}</strong><small>{habit.done ? "A little win. Well done." : "A moment, just for you."}</small></span><span className="pg-habit-check">{habit.done && <Icon name="check" size={14} />}</span>
                    </button>)}</div></section>
                    {config.summary && <div className="pg-weekly"><span>YOUR WEEKLY SUMMARY</span><strong>{done} of {config.habits.length} habits complete</strong><progress value={done} max={config.habits.length} aria-label="Habits completed" /></div>}
                    <div className="pg-momentum"><div><span>YOUR MOMENTUM</span><strong>Look at you go.</strong></div><div className="pg-momentum-bars">{[23, 36, 28, 44, 36, 58, 68, 54, 78, 66, 89, 96].map((height, index) => <i key={index} style={{ height: `${height}%` }} />)}</div></div>
                </main>
            </article>
        </div>
    </div>;
}
