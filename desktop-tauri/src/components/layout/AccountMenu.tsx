import { useEffect, useRef, useState } from "react";

import { avatarInitial, logoutConfirmCopy } from "../../lib/accountPolicy";
import { navUpdateCopy } from "../../lib/updatePolicy";
import { useAccountStore } from "../../state/accountStore";
import { useReportStore } from "../../state/reportStore";
import { useTerminalStore } from "../../state/terminalStore";
import { useUpdateStore } from "../../state/updateStore";
import { useWorkspaceStore } from "../../state/workspaceStore";

export function AccountMenu() {
  const profile = useAccountStore((s) => s.snapshot.profile);
  const busy = useAccountStore((s) => s.busy);
  const panes = useTerminalStore((s) => s.panes);
  const openSettingsSection = useWorkspaceStore((s) => s.openSettingsSection);
  const updateStatus = useUpdateStore((s) => s.status);
  const updateVersion = useUpdateStore((s) => s.version);
  const updateProgress = useUpdateStore((s) => s.progress);
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const running = panes.filter((p) => p.status === "running").length;
  const confirmCopy = logoutConfirmCopy(running);
  // Both moved off the titlebar: a lifebuoy and an update chip were two of the
  // seven controls in a row that is now four.
  const update = navUpdateCopy(updateStatus, updateVersion, updateProgress);

  const close = (restoreFocus: boolean) => {
    setOpen(false);
    setConfirming(false);
    if (restoreFocus) buttonRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) close(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        close(true);
      }
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        const items = Array.from(
          menuRef.current?.querySelectorAll<HTMLButtonElement>("[role='menuitem']") ?? [],
        );
        if (items.length === 0) return;
        event.preventDefault();
        const index = items.indexOf(document.activeElement as HTMLButtonElement);
        const step = event.key === "ArrowDown" ? 1 : -1;
        items[(index + step + items.length) % items.length].focus();
      }
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open]);

  useEffect(() => {
    if (open) {
      menuRef.current?.querySelector<HTMLButtonElement>("[role='menuitem']")?.focus();
    }
  }, [open, confirming]);

  /** Never respects `dismissed`, so a live release stays reachable from here. */
  const actOnUpdate = () => {
    const store = useUpdateStore.getState();
    if (store.status === "ready" || store.status === "restartError") void store.restart();
    else if (store.status !== "downloading" && store.status !== "installing") void store.download();
  };

  const requestLogout = () => {
    if (confirmCopy) {
      setConfirming(true);
      return;
    }
    void useAccountStore.getState().logout();
  };

  return (
    <div className="account" ref={rootRef}>
      <button
        ref={buttonRef}
        className="account-btn"
        aria-label="Account"
        aria-haspopup="menu"
        aria-expanded={open}
        title={profile ? profile.email : "Account"}
        onClick={() => (open ? close(false) : setOpen(true))}
      >
        <span aria-hidden="true">{avatarInitial(profile)}</span>
      </button>
      {open && (
        <div className="account-menu" role="menu" aria-label="Account menu" ref={menuRef}>
          <div className="account-menu__identity">
            <strong>{profile?.name || "Vibyra account"}</strong>
            <span>{profile?.email}</span>
          </div>
          <div className="account-menu__sep" role="separator" />
          {confirming ? (
            <div className="account-menu__confirm">
              <p>{confirmCopy}</p>
              <div className="account-menu__confirm-row">
                <button role="menuitem" className="btn" onClick={() => close(true)}>
                  Cancel
                </button>
                <button
                  role="menuitem"
                  className="btn account-menu__danger"
                  disabled={busy}
                  onClick={() => void useAccountStore.getState().logout()}
                >
                  {busy ? "Logging out…" : "Log out"}
                </button>
              </div>
            </div>
          ) : (
            <>
              <button
                role="menuitem"
                className="account-menu__item"
                onClick={() => {
                  close(false);
                  openSettingsSection("profile");
                }}
              >
                Settings
              </button>
              <button
                role="menuitem"
                className="account-menu__item"
                onClick={() => {
                  close(false);
                  void useReportStore.getState().begin();
                }}
              >
                Report a bug
              </button>
              {update && (
                <button
                  role="menuitem"
                  className={`account-menu__item account-menu__update account-menu__update--${updateStatus}`}
                  title={update.title}
                  disabled={update.busy}
                  onClick={actOnUpdate}
                >
                  <span className="account-menu__update-dot" aria-hidden="true" />
                  {update.label}
                </button>
              )}
              <div className="account-menu__sep" role="separator" />
              <button
                role="menuitem"
                className="account-menu__item"
                disabled={busy}
                onClick={requestLogout}
              >
                Log out
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
