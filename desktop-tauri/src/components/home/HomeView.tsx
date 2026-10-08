import { useState } from "react";

import { useChatNeeds, useNeedsYou, useNeedsYouTotal } from "../../lib/needsYou";
import { openNewProject } from "../../state/newProject";
import { useProjectStore } from "../../state/projectStore";
import { useProjects } from "../../state/settingsStore";
import { PlusIcon } from "../common/Icons";
import { HomeNeedsPill } from "./HomeNeedsPill";
import { HomeProjectTile } from "./HomeProjectTile";
import { HomeSpotlight } from "./HomeSpotlight";

const SHOWN = 6;

/** Home (owner 2026-10-05, option A): the project you were last in, with its
 * agents at work, then every other project as a tile. While anything waits,
 * a small pill beside the first heading leads to Needs you. */
export function HomeView() {
  const projects = useProjects();
  const pickAndCreate = useProjectStore((s) => s.pickAndCreate);
  const waiting = useNeedsYouTotal();
  const [all, setAll] = useState(false);
  // Projects waiting on you come first among the tiles, so several at once stay easy to spot.
  const flagged = new Set([...useChatNeeds().map((need) => need.projectId), ...useNeedsYou().map((pane) => pane.projectId)]);
  const [current, ...rest] = [...projects].sort((a, b) => b.lastOpenedMs - a.lastOpenedMs);
  const others = [...rest].sort((a, b) => Number(flagged.has(b.id)) - Number(flagged.has(a.id)));
  const shown = all ? others : others.slice(0, SHOWN);
  return (
    <main className="homeview sb-home">
      <h1 className="sr-only">Home</h1>
      <div className="sb-home__inner">
        {current && <section className="sb-home__section" aria-label="Pick up where you left off">
          <div className="sb-home__head">
            <h2 className="sb-home__label">Pick up where you left off</h2>
            {waiting > 0 && <HomeNeedsPill count={waiting} projects={projects.filter((project) => flagged.has(project.id))} />}
          </div>
          <HomeSpotlight project={current} />
        </section>}
        <section className="sb-home__section" aria-label="Projects">
          <div className="sb-home__head">
            <h2 className="sb-home__label">{current ? "Projects" : "Get started"}</h2>
            <button type="button" className="btn btn--primary sb-home__new" data-welcome-focus onClick={openNewProject}><PlusIcon size={13} />New project</button>
          </div>
          {!current ? <div className="sb-home__empty">
            <h3>Every great project starts somewhere.</h3>
            <p>Create something new, or open a folder you already work in.</p>
            <button type="button" className="btn sb-home__folder" onClick={() => void pickAndCreate()}>Open a folder</button>
          </div> : others.length > 0 ? <>
            <div className="sb-tiles">{shown.map((project) => <HomeProjectTile key={project.id} project={project} />)}</div>
            {others.length > SHOWN && <button type="button" className="sb-tiles__more" onClick={() => setAll(!all)}>{all ? "Show fewer" : `Show all ${others.length}`}</button>}
          </> : <p className="sb-home__hint">Your other projects will appear here.</p>}
        </section>
      </div>
    </main>
  );
}
