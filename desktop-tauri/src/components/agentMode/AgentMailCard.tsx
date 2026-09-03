import { Fragment, useEffect, useState } from "react";

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
  const row = (label: string, hint: string, checked: boolean, onChange: (on: boolean) => void) => (
    <label className="setting-row">
      <span className="setting-row__text">
        <span className="setting-row__label">{label}</span>
        <span className="setting-row__hint">{hint}</span>
      </span>
      <span className="setting-row__control">
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
        />
      </span>
    </label>
  );

  return (
    <section className="settings-block">
      <span className="section-label">Working with others</span>
      <div className="settings-group">
        {row(
          "Accepts handoffs from other teammates",
          "A handoff can never widen what this teammate may do — its turn is built from its own brief, folders and access level. One asking it to publish, spend or delete becomes a decision for you.",
          agent.mailEnabled,
          (on) => void update(agent.id, { mailEnabled: on }),
        )}
        {row(
          "May run scheduled routines",
          "Turning this off stops the routines it already has, not only new ones.",
          agent.routinesAllowed,
          (on) => void update(agent.id, { routinesAllowed: on }),
        )}
        {row(
          "Pause all teammate messages, app-wide",
          "Every handoff between any two teammates is refused while this is on.",
          paused,
          (on) => void saveSettings({ agentMailPaused: on }),
        )}
      </div>

      {others.length > 0 && (
        <>
          <span className="section-label">{agent.name} may hand work to</span>
          <div className="settings-group">
            {others.map((peer) => (
              <Fragment key={peer.id}>
                {row(
                  peer.name,
                  peer.brief.split("\n")[0] || "No brief yet.",
                  allowed.includes(peer.id),
                  () => void toggle(peer.id),
                )}
              </Fragment>
            ))}
          </div>
        </>
      )}

      {trail.length > 0 && (
        <>
          <span className="section-label">Recent handoffs</span>
          <ul className="mail-trail">
            {trail.slice(0, 6).map((message) => (
              <li key={message.id} className={`mail-trail__row mail-trail__row--${message.status}`}>
                <span className="mail-trail__who">
                  {message.senderId === agent.id ? "Sent" : `From ${message.senderName}`}
                </span>
                <span className="mail-trail__body">{message.body}</span>
                <span className="mail-trail__status">{message.status}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
