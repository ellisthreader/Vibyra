import { useCallback, useEffect, useRef, useState } from "react";
import { cloudPage } from "../../../ipc/cloudPage";
import { cloudLoginCanAllow, cloudLoginWords } from "../../../lib/cloudOverviewLogin";
import type { CloudLoginView, CloudOverview, CloudProvider } from "../../../lib/cloudOverviewTypes";
import { computerName } from "../../../lib/platform";
import { CloudDetailRow, CloudToggle } from "./CloudPageDetails";
import type { CloudPageController } from "./useCloudPage";

const NAMES = { claude: "Claude", codex: "Codex", github: "GitHub" };

/** Provider permission is separate from Cloud's independent browser login. */
export function CloudAccountsPage({ overview, controller }: { overview: CloudOverview; controller: CloudPageController }) {
  const [views, setViews] = useState<CloudLoginView[]>([]), [error, setError] = useState("");
  const live = useRef(true), version = useRef(0), reading = useRef(false), loginBusy = useRef(false);
  const current = controller.current;
  const refresh = useCallback(async () => {
    if (!current() || document.hidden || reading.current || loginBusy.current) return;
    reading.current = true;
    const at = version.current;
    try {
      const next = await cloudPage.logins();
      if (live.current && current() && at === version.current) { setViews(next); setError(""); }
    } catch (cause) { if (live.current && current() && at === version.current) setError(String(cause)); }
    finally { reading.current = false; }
  }, [current]);
  useEffect(() => {
    live.current = true; void refresh();
    const timer = window.setInterval(() => void refresh(), 3_000);
    document.addEventListener("visibilitychange", refresh);
    return () => { live.current = false; version.current++; window.clearInterval(timer); document.removeEventListener("visibilitychange", refresh); };
  }, [refresh]);
  const login = async (id: "claude" | "codex", stop = false) => {
    if (loginBusy.current || !current()) return;
    loginBusy.current = true; version.current++;
    try {
      const next = await controller.run(`login:${id}`, () => stop ? cloudPage.stopLogin() : cloudPage.allowLogin(id));
      if (next && live.current && current()) setViews(next);
    } finally { loginBusy.current = false; }
  };
  const toggle = (id: CloudProvider) => void controller.change(`provider:${id}`, () =>
    cloudPage.action("provider", { provider: id, enabled: !overview.providers[id].enabled }));
  return <section data-testid="cloud-accounts" data-panel="cloudAccounts"><h2 className="cloud-page__sub-title">AI accounts</h2>
    <p className="cloud-page__description">Sign in once for Vibyra Cloud. Your computer’s login stays separate.</p>
    <div className="cloud-page__group">
      {(["claude", "codex"] as const).map(id => {
        const provider = overview.providers[id], view = views.find(v => v.id === id);
        const canAllow = cloudLoginCanAllow(view, provider);
        return <div className="cloud-page__account" key={id}>
          <CloudDetailRow title={NAMES[id]} detail={provider.enabled === null ? "Account choices are unavailable from Cloud." : provider.enabled ? cloudLoginWords(view, provider, computerName) : "Not available in Vibyra Cloud."}>
            <CloudToggle checked={provider.enabled === true} disabled={!!controller.busy || provider.enabled === null} label={`Use ${NAMES[id]} in Vibyra Cloud`} onChange={() => toggle(id)} />
          </CloudDetailRow>
          {provider.enabled && (canAllow || view?.state === "allowing") && <div className="cloud-page__account-action">
            <button type="button" className="cloud-page__action cloud-page__action--small" disabled={!!controller.busy}
              aria-label={view?.state === "allowing" ? `Stop signing in to ${NAMES[id]}` : `Allow ${NAMES[id]} in Vibyra Cloud`}
              onClick={() => void login(id, view?.state === "allowing")}>{view?.state === "allowing" ? "Stop sign-in" : view?.state === "done" ? "Sign in again" : view?.state === "waitingForCloud" ? "Try again" : "Allow"}</button>
          </div>}
        </div>;
      })}
    </div>
    <h3 className="cloud-page__label">Integrations</h3>
    <div className="cloud-page__group"><CloudDetailRow title="GitHub" detail={overview.providers.github.enabled === null ? "GitHub choices are unavailable from Cloud."
      : overview.providers.github.enabled ? "GitHub access for your Cloud projects." : "Vibyra Cloud gets no GitHub access."}>
      <CloudToggle checked={overview.providers.github.enabled === true} disabled={!!controller.busy || overview.providers.github.enabled === null}
        label="Use GitHub in Vibyra Cloud" onChange={() => toggle("github")} />
    </CloudDetailRow></div>
    {error && <p className="cloud-page__error" role="alert">{error}</p>}
  </section>;
}
