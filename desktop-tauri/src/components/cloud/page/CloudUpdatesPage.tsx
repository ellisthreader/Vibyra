import { useCallback, useEffect, useRef, useState } from "react";
import { cloudPage } from "../../../ipc/cloudPage";
import { cloudSync } from "../../../ipc/cloudSync";
import { cloudDetail, cloudMoving, cloudReady, cloudSentence, overviewRows } from "../../../lib/cloudOverview";
import { cloudAccountsLine, cloudCapacityLine } from "../../../lib/cloudOverviewCapacity";
import { CloudProgressClock, cloudOverall, cloudTimeLine } from "../../../lib/cloudOverviewProgress";
import type { CloudLiveRow } from "../../../lib/cloudOverviewTypes";
import { computerName } from "../../../lib/platform";
import { useWorkspaceStore } from "../../../state/workspaceStore";
import { SceneSky } from "../SceneSky";
import { CloudAccountsPage } from "./CloudAccountsPage";
import { CloudChangeReview } from "./CloudChangeReview";
import { CloudLiveProjects, CloudProjectChoices, cloudProjectChoices, type CloudProjectChoice } from "./CloudLiveProjects";
import { CloudPageConfirm, type CloudConfirmation } from "./CloudPageConfirm";
import { CloudCapacityPage, CloudComputerPage, CloudDeletePage } from "./CloudPageDetails";
import { CloudPageHero } from "./CloudPageHero";
import { useCloudPage } from "./useCloudPage";
import "../connect-scene.css";
import "./cloud-page.css";

type Page = "main" | "accounts" | "capacity" | "computer" | "delete" | "review";
export function CloudUpdatesPage({ onDisconnected }: { onDisconnected(): void }) {
  const c = useCloudPage(), { overview, sync } = c;
  const [page, setPage] = useState<Page>("main"), [editing, setEditing] = useState(false);
  const [confirmation, setConfirmation] = useState<CloudConfirmation | null>(null);
  const [review, setReview] = useState<{ id: string; name: string } | null>(null);
  const [now, setNow] = useState(Date.now), clock = useRef(new CloudProgressClock());
  const [scrolled, setScrolled] = useState(false);
  const content = useRef<HTMLDivElement>(null), opener = useRef<HTMLElement | null>(null), openerKey = useRef<string | null>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const close = useWorkspaceStore(s => s.closeSettings);
  const panel = useWorkspaceStore(s => s.settingsPanel), clearPanel = useWorkspaceStore(s => s.clearSettingsPanel);
  const closeConfirm = useCallback(() => setConfirmation(null), []);
  useEffect(() => { if (c.current()) closeButton.current?.focus(); }, [c.current]);
  useEffect(() => {
    const body = closeButton.current?.closest(".settings-pane__body");
    if (!body) return;
    const update = () => setScrolled(body.scrollTop > 12);
    update(); body.addEventListener("scroll", update, { passive: true });
    return () => body.removeEventListener("scroll", update);
  }, []);
  const navigate = (next: Page, focusKey?: string) => {
    if (next !== "main") {
      opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      openerKey.current = focusKey ?? opener.current?.dataset.testid ?? null;
    }
    setPage(next);
  };
  useEffect(() => {
    if (page === "main") {
      const replacement = [...content.current?.querySelectorAll<HTMLElement>("[data-testid]") ?? []].find(node => node.dataset.testid === openerKey.current);
      (replacement ?? (opener.current?.isConnected ? opener.current : closeButton.current))?.focus();
    }
    else content.current?.querySelector<HTMLButtonElement>(".cloud-page__back")?.focus();
  }, [page]);
  useEffect(() => {
    if (!panel?.startsWith("cloud")) return;
    const destination: Record<string, Page> = { cloudAccounts: "accounts", cloudCapacity: "capacity", cloudComputer: "computer", cloudDelete: "delete" };
    setPage(destination[panel] ?? "main");
    if (panel === "cloudProjects") {
      setEditing(true);
      requestAnimationFrame(() => {
        if (!c.current()) return;
        const section = content.current?.querySelector<HTMLElement>('[data-panel="cloudProjects"]');
        section?.scrollIntoView({ block: "start" }); section?.querySelector<HTMLButtonElement>("button")?.focus();
      });
    } else if (panel === "cloudStatus") {
      setEditing(false); content.current?.closest(".settings-pane__body")?.scrollTo({ top: 0 });
    }
    clearPanel();
  }, [panel, clearPanel, c.current]);
  const at = Math.max(now, Date.now());
  const rows = overview && sync ? overviewRows(overview, sync, at, computerName) : [];
  const syncing = rows.some(cloudMoving), chip = overview?.computer?.chip ?? null;
  useEffect(() => {
    if (!syncing || !c.visible || page !== "main") return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [syncing, c.visible, page]);
  useEffect(() => { if (overview && !overview.connected && c.current()) onDisconnected(); }, [overview, c.current, onDisconnected]);
  const bars = Object.fromEntries(rows.map(row => [row.key, clock.current.progress(row, at)]));
  const done = rows.length > 0 && rows.every(cloudReady), level = done ? 1 : cloudOverall(rows, bars);
  const detail = syncing ? cloudTimeLine(bars, at) : cloudDetail(rows, chip, sync?.paused ?? false, computerName);
  const action = (kind: "wake" | "stop") => {
    const run = () => void c.change(kind, () => cloudPage.action(kind));
    if (kind === "stop") setConfirmation({ title: "Stop Vibyra Cloud?", detail: "Running Cloud sessions stop. Your projects stay saved in Cloud.", action: "Stop Cloud", run });
    else run();
  };
  const select = (project: CloudProjectChoice) => {
    const run = () => void c.change(`project:${project.key}`, () => project.localId
      ? cloudSync.setProject(project.localId, !project.allowed)
      : cloudPage.action("project", { projectKey: project.projectKey!, name: project.name, enabled: !project.allowed, confirmed: project.allowed }));
    if (project.allowed) setConfirmation({ title: `Remove ${project.name} from Vibyra Cloud?`,
      detail: `Its cloud copy is deleted. Your ${computerName} keeps everything.`, action: "Remove", danger: true, run });
    else run();
  };
  const erase = () => setConfirmation({ title: "Delete everything in Vibyra Cloud?", action: "Delete everything", danger: true,
    detail: `Vibyra Cloud stops, and its copies of your projects, its conversations and its AI sign-ins are erased for good. Your ${computerName} keeps everything. To use Cloud again, every project is sent from the start.`,
    run: () => { void c.change("delete", () => cloudPage.action("disconnect", { confirmed: true })); },
  });
  const openReview = (row: CloudLiveRow) => { if (row.localId) { setReview({ id: row.localId, name: row.name }); navigate("review", `cloud-review-${row.localId}`); } };
  const nav = (title: string, to: Page, summary?: string | null, danger = false) => <button type="button"
    className={`cloud-page__nav-row${danger ? " is-danger" : ""}`} onClick={() => navigate(to, `cloud-row-${to}`)} data-testid={`cloud-row-${to}`}>
    <span><strong>{title}</strong>{summary && <small>{summary}</small>}</span><span className="cloud-page__chevron" aria-hidden="true">›</span></button>;
  if (!c.scope) return null;
  return <div className={`cloud-page${page !== "main" ? " cloud-page--sub" : ""}`} data-visible={c.visible} data-testid="cloud-settings">
    <div className="cloud-page__sky"><SceneSky dawn={done} /></div>
    <header className={`cloud-page__header${scrolled ? " is-scrolled" : ""}`}><h1>Vibyra Cloud</h1><button type="button" ref={closeButton} aria-label="Close Vibyra Cloud" onClick={close}>×</button></header>
    <div className="cloud-page__content" ref={content}>
      {page !== "main" && <button type="button" className="cloud-page__back" onClick={() => navigate("main")}>‹ <span>Vibyra Cloud</span></button>}
      {page === "main" ? <>
        <CloudPageHero sentence={overview && !overview.enabled ? "Vibyra Cloud is unavailable" : overview && sync ? cloudSentence(rows, chip, computerName) : "Checking Vibyra Cloud…"}
          detail={overview ? detail : null} level={level} done={done} syncing={syncing} chip={chip} busy={!!c.busy} onAction={action} />
        {sync?.paused && <div className="cloud-page__resume"><span>Syncing is paused on this {computerName}</span><button type="button" disabled={!!c.busy}
          onClick={() => void c.change("resume", () => cloudSync.setPaused(false))}>Resume</button></div>}
        <div className="cloud-page__section-head" data-panel="cloudProjects"><h2>{editing ? "Choose projects" : "Live"}</h2>
          {overview && sync && <button type="button" onClick={() => setEditing(!editing)}>{editing ? "Done" : "Edit"}</button>}</div>
        {overview && sync ? editing ? <CloudProjectChoices projects={cloudProjectChoices(sync, overview.projects)} busy={!!c.busy} onChange={select} />
          : <CloudLiveProjects rows={rows} bars={bars} busy={c.busy} onChoose={() => setEditing(true)} onReview={openReview}
            onRepair={row => { if (row.projectKey) void c.change(`repair:${row.key}`, () => cloudPage.action("repair", { projectKey: row.projectKey! })); }} />
          : <p className="cloud-page__footnote">{c.error ? "Cloud’s latest update could not be loaded." : "Checking your projects…"}</p>}
        {overview && sync && <><h2 className="cloud-page__label">Settings</h2><div className="cloud-page__group">
          {nav("AI accounts", "accounts", cloudAccountsLine(overview))}{nav("Capacity", "capacity", cloudCapacityLine(overview.capacity, overview.computer))}
          {nav("This computer", "computer", sync.paused ? "Syncing paused" : null)}
        </div><div className="cloud-page__group cloud-page__delete-link">{nav("Delete everything in Cloud…", "delete", null, true)}</div></>}
      </> : overview && sync && <>
        {page === "accounts" && <CloudAccountsPage overview={overview} controller={c} />}
        {page === "capacity" && <CloudCapacityPage overview={overview} />}
        {page === "computer" && <CloudComputerPage sync={sync} controller={c} confirm={setConfirmation} />}
        {page === "delete" && <CloudDeletePage busy={!!c.busy} onDelete={erase} />}
        {page === "review" && review && <CloudChangeReview project={review} controller={c} confirm={setConfirmation} />}
      </>}
      {(c.error || overview?.computer?.error) && <div className="cloud-page__error" role="alert"><span>{c.error || overview?.computer?.error}</span>
        {c.error && <button type="button" className="cloud-page__text-action" disabled={!!c.busy} onClick={() => void c.refresh()}>Try again</button>}</div>}
    </div>
    {confirmation && <CloudPageConfirm confirmation={confirmation} onClose={closeConfirm} />}
  </div>;
}
