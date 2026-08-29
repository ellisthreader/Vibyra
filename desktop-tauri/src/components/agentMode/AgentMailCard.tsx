import { useEffect, useState } from "react";

import type { AgentProfile, MailMessage } from "../../agentTypes";
import { mailAllowlist, mailTrail, setMailAllowlist } from "../../ipc/agentMail";
import { useAgentRosterStore } from "../../state/agentRosterStore";
import { useSettingsStore } from "../../state/settingsStore";

/**
 * Whether this teammate can be handed work by another, and who may hand it.
 *
 * Two switches rather than one, because they are two different questions.
 * "Accepts handoffs" says this agent may be woken at all; the list says by
 * whom. An agent with messaging on and nobody on its list is reachable by
 * nobody — the right default for the feature most able to spend money while
 * nobody is watching.
 */
export function AgentMailCard({ agent }: { agent: AgentProfile }) {
  const agents = useAgentRosterStore((state) => state.agents);
  const update = useAgentRosterStore((state) => state.update);
  const paused = useSettingsStore((state) => state.settings?.agentMailPaused ?? false);
  const saveSettings = useSettingsStore((state) => state.update);
  const [allowed, setAllowed] = useState<string[]>([]);
  const [trail, setTrail] = useState<MailMessage[]>([]);

  useEffect(() => {
    void mailAllowlist(agent.id).then(setAllowed).catch(() => setAllowed([]));
    void mailTrail(agent.id).then(setTrail).catch(() => setTrail([]));
  }, [agent.id]);

  const toggle = async (peerId: string) => {
    const next = allowed.includes(peerId)
      ? allowed.filter((id) => id !== peerId)
      : [...allowed, peerId];
    setAllowed(next);
    await setMailAllowlist(agent.id, next).catch(() => {});
  };

  const others = agents.filter((entry) => entry.id !== agent.id);

  return (
    <section className="settings-card">
      <h3>Teammate messages</h3>
      <label className="settings-row">
        <span className="settings-row__label">Accepts handoffs from other agents</span>
        <input
          type="checkbox"
          checked={agent.mailEnabled}
          onChange={(event) => void update(agent.id, { mailEnabled: event.target.checked })}
        />
      </label>
      <p className="settings-card__hint">
        A handoff can never widen what this agent may do — its turn is built from its own
        brief, folders and access level. Anything asking it to publish, spend or delete
        becomes a decision for you instead.
      </p>

      {others.length > 0 && (
        <>
          <p className="section-label">{agent.name} may write to</p>
          <ul className="allow-list">
            {others.map((peer) => (
              <li key={peer.id}>
                <label>
                  <input
                    type="checkbox"
                    checked={allowed.includes(peer.id)}
                    onChange={() => void toggle(peer.id)}
                  />
                  {peer.name}
                </label>
              </li>
            ))}
          </ul>
        </>
      )}

      {trail.length > 0 && (
        <>
          <p className="section-label">Recent handoffs</p>
          <ul className="mail-trail">
            {trail.slice(0, 6).map((message) => (
              <li key={message.id} className={`mail-trail__row mail-trail__row--${message.status}`}>
                <span className="mail-trail__who">
                  {message.senderId === agent.id ? `to ${message.recipientId ? "a teammate" : "—"}` : `from ${message.senderName}`}
                </span>
                <span className="mail-trail__body">{message.body}</span>
                <span className="mail-trail__status">{message.status}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      <label className="settings-row">
        <span className="settings-row__label">Pause all agent messages, app-wide</span>
        <input
          type="checkbox"
          checked={paused}
          onChange={(event) => void saveSettings({ agentMailPaused: event.target.checked })}
        />
      </label>

      <label className="settings-row">
        <span className="settings-row__label">
          May run scheduled routines. Turning this off stops the ones it already
          has, not only new ones.
        </span>
        <input
          type="checkbox"
          checked={agent.routinesAllowed}
          onChange={(event) => void update(agent.id, { routinesAllowed: event.target.checked })}
        />
      </label>
    </section>
  );
}
