import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BUTTONS, FLYING_TITLE, LANDED_TITLE, NONE, QUESTIONS, REVIEW, projectsLine } from "../../lib/cloudCopy";
import { useModalFocus } from "../../lib/useModalFocus";
import { useCloudSetupAvailability } from "../../state/cloudAvailability";
import { CloudScene } from "./CloudScene";
import { AccountsStep, Consent, PicksAside, ProjectPicks, Review, type CloudAccounts, type ReviewLine } from "./ConnectSteps";
import { SceneSky } from "./SceneSky";
import { useCloudConnect } from "./useCloudConnect";
import { useCloudHas } from "./useCloudHas";
import "./connect-cloud.css";
import "./connect-scene.css";
import "./cloud-modal.css";

type Step = "projects" | "accounts" | "agree";
type Props = { open: boolean; activeProjectId: string | null; onClose(): void; onDone?(): void };
const NAMES = { claude: "Claude", codex: "Codex", github: "GitHub" };
const MAKERS = { claude: "anthropic", codex: "openai" };

/** The sole desktop Cloud setup. A phone connection grants access to this entry, never opens it. */
export function ConnectCloudFlow(props: Props) {
  const scope = useCloudSetupAvailability();
  return props.open && scope ? <CloudConnectDialog key={scope} {...props} scope={scope} /> : null;
}

function CloudConnectDialog({ scope, activeProjectId, onClose, onDone }: Props & { scope: string }) {
  const page = useRef<HTMLDivElement>(null);
  const answer = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState<Step>("projects");
  const [still, setStill] = useState(() => matchMedia("(prefers-reduced-motion: reduce)").matches);
  const [hidden, setHidden] = useState(document.hidden);
  const flow = useCloudConnect(scope, activeProjectId);
  const { accounts, setAccounts } = flow;
  const inventory = useCloudHas(scope), has = inventory.accounts;
  const connecting = flow.phase === "connecting";
  const flying = connecting || flow.accepted;
  useModalFocus(page, true, () => { if (!connecting) onClose(); });
  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const motion = () => setStill(media.matches), visibility = () => setHidden(document.hidden);
    media.addEventListener("change", motion); document.addEventListener("visibilitychange", visibility);
    return () => { media.removeEventListener("change", motion); document.removeEventListener("visibilitychange", visibility); };
  }, []);
  const steps: Step[] = has.claude || has.codex || has.github ? ["projects", "accounts", "agree"] : ["projects", "agree"];
  const at = steps.indexOf(step);
  const go = (next: Step) => { setStep(next); answer.current?.scrollTo({ top: 0 }); };
  const line = (keys: (keyof CloudAccounts)[]) => keys.filter((key) => has[key] && accounts[key]).map((key) => NAMES[key]).join(", ") || NONE;
  const review: ReviewLine[] = [
    { label: REVIEW.projects, value: projectsLine(flow.chosen.map((p) => p.name)), onEdit: () => go("projects") },
    { label: REVIEW.accounts, value: line(["codex", "claude"]), onEdit: has.codex || has.claude ? () => go("accounts") : undefined },
    { label: REVIEW.integrations, value: line(["github"]), onEdit: has.github ? () => go("accounts") : undefined },
  ];
  const selected = Object.fromEntries((Object.keys(has) as (keyof CloudAccounts)[]).filter((key) => has[key]).map((key) => [key, accounts[key]]));
  const makers = (["codex", "claude"] as const).filter((key) => has[key] && accounts[key]).map((key) => MAKERS[key]);
  const title = flow.phase === "landed" ? LANDED_TITLE : flying ? connecting ? "Connecting…" : flow.wakeFailed ? "Cloud needs attention" : FLYING_TITLE : QUESTIONS[step].title;
  const error = flow.error || inventory.error;
  const loaded = !!flow.status && inventory.ready;

  return createPortal(<div className="cc-backdrop">
    <div className={`cc-page cc-modal${hidden ? " is-background" : ""}`} ref={page} role="dialog" aria-modal="true" aria-label="Connect to cloud">
      <SceneSky dawn={flow.phase === "landed"} />
      <div className="cc-frame">
        <div className="cc-bar">
          {!flow.accepted && <button type="button" className="cc-bar__word" disabled={connecting} onClick={at === 0 ? onClose : () => go(steps[at - 1])}>
            {at === 0 ? BUTTONS.cancel : BUTTONS.back}</button>}
          {flow.accepted && <button className="cc-bar__word" onClick={onDone ?? onClose}>Done</button>}
        </div>
        <div className={`cc-stage${flying ? " is-full" : ""}`}><div className={`cc-scene-frame${flying ? "" : " is-compact"}`}>
          <CloudScene projects={flow.chosen} accounts={makers} phase={flow.phase} arrived={flow.arrived} still={still || hidden} />
        </div></div>
        <section className={`cc-sheet${flying ? "" : " is-fill"}`} data-testid="connect-sheet">
          <div className="cc-sheet__head">
            {!flying && <div className="cc-steps" aria-label={`Step ${at + 1} of ${steps.length}`}>
              {steps.map((item, i) => <span key={item} className={`cc-steps__segment${i <= at ? " is-done" : ""}`} />)}</div>}
            <h2 className="cc-title" aria-live="polite">{title}</h2>
            {!flying && <div className="cc-hint-row"><p className="cc-hint">{QUESTIONS[step].hint}</p>
              {step === "projects" && <PicksAside projects={flow.shelf} picked={flow.picked} retained={flow.retained} onChange={flow.setPicked} />}</div>}
          </div>
          {!flying && <div className="cc-answer" key={step} ref={answer}>
            {!loaded && !error && <p className="cc-empty" role="status">Checking your projects and accounts…</p>}
            {loaded && step === "projects" && <ProjectPicks projects={flow.shelf} picked={flow.picked} retained={flow.retained} onChange={flow.setPicked} />}
            {loaded && step === "accounts" && <AccountsStep has={has} value={accounts} onChange={setAccounts} />}
            {loaded && step === "agree" && <><Review lines={review} /><Consent checked={flow.agreed} onChange={flow.setAgreed} /></>}
          </div>}
          <div className="cc-footer">
            {error && <p className="cc-error" role="alert">{error}</p>}
            {!loaded && error && <button className="cc-link" onClick={() => { flow.retryLoad(); inventory.retry(); }}>Try again</button>}
            {flow.accepted ? <>
              {flow.wakeFailed && <button className="cc-button cc-button--retry" onClick={() => void flow.retryWake()}>Try starting Cloud again</button>}
              <button className="cc-button" onClick={onDone ?? onClose}>Done</button>
            </> : step !== "agree" ? <button className="cc-button" disabled={!loaded} aria-label={step === "projects" ? `Next: ${projectsLine(flow.chosen.map((p) => p.name))}` : "Next: review and connect"}
              onClick={() => go(steps[at + 1])}>Next</button>
              : <button className="cc-button" aria-label="Connect to cloud" disabled={!flow.agreed || !loaded || connecting} aria-busy={connecting}
                onClick={() => void flow.connect(selected)}>{connecting ? BUTTONS.connecting : BUTTONS.connect}</button>}
          </div>
        </section>
      </div>
    </div>
  </div>, document.body);
}
