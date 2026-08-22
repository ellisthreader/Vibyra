import type { ProviderAccount } from "../../providerTypes";

interface Props {
  product: string;
  accounts: ProviderAccount[];
  value: string;
  onChange: (accountId: string) => void;
}

/**
 * Which account the next terminal runs as.
 *
 * Only shown when there is a choice to make: one signed-in account is not a
 * decision, it is the answer. Terminals already running are unaffected — a CLI
 * reads its credentials once, at startup, so switching here is about what
 * launches next rather than what is open now.
 */
export function LaunchAccountPicker({ product, accounts, value, onChange }: Props) {
  if (accounts.length < 2) return null;

  return (
    <label className="launch-account">
      <span className="launch-account__label">{product} account</span>
      <select
        className="launch-account__select"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {accounts.map((account, index) => (
          <option key={account.accountId} value={account.accountId}>
            {account.accountLabel || `Account ${index + 1}`}
          </option>
        ))}
      </select>
    </label>
  );
}
