import React from "react";
import DeviceIcon from "../DeviceIcon.jsx";
import { RISK_WORDS } from "./agentData.js";

function Decision({ message, onDecide }) {
    return <article className="vdev-decide">
        <small>{RISK_WORDS[message.risk]} {message.target}</small>
        <pre>{message.detail}</pre>
        {message.answer ? <p>{message.answer === "approved" ? "Sample approved · no action run" : "Sample declined"}</p> :
            <div className="vdev-decide-actions">
                <button type="button" onClick={() => onDecide(message.id, false)}>Deny</button>
                <button type="button" className="vdev-decide-primary" onClick={() => onDecide(message.id, true)}>Approve once</button>
            </div>}
    </article>;
}

export default function AgentMessage({ message, onDecide }) {
    if (message.kind === "stamp") return <li className="vdev-msg-stamp">{message.text}</li>;
    if (message.kind === "handoff") return <li className="vdev-msg-note"><DeviceIcon name="handoff" size={12} />{message.text}</li>;
    const from = message.from ?? "them";
    return <li className={`vdev-msg vdev-msg-${from}`}>
        {message.text && <p className="vdev-bubble">{message.text}</p>}
        {message.kind === "file" && <div className="vdev-attach"><span aria-hidden="true">↗</span>
            <span>{message.name}<small>{message.meta}</small></span></div>}
        {message.kind === "decision" && <Decision message={message} onDecide={onDecide} />}
    </li>;
}
