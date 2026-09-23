import { CopyButton } from "../common/CopyButton";

/** The only sight of a set of recovery codes. Said plainly, because the
 * next screen cannot show them again. */
export function RecoveryCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
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
        <CopyButton className="btn" value={() => codes.join("\n")} label="Copy codes" />
        <button className="btn btn--primary" onClick={onDone}>Done</button>
      </div>
    </>
  );
}
