import React, { useLayoutEffect, useRef, useState } from "react";
import DeviceIcon from "../DeviceIcon.jsx";
import AgentAvatar from "./AgentAvatar.jsx";
import AgentMessage from "./AgentMessage.jsx";
import AgentComposer from "./AgentComposer.jsx";
import { ENGINES } from "./agentData.js";

export default function AgentThread({ agent }) {
    const { teammate, thread } = agent;
    const messages = useRef(null);
    const follow = useRef(true);
    const [newMessages, setNewMessages] = useState(false);
    useLayoutEffect(() => {
        const list = messages.current;
        if (!list) return;
        if (follow.current) { list.scrollTop = list.scrollHeight; setNewMessages(false); }
        else if (thread.length) setNewMessages(true);
    }, [thread, agent.typing]);
    const onScroll = () => {
        const list = messages.current;
        if (!list) return;
        follow.current = list.scrollHeight - list.clientHeight - list.scrollTop < 80;
        if (follow.current) setNewMessages(false);
    };
    return <section className="vdev-thread" aria-label={`Conversation with ${teammate.name}`}>
        <header className="vdev-thread-head">
            <button type="button" className="vdev-icon-btn vdev-thread-back" aria-label="Back to teammates"
                onClick={() => agent.setListOpen(true)}><DeviceIcon name="back" size={16} /></button>
            <AgentAvatar face={teammate.face} size={30} />
            <div className="vdev-thread-identity"><strong>{teammate.name}</strong>
                <small>{teammate.archived ? "Archived conversation" : ENGINES[teammate.engine]}</small></div>
            <button type="button" className="vdev-icon-btn vdev-thread-details" aria-label="Teammate details"
                title="Teammate details" onClick={() => agent.setProfile(teammate.id)}>···</button>
        </header>
        <div className="vdev-msg-scroll" ref={messages} onScroll={onScroll}>
            <ol className="vdev-msgs" aria-label="Messages">
                {thread.map((message, index) => <AgentMessage key={`${teammate.id}-${index}`}
                    message={message} onDecide={agent.decide} />)}
                {agent.typing && <li className="vdev-msg vdev-msg-them"><span className="vdev-typing"
                    role="img" aria-label={`${teammate.name} is typing`}><i /><i /><i /></span></li>}
            </ol>
        </div>
        {newMessages && <button className="vdev-new-messages" type="button" onClick={() => {
            follow.current = true; setNewMessages(false);
            if (messages.current) messages.current.scrollTop = messages.current.scrollHeight;
        }}>Latest messages ↓</button>}
        <AgentComposer agent={agent} />
    </section>;
}
