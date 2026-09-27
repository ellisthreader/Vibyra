import React from "react";
import AgentList from "./AgentList.jsx";
import AgentThread from "./AgentThread.jsx";
import AgentProfile from "./AgentProfile.jsx";
import AgentSkills from "./AgentSkills.jsx";

// Agent Mode's workspace, laid out like messaging a coworker: your teammates
// and the conversation with one of them. Narrow windows show the list or the
// conversation one at a time.
export default function DeviceAgent({ agent }) {
    return (
        <main className="vdev-workspace vdev-agentview" data-list={agent.listOpen ? "open" : "closed"}>
            <AgentList agent={agent} />
            {agent.profile ? <AgentProfile key={agent.profile} agent={agent} /> : <AgentThread key={agent.teammate.id} agent={agent} />}
            {agent.skillsOpen && <AgentSkills agent={agent} />}
        </main>
    );
}
