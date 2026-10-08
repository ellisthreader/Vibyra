import { useEffect, useState, type ReactNode } from "react";
import { useShallow } from "zustand/react/shallow";

import { clearTerminal, useChatNeeds, useNeedsYou } from "../../lib/needsYou";
import { useAgentAttention } from "../../state/agentAttentionStore";
import { useProjects } from "../../state/settingsStore";
import { ProjectTile } from "../common/ProjectTile";
import { usePhoneStore } from "../../state/phoneStore";
import { useProjectStore } from "../../state/projectStore";
import { useTeammateNeeds } from "../../state/teammateNeedsStore";
import { CheckIcon } from "../common/Icons";
import { teammateApi } from "../teammates/api";
import type { Roster } from "../teammates/types";
import { ChatNeedCard, PhoneNeed, TeammateNeed, TerminalNeed } from "./NeedsYouCards";

type Names = Record<string, { name: string; avatar: string }>;

/** The inbox carries ids only, so a waiting teammate's name and face come from
 * the roster, read once while this page has teammate items to show. */
function useTeammateNames(wanted: boolean): Names {
  const [names, setNames] = useState<Names>({});
  useEffect(() => {
    if (!wanted) return;
    let alive = true;
    void teammateApi<Roster>("agents/v1/teammates").then((roster) => {
      if (!alive || !Array.isArray(roster.teammates)) return;
      setNames(Object.fromEntries(roster.teammates.map((agent) => [agent.id, { name: agent.name, avatar: agent.avatar }])));
    }).catch(() => {});
    return () => { alive = false; };
  }, [wanted]);
  return names;
}

/** A project's waiting items under its own small header, so several
 * projects at once stay easy to tell apart. */
function Group({ id, name, count, children }: { id?: string; name: string; count: number; children: ReactNode }) {
  return <section className="sb-needs__group" aria-label={`${name}, ${count} waiting`}>
    <h2 className="sb-needs__group-head">{id && <ProjectTile id={id} name={name} size={20} />}<span>{name}</span><span className="sb-needs__group-count">{count}</span></h2>
    <div className="sb-needs__list">{children}</div>
  </section>;
}

/** Needs you: every terminal, agent chat, teammate and iPhone waiting on the
 * person, grouped by project, each settled from its own card. */
export function NeedsYouView() {
  const projects = useProjects();
  const panes = useNeedsYou();
  const chats = useChatNeeds();
  const teammates = useTeammateNeeds((s) => s.items);
  const phones = usePhoneStore(useShallow((s) => s.status?.pending ?? []));
  const names = useTeammateNames(teammates.length > 0);
  const total = panes.length + chats.length + teammates.length + phones.length;
  if (!total) {
    return <main className="homeview sb-home sb-needs sb-needs--empty">
      <div className="sb-needs__clear">
        <span className="sb-needs__check" aria-hidden="true"><CheckIcon size={22} /></span>
        <h1>Nothing needs you</h1>
        <p>Agent approvals, finished agents, teammate approvals and iPhone requests will show up here.</p>
        <button type="button" className="btn" onClick={() => useProjectStore.getState().goHome()}>Back to Home</button>
      </div>
    </main>;
  }
  // Clear all leaves iPhone requests: a device asking for access needs an answer.
  const clearable = panes.length + chats.length + teammates.length;
  const clearAll = () => {
    for (const pane of panes) clearTerminal(pane);
    for (const need of chats) useAgentAttention.getState().dismiss(need);
    for (const item of teammates) useTeammateNeeds.getState().hide(item.id);
  };
  // Projects in sidebar order; within one, approvals and prompts before finishes.
  const groups = projects.map((project) => ({
    project,
    panes: panes.filter((pane) => pane.projectId === project.id),
    chats: chats.filter((need) => need.projectId === project.id),
  })).filter((group) => group.panes.length || group.chats.length);
  return <main className="homeview sb-home sb-needs">
    <div className="sb-home__inner">
      <header className="sb-needs__head">
        <h1>Needs you</h1>
        <span className="sb-needs__count" aria-label={`${total} waiting`}>{total}</span>
        {clearable > 0 && <button type="button" className="sb-needs__clear-all" onClick={clearAll}>Clear all</button>}
      </header>
      {groups.map(({ project, panes: own, chats: asks }) => <Group key={project.id} id={project.id} name={project.name} count={own.length + asks.length}>
        {asks.filter((need) => need.kind === "approval").map((need) => <ChatNeedCard key={need.sessionId} need={need} />)}
        {own.map((pane) => <TerminalNeed key={`pane-${pane.id}`} pane={pane} />)}
        {asks.filter((need) => need.kind === "finished").map((need) => <ChatNeedCard key={need.sessionId} need={need} />)}
      </Group>)}
      {teammates.length > 0 && <Group name="Teammates" count={teammates.length}>
        {teammates.map((item) => <TeammateNeed key={item.id} item={item} teammate={names[item.destination.agentId ?? ""]} />)}
      </Group>}
      {phones.length > 0 && <Group name="iPhone" count={phones.length}>
        {phones.map((device) => <PhoneNeed key={device.id} device={device} />)}
      </Group>}
    </div>
  </main>;
}
