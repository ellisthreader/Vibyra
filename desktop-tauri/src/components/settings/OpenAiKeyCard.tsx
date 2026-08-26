import { useState } from "react";

import { openOpenAiKeyPage } from "../../ipc/ai";
import { useAiServiceStore } from "../../state/aiServiceStore";
import type { AiServiceStatus } from "../../types";
import { CheckIcon, EyeIcon, LinkIcon } from "../common/Icons";

const STEPS = [
  <>Open <strong>platform.openai.com/api-keys</strong> and sign in to your OpenAI account.</>,
  <>Add a payment method under <strong>Billing</strong> — new accounts have no credit, and a key without it returns a quota error.</>,
  <>Choose <strong>Create new secret key</strong>, name it “Vibyra”, and copy the value. OpenAI shows it once.</>,
  <>Paste it below. Vibyra checks the key with OpenAI before saving it.</>,
];

export function OpenAiKeyCard({ status }: { status: AiServiceStatus }) {
  const busy = useAiServiceStore((state) => state.busy);
  const error = useAiServiceStore((state) => state.error);
  const saved = useAiServiceStore((state) => state.saved);
  const save = useAiServiceStore((state) => state.save);
  const remove = useAiServiceStore((state) => state.remove);
  const [draft, setDraft] = useState("");
  const [reveal, setReveal] = useState(false);

  const submit = async () => {
    if (!draft.trim() || busy) return;
    if (await save(draft)) setDraft("");
  };

  return (
    <article className="settings-group ai-key">
      <div className="ai-key__state">
        <span className={`ai-key__badge ai-key__badge--${status.keyConfigured ? "on" : "off"}`}>
          {status.keyConfigured ? <CheckIcon size={12} /> : null}
          {status.keyConfigured ? "Key installed" : "No key yet"}
        </span>
        {status.keyConfigured ? <code className="ai-key__hint">{status.keyHint}</code> : null}
        {status.keyConfigured ? (
          <button type="button" className="ai-key__remove" disabled={busy} onClick={() => void remove()}>
            Remove key
          </button>
        ) : null}
      </div>

      {/* The how-to is for someone who has not done it yet. Once a key is
          installed it is four steps of clutter above the field you actually
          came back for, so it folds away — still one click from here. */}
      {status.keyConfigured ? null : (
        <ol className="ai-key__steps">
          {STEPS.map((step, index) => (
            <li key={index}>{step}</li>
          ))}
        </ol>
      )}

      <button type="button" className="ai-key__link" onClick={() => void openOpenAiKeyPage()}>
        <LinkIcon size={13} />Open the OpenAI keys page
      </button>

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
          <button
            type="button"
            className="icon-btn"
            aria-label={reveal ? "Hide key" : "Show key"}
            aria-pressed={reveal}
            title={reveal ? "Hide key" : "Show key"}
            onClick={() => setReveal((value) => !value)}
          >
            <EyeIcon size={14} />
          </button>
        </div>
        <button type="button" className="btn btn--primary" disabled={busy || !draft.trim()} onClick={() => void submit()}>
          {busy ? "Checking…" : "Save key"}
        </button>
      </div>

      {error ? <p className="ai-key__error" role="alert">{error}</p> : null}
      {saved && !error ? <p className="ai-key__ok" role="status">Key verified with OpenAI and stored.</p> : null}

      <p className="ai-key__note">
        The key is written to your operating system’s credential store — never to
        settings.json, never to a log, and never to a Vibyra server. Requests go
        straight from this desktop to api.openai.com, so usage bills to your own
        OpenAI account.
      </p>
      {!status.secureStorageAvailable ? (
        <p className="ai-key__warn" role="alert">
          This machine’s credential store is unavailable, so the key cannot be
          saved securely. On Linux, install and unlock a keyring such as
          gnome-keyring, then try again.
        </p>
      ) : null}
    </article>
  );
}
