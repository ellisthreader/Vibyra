import { useEffect, useState } from "react";

import type { ProviderAccount } from "../../providerTypes";
import { CheckIcon, ChevronDownIcon } from "../common/Icons";

interface Props {
  product: string;
  accounts: ProviderAccount[];
  value: string;
  onChange: (accountId: string) => void;
}

const accountName = (account: ProviderAccount, index: number) =>
  account.accountLabel || `Account ${index + 1}`;

/**
 * Which account the next terminal runs as.
 *
 * Only shown when there is a choice to make: one signed-in account is not a
 * decision, it is the answer. Terminals already running are unaffected — a CLI
 * reads its credentials once, at startup, so switching here is about what
 * launches next rather than what is open now.
 */
export function LaunchAccountPicker({ product, accounts, value, onChange }: Props) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  if (accounts.length < 2) return null;
  const currentIndex = Math.max(0, accounts.findIndex((account) => account.accountId === value));
  const current = accounts[currentIndex];

  return (
    <div className="launch-row launch-account" role="group" aria-label={`${product} account`}>
      <span className="launch-row__label">
        <strong>{product} account</strong>
        <small>For the next terminal only</small>
      </span>
      <button
        type="button"
        className="launch-select"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls="launch-account-menu"
        onClick={() => setOpen(!open)}
      >
        <span>{accountName(current, currentIndex)}</span>
        <ChevronDownIcon size={12} />
      </button>
      {open && (
        <>
          <div className="launch-model__backdrop" onClick={() => setOpen(false)} />
          <div
            id="launch-account-menu"
            className="launch-menu launch-menu--right"
            role="listbox"
            aria-label={`${product} account`}
          >
            {accounts.map((account, index) => (
              <button
                key={account.accountId}
                type="button"
                role="option"
                aria-selected={index === currentIndex}
                className="launch-option"
                onClick={() => {
                  onChange(account.accountId);
                  setOpen(false);
                }}
              >
                <span className="launch-option__copy">
                  <strong>{accountName(account, index)}</strong>
                </span>
                {index === currentIndex && <CheckIcon size={14} />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
