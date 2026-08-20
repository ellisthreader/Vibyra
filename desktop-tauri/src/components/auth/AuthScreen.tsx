import { useState } from "react";

import logoUrl from "../../assets/vibyra-cobalt.png";
import { accountOpenLegal } from "../../ipc/account";
import { useAccountStore } from "../../state/accountStore";
import { AuthBackdrop } from "./AuthBackdrop";
import { AuthEmailForm } from "./AuthEmailForm";
import { AuthProviders } from "./AuthProviders";
import { AuthSpinner } from "./authMarks";
import { ResizeHandles, WindowControls } from "../layout/WindowChrome";

type Attempt = "google" | "apple" | "email" | null;

export function AuthScreen() {
  const snapshot = useAccountStore((s) => s.snapshot);
  const busy = useAccountStore((s) => s.busy);
  const [emailOpen, setEmailOpen] = useState(false);
  const [lastAttempt, setLastAttempt] = useState<Attempt>(null);

  const restoring = snapshot.status === "restoring";
  const connectionError = snapshot.status === "connectionError";
  const authorizing = snapshot.status === "authorizing";
  const providerError = lastAttempt !== "email" ? snapshot.error : null;
  const emailError = lastAttempt === "email" ? snapshot.error : null;

  const startProvider = (provider: "google" | "apple") => {
    setLastAttempt(provider);
    void useAccountStore.getState().startOauth(provider);
  };

  return (
    <div className="auth" data-auth-theme="dark">
      <AuthBackdrop />
      <div className="auth__scrim" />
      <header className="auth__bar" data-tauri-drag-region>
        <WindowControls />
      </header>
      <main className="auth__viewport">
        <section className="auth-card" aria-label="Sign in to Vibyra">
          <div className="auth-card__hero">
            <span className="auth-card__halo" aria-hidden="true" />
            <img className="auth-card__logo" src={logoUrl} alt="" draggable={false} />
            <h1>
              Welcome to <span>Vibyra</span>
            </h1>
            <p>Sign in to open your workspace.</p>
          </div>
          {restoring && (
            <div className="auth-wait" role="status" aria-live="polite">
              <AuthSpinner />
              <span>Restoring your session…</span>
            </div>
          )}
          {connectionError && (
            <div className="auth-wait auth-wait--error" role="status" aria-live="polite">
              <span>{snapshot.error ?? "Vibyra could not reach the account service."}</span>
              <button
                className="auth-submit"
                onClick={() => void useAccountStore.getState().restore()}
              >
                Retry
              </button>
            </div>
          )}
          {!restoring && !connectionError && (
            <>
              <AuthProviders
                authorizing={authorizing || busy}
                pendingProvider={snapshot.pendingProvider}
                providerError={providerError}
                emailOpen={emailOpen}
                onProvider={startProvider}
                onCancel={() => void useAccountStore.getState().cancelOauth()}
                onToggleEmail={() => {
                  useAccountStore.getState().clearError();
                  setLastAttempt(null);
                  setEmailOpen(!emailOpen);
                }}
              />
              <div
                className={`auth-reveal auth-reveal--form ${emailOpen ? "auth-reveal--open" : ""}`}
                inert={!emailOpen}
              >
                <div className="auth-reveal__inner">
                  <AuthEmailForm
                    active={emailOpen}
                    busy={authorizing || busy}
                    serverError={emailError}
                    onLogin={(email, password) => {
                      setLastAttempt("email");
                      void useAccountStore.getState().loginEmail(email, password);
                    }}
                    onSignup={(name, email, password) => {
                      setLastAttempt("email");
                      void useAccountStore.getState().signupEmail(name, email, password);
                    }}
                    onForgot={(email) => useAccountStore.getState().forgotPassword(email)}
                    onResetError={() => useAccountStore.getState().clearError()}
                  />
                </div>
              </div>
            </>
          )}
        </section>
      </main>
      <footer className="auth__legal">
        <span>By continuing, you agree to our</span>
        <button className="auth-link" onClick={() => void accountOpenLegal("privacy")}>
          Privacy Policy
        </button>
        <span aria-hidden="true">·</span>
        <button className="auth-link" onClick={() => void accountOpenLegal("terms")}>
          Terms of Service
        </button>
      </footer>
      <ResizeHandles />
    </div>
  );
}
