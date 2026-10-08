import type { ReactNode } from "react";

import { ACCOUNTS, CLEAR_ALL, CLOUD_CONSENT_TEXT, LEGAL, NO_PROJECTS, REVIEW, SELECT_ALL, picksCount } from "../../lib/cloudCopy";
import { accountOpenLegal } from "../../ipc/account";
import { IntegrationLogo } from "../settings/IntegrationLogo";
import { NightMark } from "./nightMark";

/** The iPhone's round tick (CloudProjectPicks / CloudAccountsStep). */
function Tick({ on }: { on: boolean }) {
  return (
    <span className={`cc-tick${on ? " is-on" : ""}`} aria-hidden="true">
      {on && <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 4 4L19 6" /></svg>}
    </span>
  );
}

/** First answer: every project as one row, name on the left and a round tick on the right, the open one first. */
export function ProjectPicks({ projects, picked, retained, onChange }: {
  projects: { id: string; name: string }[]; picked: string[]; retained: string[]; onChange(next: string[]): void;
}) {
  if (!projects.length) return <p className="cc-empty">{NO_PROJECTS}</p>;
  const toggle = (id: string) => onChange(picked.includes(id) ? picked.filter((p) => p !== id) : [...picked, id]);
  return (
    <div className="cc-rows" data-testid="cloud-picks">
      {retained.length > 0 && <p className="cc-hint">Your existing Cloud projects stay selected. You can remove them on the Cloud page after connecting.</p>}
      {projects.map((project) => {
        const on = picked.includes(project.id);
        return (
          <button key={project.id} type="button" role="checkbox" aria-checked={on} aria-label={`Send ${project.name}`} disabled={retained.includes(project.id)} className="cc-row" onClick={() => toggle(project.id)}>
            <span className="cc-row__name">{project.name}</span>
            <Tick on={on} />
          </button>
        );
      })}
    </div>
  );
}

/** The count and Select all / Clear beside the projects question ("2 of 6 · Select all"). Nothing for one project. */
export function PicksAside({ projects, picked, retained, onChange }: { projects: { id: string }[]; picked: string[]; retained: string[]; onChange(next: string[]): void }) {
  if (projects.length < 2) return null;
  const count = projects.filter((p) => picked.includes(p.id)).length;
  const every = count === projects.length;
  return (
    <span className="cc-aside">
      <span className="cc-aside__count">{picksCount(count, projects.length)}</span>
      <button type="button" className="cc-link" aria-label={every ? "Clear all projects" : "Select all projects"} disabled={every && count === retained.length}
        onClick={() => onChange(every ? [] : projects.map((p) => p.id))}>{every ? CLEAR_ALL : SELECT_ALL}</button>
    </span>
  );
}

export interface CloudAccounts { claude: boolean; codex: boolean; github: boolean }

/** Available accounts, each explicitly chosen for Cloud. Cloud sign-ins stay separate. */
export function AccountsStep({ has, value, onChange }: { has: CloudAccounts; value: CloudAccounts; onChange(next: CloudAccounts): void }) {
  return (
    <div data-testid="cloud-accounts">
      {(has.codex || has.claude) && <Section label={ACCOUNTS.ai}>
        {has.codex && <AccountRow logo={<NightMark maker="openai" size={32} />} name="Codex" on={value.codex} label="Bring Codex to Vibyra Cloud"
          detail={value.codex ? ACCOUNTS.codexOn : ACCOUNTS.off} onPress={() => onChange({ ...value, codex: !value.codex })} />}
        {has.claude && <AccountRow logo={<NightMark maker="anthropic" size={32} />} name="Claude" on={value.claude} label="Bring Claude to Vibyra Cloud"
          detail={value.claude ? ACCOUNTS.claudeOn : ACCOUNTS.off} onPress={() => onChange({ ...value, claude: !value.claude })} />}
      </Section>}
      {has.github && <Section label={ACCOUNTS.integrations}>
        <AccountRow logo={<IntegrationLogo id="github" size={32} />} name="GitHub" on={value.github} label="Bring GitHub to Vibyra Cloud" detail={value.github ? ACCOUNTS.githubOn : ACCOUNTS.githubOff}
          onPress={() => onChange({ ...value, github: !value.github })} />
      </Section>}
    </div>
  );
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  return <div className="cc-section"><div className="cc-section__label">{label}</div><div className="cc-rows">{children}</div></div>;
}

function AccountRow({ logo, name, detail, label, on, onPress }: {
  logo: ReactNode; name: string; detail: string; label: string; on: boolean; onPress?(): void;
}) {
  return (
    <button type="button" role="checkbox" aria-checked={on} aria-label={label} aria-disabled={!onPress} disabled={!onPress}
      className={`cc-row cc-row--account${onPress ? "" : " is-fixed"}`} onClick={onPress}>
      {logo}
      <span className="cc-row__words"><span className="cc-row__name">{name}</span><span className="cc-row__detail">{detail}</span></span>
      <Tick on={on} />
    </button>
  );
}

export interface ReviewLine { label: string; value: string; onEdit?(): void }

/** The last step's summary of the earlier answers, above the agreement tick. It restates; it asks for nothing. */
export function Review({ lines }: { lines: ReviewLine[] }) {
  return (
    <div className="cc-review" data-testid="connect-plan">
      {lines.map((line) => line.onEdit
        ? <button key={line.label} type="button" className="cc-review__row" aria-label={`Edit ${line.label.toLowerCase()}: ${line.value}`} onClick={line.onEdit}>
          <span className="cc-review__label">{line.label}</span><span className="cc-review__value">{line.value}</span><span className="cc-review__edit">{REVIEW.edit}</span>
        </button>
        : <div key={line.label} className="cc-review__row"><span className="cc-review__label">{line.label}</span><span className="cc-review__value">{line.value}</span></div>)}
    </div>
  );
}

/** The one consent tick, with the terms and privacy notice it refers to (the phone's CloudConsent). */
export function Consent({ checked, onChange }: { checked: boolean; onChange(value: boolean): void }) {
  return (
    <div className="cc-consent">
      <button type="button" role="checkbox" aria-checked={checked} className="cc-consent__choice" onClick={() => onChange(!checked)} data-testid="cloud-consent">
        <span className={`cc-consent__box${checked ? " is-on" : ""}`} aria-hidden="true">
          {checked && <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 4 4L19 6" /></svg>}
        </span>
        <span className="cc-consent__text">{CLOUD_CONSENT_TEXT}</span>
      </button>
      <span className="cc-consent__links">
        <button type="button" className="cc-link cc-link--legal" onClick={() => void accountOpenLegal("terms").catch(() => {})}>{LEGAL.terms}</button>
        <button type="button" className="cc-link cc-link--legal" onClick={() => void accountOpenLegal("privacy").catch(() => {})}>{LEGAL.privacy}</button>
      </span>
    </div>
  );
}
