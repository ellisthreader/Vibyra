import React from "react";
import DeviceIcon from "../DeviceIcon.jsx";
import AgentAvatar from "./AgentAvatar.jsx";

// Your teammates, like a list of conversations: a face, a name, when they
// last spoke and what they said. A dot means unread, or waiting on you.
export default function AgentList({ agent }) {
    return (
        <aside className="vdev-bots" aria-label="Teammates">
            <div className="vdev-bots-head">
                <label className="vdev-bots-search">
                    <DeviceIcon name="search" size={13} />
                    <input
                        type="search"
                        value={agent.query}
                        placeholder="Search teammates"
                        aria-label="Search teammates"
                        onChange={(event) => agent.setQuery(event.target.value)}
                    />
                </label>
                <button
                    type="button"
                    className="vdev-icon-btn"
                    aria-label="New teammate"
                    disabled={!agent.canAdd}
                    onClick={agent.addTeammate}
                >
                    <DeviceIcon name="plus" size={15} />
                </button>
            </div>

            <ul className="vdev-bots-list">
                {agent.archivedView && <li className="vdev-bots-label">Archived teammates</li>}
                {agent.teammates.map((entry) => {
                    const on = entry.id === agent.teammate.id;
                    const waiting = agent.isWaiting(entry.id);
                    const unread = agent.unread.includes(entry.id);
                    return (
                        <li key={entry.id}>
                            <button
                                type="button"
                                className={`vdev-bot${on ? " vdev-bot-on" : ""}`}
                                aria-current={on}
                                onClick={() => agent.open(entry.id)}
                            >
                                <AgentAvatar face={entry.face} engine={entry.engine} size={34} />
                                <span className="vdev-bot-text">
                                    <span className="vdev-bot-top">
                                        <strong>{entry.name}</strong>
                                        <span className="vdev-bot-time">{entry.time}</span>
                                    </span>
                                    <span className="vdev-bot-last">
                                        <span>{agent.previewOf(entry.id)}</span>
                                        {(waiting || unread) && (
                                            <i
                                                role="img"
                                                aria-label={waiting ? "Waiting for you" : "Unread"}
                                                className={`vdev-bot-dot${waiting ? " vdev-bot-dot-ask" : ""}`}
                                            />
                                        )}
                                    </span>
                                </span>
                            </button>
                        </li>
                    );
                })}
            </ul>
            {!agent.teammates.length && <p className="vdev-bots-none">{agent.query ? "No matching teammates." : agent.archivedView ? "No archived teammates." : "No teammates yet."}</p>}

            <div className="vdev-bots-foot">
                {agent.hasArchived && <button type="button" className="vdev-bots-link" onClick={agent.toggleArchived}>{agent.archivedView ? "Back to active teammates" : "Archived teammates"}</button>}
                <button type="button" className="vdev-bots-link" onClick={() => agent.setSkillsOpen(true)}>
                    <DeviceIcon name="book" size={15} />
                    Skills
                </button>
                <button type="button" className="vdev-bots-link" onClick={agent.openSettings}>
                    <DeviceIcon name="gear" size={15} />
                    Settings
                </button>
            </div>
        </aside>
    );
}
