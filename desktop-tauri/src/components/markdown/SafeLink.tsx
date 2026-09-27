import { invoke } from "@tauri-apps/api/core";
import { useState } from "react";
import { safeConversationLink } from "../../../../mobile/src/conversation/safeLink";

/** A destination written by a model is validated before it can become an
 *  anchor: anything that is not a plain `https` URL stays text, with the
 *  destination shown, so there is nothing unsafe left to click. */
export function SafeLink({ label, destination }: { label: string; destination: string }) {
  const [error, setError] = useState("");
  const href = safeConversationLink(destination);
  if (!href)
    return (
      <span title={destination}>
        {label} <small>({destination})</small>
      </span>
    );
  return (
    <>
      <a
        className="md-link"
        href={href}
        title={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(event) => {
          /* In the app a link belongs in the browser, not in the window. */
          if (!("__TAURI_INTERNALS__" in window)) return;
          event.preventDefault();
          void invoke("shared_chat_open_link", { url: href }).catch(() => setError("Could not open link."));
        }}
      >
        {label}
      </a>
      {error && <small role="alert"> {error}</small>}
    </>
  );
}
