import { useState } from "react";

/** The only sight of a set of recovery codes. Said plainly, because the
 * next screen cannot show them again. */
export function RecoveryCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(codes.join("\n"));
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  return (
    <>
      <p className="two-factor__lead">
        Save these recovery codes somewhere safe. Each one signs you in once if you lose your
        phone, and this is the only time they are shown.
      </p>
      <ul className="recovery-codes">
        {codes.map((code) => (
          <li key={code}>{code}</li>
        ))}
      </ul>
      <div className="two-factor__confirm">
        <button className="btn" onClick={() => void copy()}>{copied ? "Copied" : "Copy codes"}</button>
        <button className="btn btn--primary" onClick={onDone}>Done</button>
      </div>
    </>
  );
}
