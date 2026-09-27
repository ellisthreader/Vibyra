import React, { useState } from "react";
import { Icon } from "./shared.jsx";

export function OrbitApp({ small = false }) {
    const [completed, setCompleted] = useState([true, false]);
    const toggle = (index) => setCompleted((values) => values.map((value, i) => i === index ? !value : value));
    return (
        <div className={`orbit-app ${small ? "orbit-app-small" : ""}`}>
            <div className="orbit-app-nav">
                <strong>
                    <i />
                    orbit
                </strong>
                <span>
                    Today <span className="orbit-user">J</span>
                </span>
            </div>
            <div className="orbit-app-content">
                <p className="orbit-eyebrow">A LITTLE BETTER, EVERY DAY</p>
                <p className="orbit-title">
                    Small steps.
                    <br />
                    <span>Good things.</span>
                </p>
                <p className="orbit-app-subtitle">Make a little space for yourself.</p>
                <div className="orbit-week">
                    {["M", "T", "W", "T", "F", "S", "S"].map((day, i) => (
                        <span key={i} className={i === 4 ? "today" : ""}>
                            {day}
                            <b>{7 + i}</b>
                        </span>
                    ))}
                </div>
                <button className="orbit-habit" aria-pressed={completed[0]} onClick={() => toggle(0)}>
                    <span className="habit-icon">↗</span>
                    <div>
                        <strong>A little movement</strong>
                        <span>20 minutes, just for you</span>
                    </div>
                    <span className={completed[0] ? "habit-check" : "habit-ring"}>
                        {completed[0] && <Icon name="check" size={12} />}
                    </span>
                </button>
                <button className="orbit-habit" aria-pressed={completed[1]} onClick={() => toggle(1)}>
                    <span className="habit-icon habit-blue">≈</span>
                    <div>
                        <strong>Stay hydrated</strong>
                        <span>One glass at a time</span>
                    </div>
                    <span className={completed[1] ? "habit-check" : "habit-ring"}>{completed[1] && <Icon name="check" size={12} />}</span>
                </button>
                <div className="orbit-streak">
                    <span>YOUR MOMENTUM</span>
                    <div className="streak-bars">
                        {[24, 35, 26, 46, 36, 58, 68, 54, 78, 66, 89, 96].map((height, i) => (
                            <i key={i} style={{ height: `${height}%` }} />
                        ))}
                    </div>
                    <strong>Look at you go.</strong>
                </div>
            </div>
        </div>
    );
}
