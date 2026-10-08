import type { ReactNode } from "react";
import { cloudSync } from "../../../ipc/cloudSync";
import { cloudHours, cloudStorage } from "../../../lib/cloudOverviewCapacity";
import { computerName } from "../../../lib/platform";
import type { CloudOverview } from "../../../lib/cloudOverviewTypes";
import type { SyncStatus } from "../../../lib/cloudSyncClient";
import type { CloudConfirmation } from "./CloudPageConfirm";
import type { CloudPageController } from "./useCloudPage";

export function CloudDetailRow({ title, detail, children }: { title: string; detail?: string | null; children?: ReactNode }) {
  return <div className="cloud-page__detail-row"><span><strong>{title}</strong>{detail && <small>{detail}</small>}</span>{children}</div>;
}
export function CloudToggle({ checked, disabled, label, onChange }: { checked: boolean; disabled: boolean; label: string; onChange(): void }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled}
    className={`cloud-page__switch${checked ? " is-on" : ""}`} onClick={onChange}><span /></button>;
}
export function CloudCapacityPage({ overview }: { overview: CloudOverview }) {
  const { capacity: c, computer } = overview, hours = c?.hours ?? computer?.hours, compute = computer?.compute;
  const active = c?.sessions?.active ?? computer?.sessionsActive;
  const idle = c?.idleStopSeconds ? `Stops after ${Math.round(c.idleStopSeconds / 60)} min idle` : null;
  const max = c?.maxSessionSeconds ? `${Math.round(c.maxSessionSeconds / 3600)} h max` : null;
  return <section data-testid="cloud-capacity" data-panel="cloudCapacity"><h2 className="cloud-page__sub-title">Cloud capacity</h2>
    <div className="cloud-page__group">
      {compute && <>
        <CloudDetailRow title={`${compute.profile.charAt(0).toUpperCase()}${compute.profile.slice(1)} machine`}><span>{compute.unitsPerHour / 10000} tokens / h</span></CloudDetailRow>
        <CloudDetailRow title="Session token limit" detail="Includes held tokens for runtime and Vibyra-funded AI. One charge for the shared VM.">
          <span>{compute.committedUnits / 10000} / {compute.sessionBudgetUnits / 10000}</span></CloudDetailRow>
        {compute.trialSecondsRemaining !== null && <CloudDetailRow title="Free Cloud Preview" detail="One trial. Pro is required to continue."><span>{Math.ceil(compute.trialSecondsRemaining / 60)} min left</span></CloudDetailRow>}
      </>}
      {hours && <CloudDetailRow title={cloudHours(hours)} detail={hours.allowanceSeconds > 0 ? hours.overage === "blocked" ? "Stops when hours run out" : "Then Vibyra tokens" : null} />}
      {c?.storage && <CloudDetailRow title="Storage"><span>{cloudStorage(c.storage)}</span></CloudDetailRow>}
      {active !== undefined && <CloudDetailRow title={`${active} ${active === 1 ? "session" : "sessions"} running`}
        detail={c?.sessions?.limit !== null && c?.sessions?.limit !== undefined ? `Up to ${c.sessions.limit} at once` : null} />}
      {c?.projectLimit !== undefined && <CloudDetailRow title="Projects"><span>Up to {c.projectLimit}</span></CloudDetailRow>}
      {!hours && !c?.storage && active === undefined && !compute && <p className="cloud-page__empty">Capacity is not available from Cloud yet.</p>}
    </div>
    {(idle || max) && <p className="cloud-page__footnote">{[idle, max].filter(Boolean).join(" · ")}</p>}
  </section>;
}
export function CloudComputerPage({ sync, controller, confirm }: {
  sync: SyncStatus; controller: CloudPageController; confirm(value: CloudConfirmation): void;
}) {
  const busy = !!controller.busy;
  const option = (patch: Parameters<typeof cloudSync.setOptions>[0]) => void controller.change("options", () => cloudSync.setOptions(patch));
  const env = () => sync.includeEnv ? option({ includeEnv: false }) : confirm({
    title: "Include .env files?", detail: "These files can contain private configuration. Files that look like keys or tokens are still kept on this computer.",
    action: "Include .env files", run: () => option({ includeEnv: true }),
  });
  return <section data-testid="cloud-this-computer" data-panel="cloudComputer"><h2 className="cloud-page__sub-title">This computer</h2>
    <div className="cloud-page__group"><CloudDetailRow title={`Pause syncing on this ${computerName}`}
      detail={`Projects stay ticked; this ${computerName} stops sending until you turn it back on.`}>
      <CloudToggle checked={sync.paused} disabled={busy} label={`Pause syncing on this ${computerName}`}
        onChange={() => void controller.change("pause", () => cloudSync.setPaused(!sync.paused))} />
    </CloudDetailRow></div>
    <h3 className="cloud-page__label">What goes with your projects</h3>
    <div className="cloud-page__group">
      <CloudDetailRow title="Include agent conversations" detail="Claude and Codex conversations for each project.">
        <CloudToggle checked={sync.includeConversations} disabled={busy} label="Include agent conversations" onChange={() => option({ includeConversations: !sync.includeConversations })} />
      </CloudDetailRow>
      <CloudDetailRow title="Include .env files" detail="Off by default. Files that look like secrets stay on this computer.">
        <CloudToggle checked={sync.includeEnv} disabled={busy} label="Include .env files" onChange={env} />
      </CloudDetailRow>
      <CloudDetailRow title="Apply safe Cloud changes automatically" detail="Conflicting edits stay here for you to review. A backup is kept before applying.">
        <CloudToggle checked={sync.autoApplySafe} disabled={busy} label="Apply safe Cloud changes automatically" onChange={() => option({ autoApplySafe: !sync.autoApplySafe })} />
      </CloudDetailRow>
    </div>
    {sync.heldBackTotal > 0 && <p className="cloud-page__footnote">{sync.heldBackTotal} {sync.heldBackTotal === 1 ? "file was" : "files were"} kept on this computer because they look like secrets.</p>}
  </section>;
}
export function CloudDeletePage({ busy, onDelete }: { busy: boolean; onDelete(): void }) {
  return <section data-testid="cloud-delete" data-panel="cloudDelete"><h2 className="cloud-page__sub-title">Delete everything in Cloud</h2>
    <p className="cloud-page__description">Vibyra Cloud stops and erases its copies of your projects, its conversations and its AI sign-ins. Your {computerName} keeps everything.</p>
    <p className="cloud-page__description">A project not syncing? Go back and use Sync again on it instead — deleting won’t fix it, and every project then has to be sent again from the start.</p>
    <button type="button" className="cloud-page__danger-row cloud-page__group" disabled={busy} onClick={onDelete}>
      {busy ? "Deleting…" : "Delete everything"}</button>
  </section>;
}
