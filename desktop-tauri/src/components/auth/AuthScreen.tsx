import { platformName } from "../../lib/platform";
import { useState } from "react";

import logoUrl from "../../assets/vibyra-cobalt.png";
import { accountOpenLegal } from "../../ipc/account";
import { useAccountStore } from "../../state/accountStore";
import { AuthMobileCampaign } from "./AuthMobileCampaign";
import { AuthEmailForm } from "./AuthEmailForm";
import { AuthProviders } from "./AuthProviders";
import { AuthTwoFactorForm } from "./AuthTwoFactorForm";
import { AuthSpinner } from "./authMarks";
import { ResizeHandles, WindowControls } from "../layout/WindowChrome";


type Attempt = "google" | "apple" | "email" | null;

export function AuthScreen() {
  const snapshot = useAccountStore((s) => s.snapshot);
  const busy = useAccountStore((s) => s.busy);
  const [recovering, setRecovering] = useState(false);
  const [signup, setSignup] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [lastAttempt, setLastAttempt] = useState<Attempt>(null);

  const restoring = snapshot.status === "restoring";
  const connectionError = snapshot.status === "connectionError";
  const authorizing = snapshot.status === "authorizing";
  const twoFactor = snapshot.status === "twoFactor";
  const providerError = lastAttempt !== "email" ? snapshot.error : null;
  const emailError = lastAttempt === "email" ? snapshot.error : null;

  const startProvider = (provider: "google" | "apple") => {
    setLastAttempt(provider);
    void useAccountStore.getState().startOauth(provider);
  };

  return (
    <div className="auth auth-pocket">
      <header className="auth__bar" data-tauri-drag-region>
        <span className="auth__window-title">Vibyra</span>
        <WindowControls />
      </header>
      <main className="auth__viewport pocket-layout">
        <AuthMobileCampaign side="left" />
        <div className="pocket-signin">
        <section className="auth-card login" aria-label="Sign in to Vibyra">
          <div className="brand brand--spotlight"><div className="brand__mark"><img src={logoUrl} alt="" /></div></div>
          <div className="login-heading">
            <h1>{emailOpen ? recovering ? "A fresh start." : signup ? "Make it your own." : "Welcome back." : "Welcome to Vibyra"}</h1>
            <p>{twoFactor ? "One more step." : emailOpen ? recovering ? "Enter your email to reset your password." : signup ? "Create your Vibyra account." : "Sign in with your email address." : `Sign in to your ${platformName} workspace.`}</p>
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
          {twoFactor && <AuthTwoFactorForm busy={busy} error={snapshot.error} />}
          {!restoring && !connectionError && !twoFactor && (
            <>
              {!emailOpen && <AuthProviders
                authorizing={authorizing || busy}
                pendingProvider={snapshot.pendingProvider}
                providerError={providerError}
                emailOpen={emailOpen}
                onProvider={startProvider}
                onCancel={() => void useAccountStore.getState().cancelOauth()}
                onToggleEmail={() => {
                  useAccountStore.getState().clearError();
                  setLastAttempt(null);
                  setRecovering(false);
                  setSignup(false);
                  setEmailOpen(true);
                }}
              />}
              {!emailOpen && <p className="account-prompt">New here? <button className="text-button" disabled={authorizing || busy} onClick={() => { setRecovering(false); setSignup(true); setEmailOpen(true); useAccountStore.getState().clearError(); }}>Create an account</button></p>}
              <div
                className={`auth-reveal auth-reveal--form ${emailOpen ? "auth-reveal--open" : ""}`}
                inert={!emailOpen}
              >
                <div className="auth-reveal__inner">
                  <AuthEmailForm
                    active={emailOpen}
                    initialMode={signup ? "signup" : "login"}
                    onRecoveryChange={setRecovering}
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
              {emailOpen && <div className="back"><button disabled={authorizing || busy} onClick={() => { setEmailOpen(false); useAccountStore.getState().clearError(); }}>← &nbsp; All sign-in options</button></div>}
            </>
          )}
        </section>
        </div>
        <AuthMobileCampaign side="right" />
      </main>
      <footer className="auth__legal">
        <span>By continuing, you agree to our</span>
        <button className="auth-link" onClick={() => void accountOpenLegal("terms")}>Terms</button>
        <span>and</span>
        <button className="auth-link" onClick={() => void accountOpenLegal("privacy")}>Privacy Policy</button><span>.</span>
      </footer>
      <ResizeHandles />
    </div>
  );
}
