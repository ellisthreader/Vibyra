import { useState } from "react";

import { openOpenAiKeyPage } from "../../ipc/ai";
import { useAiServiceStore } from "../../state/aiServiceStore";
import type { AiServiceStatus } from "../../types";
import { EyeIcon, LinkIcon } from "../common/Icons";

const STEPS = [
  <>Open <strong>platform.openai.com/api-keys</strong> and sign in.</>,
  <>Add a payment method under <strong>Billing</strong>; a key with no credit returns a quota error.</>,
  <>Choose <strong>Create new secret key</strong>, name it “Vibyra”, copy it. OpenAI shows it once.</>,
];

/**
 * The key itself: the steps to get one only while there is none, then the
 * paste field, then what happens to it. The key goes to the operating
 * system's credential store and nowhere else.
 */
export function OpenAiKeyCard({ status }: { status: AiServiceStatus }) {
  const busy = useAiServiceStore((state) => state.busy);
  const error = useAiServiceStore((state) => state.error);
  const saved = useAiServiceStore((state) => state.saved);
  const save = useAiServiceStore((state) => state.save);
  const remove = useAiServiceStore((state) => state.remove);
  const [draft, setDraft] = useState("");
  const [reveal, setReveal] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const submit = async () => {
    if (!draft.trim() || busy) return;
    if (await save(draft)) setDraft("");
  };

  return (
    <article className="ai-key ai-key--inset">
      {!status.keyConfigured ? (
        <ol className="ai-key__steps">
          {STEPS.map((step, index) => <li key={index}>{step}</li>)}
        </ol>
      ) : null}

      <div className="ai-key__entry">
        <div className="ai-key__field">
          <input
            className="input"
            type={reveal ? "text" : "password"}
            value={draft}
            placeholder={status.keyConfigured ? "Paste a new key to replace the current one" : "sk-…"}
            aria-label="OpenAI API key"
            autoComplete="off"
            spellCheck={false}
            disabled={busy}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void submit();
            }}
          />
          <button type="button" className="icon-btn" aria-label={reveal ? "Hide key" : "Show key"} aria-pressed={reveal} onClick={() => setReveal((value) => !value)}>
            <EyeIcon size={14} />
          </button>
        </div>
        <button type="button" className="btn btn--primary" disabled={busy || !draft.trim()} onClick={() => void submit()}>
          {busy ? "Checking…" : "Save key"}
        </button>
      </div>

      <div className="ai-key__foot">
        <button type="button" className="ai-key__link" onClick={() => void openOpenAiKeyPage()}>
          <LinkIcon size={13} />Open the OpenAI keys page
        </button>
        {status.keyConfigured ? (
          confirmRemove ? (
            <span className="ai-key__confirm">
              <button type="button" className="btn" onClick={() => setConfirmRemove(false)}>Keep</button>
              <button type="button" className="btn btn--danger" disabled={busy} onClick={() => { setConfirmRemove(false); void remove(); }}>Remove key</button>
            </span>
          ) : (
            <button type="button" className="ai-key__remove" disabled={busy} onClick={() => setConfirmRemove(true)}>Remove key</button>
          )
        ) : null}
      </div>

      {error ? <p className="ai-key__error" role="alert">{error}</p> : null}
      {saved && !error ? <p className="ai-key__ok" role="status">Key verified with OpenAI and stored.</p> : null}

      <p className="ai-key__note">
        Stored in your operating system’s credential store, never in settings.json or on a
        Vibyra server. Requests go straight to api.openai.com and bill to your own OpenAI account.
        {status.recorderAvailable ? "" : " Dictation needs the arecord command, which is missing on this machine."}
      </p>
      {!status.secureStorageAvailable ? (
        <p className="ai-key__warn" role="alert">
          This machine’s credential store is unavailable, so the key cannot be saved securely.
          On Linux, install and unlock a keyring such as gnome-keyring, then try again.
        </p>
      ) : null}
    </article>
  );
}
