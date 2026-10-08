import { useId, useState } from "react";

interface Props {
  /** The provider CLI's own words, shown verbatim. */
  prompt: string;
  busy: boolean;
  onSubmit: (value: string) => void;
}

/**
 * Answers the question a provider sign-in stops on.
 *
 * Every one of these CLIs can end its browser hand-off by printing a code and
 * waiting to be told it — `claude auth login` always does. Without somewhere
 * to type, that sign-in cannot finish at all, however many times the Connect
 * button is pressed.
 */
export function ProviderAccountReply({ prompt, busy, onSubmit }: Props) {
  const [value, setValue] = useState("");
  const inputId = useId();

  return (
    <form
      className="integration-reply"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(value);
        setValue("");
      }}
    >
      <label className="integration-reply__prompt" htmlFor={inputId}>{prompt}</label>
      <span className="integration-reply__row">
        <input
          id={inputId}
          className="input"
          value={value}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          onChange={(event) => setValue(event.target.value)}
        />
        <button type="submit" className="btn btn--primary" disabled={busy}>Send</button>
      </span>
    </form>
  );
}
