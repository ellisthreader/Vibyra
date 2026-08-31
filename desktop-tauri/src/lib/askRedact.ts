// Strips credentials out of terminal output before any of it can be sent.
//
// Scrollback is the richest context Ask has and the most dangerous: it holds
// whatever the agents printed, which routinely includes tokens, connection
// strings and the contents of a `.env`. Nothing here is a substitute for the
// bound on how much is sent at all (see `askContext`) — it is the second of
// two gates, and this one runs last, immediately before the request.
//
// Deliberately conservative about *shape*, not about *volume*: a pattern only
// matches where the surrounding text names it as a secret, or where the token
// format is unmistakable. Redacting every long hex string would blank out real
// output — commit SHAs, hashes, file digests — and an assistant that cannot
// see what happened is worse than one that sees a little less.

export interface Redacted {
  text: string;
  /** How many secrets were removed, for telling the user what was sent. */
  count: number;
}

const PLACEHOLDER = "[redacted]";

/** Token formats that can only be credentials, wherever they appear. */
const TOKEN_SHAPES: RegExp[] = [
  // OpenAI, including project and Anthropic variants.
  /\bsk-[A-Za-z0-9_-]{16,}/g,
  // GitHub personal, OAuth, user, server and refresh tokens.
  /\bgh[pousr]_[A-Za-z0-9]{20,}/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}/g,
  // AWS access key ids.
  /\bAKIA[0-9A-Z]{16}\b/g,
  // Slack.
  /\bxox[abprs]-[A-Za-z0-9-]{10,}/g,
  // Google API keys.
  /\bAIza[A-Za-z0-9_-]{30,}/g,
  // JSON web tokens.
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g,
];

/** Secrets that are only identifiable from the text introducing them. */
const LABELLED: RegExp[] = [
  // `Authorization: …` — to end of line, because the credential follows a
  // scheme word (`Bearer`, `Basic`) and stopping at the first space redacts
  // the scheme and leaves the secret.
  /\b(authorization\s*:\s*)([^\n]+)/gi,
  /\b(bearer\s+)([A-Za-z0-9._~+/=-]{12,})/gi,
  // Environment-style assignment where the name says what it holds.
  /\b([A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|PASSWD|APIKEY|API_KEY|PRIVATE_KEY|CREDENTIAL|ACCESS_KEY)[A-Z0-9_]*\s*[=:]\s*)("[^"]*"|'[^']*'|\S+)/g,
  // Command-line flags that carry one.
  /(--(?:token|password|api-key|secret)[= ])(\S+)/gi,
  // Credentials inside a URL: scheme://user:pass@host
  /\b([a-z][a-z0-9+.-]*:\/\/[^\s:/@]+:)([^\s@]+)(?=@)/gi,
];

/** Whole private-key blocks, which are multi-line and must go entirely. */
const PEM = /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g;

/**
 * Removes credentials from `text`, reporting how many it took out.
 *
 * The count is what the panel shows the user, so it counts *secrets removed*
 * rather than regex matches — a labelled assignment is one secret even though
 * the pattern captures a name and a value.
 */
export function redactSecrets(text: string): Redacted {
  if (!text) return { text: "", count: 0 };
  let count = 0;
  let out = text;

  out = out.replace(PEM, () => {
    count += 1;
    return `${PLACEHOLDER} private key`;
  });

  for (const shape of TOKEN_SHAPES) {
    out = out.replace(shape, () => {
      count += 1;
      return PLACEHOLDER;
    });
  }

  // Every LABELLED pattern captures exactly two groups — the naming text and
  // the secret — so the callback never has to reason about which trailing
  // argument is a group and which is the match offset.
  for (const labelled of LABELLED) {
    out = out.replace(labelled, (_match: string, label: string) => {
      count += 1;
      return `${label}${PLACEHOLDER}`;
    });
  }

  return { text: out, count };
}

/**
 * The last `limit` characters of `text`, redacted, cut at a line boundary.
 *
 * Redaction runs on the slice rather than the whole scrollback: it is the only
 * part that can be sent, and running the patterns over a quarter-megabyte to
 * throw nearly all of it away is work for nothing. The cut is taken first so a
 * secret spanning the boundary loses its head and stops matching — hence the
 * order here, which is load-bearing rather than incidental.
 */
export function redactedTail(text: string | null | undefined, limit: number): Redacted {
  if (!text) return { text: "", count: 0 };
  if (text.length <= limit) return redactSecrets(text.trim());
  let slice = text.slice(-limit);
  const firstBreak = slice.indexOf("\n");
  // Only a cut can strand a partial opening line, so only a cut trims one.
  if (firstBreak > 0 && firstBreak < slice.length - 1) slice = slice.slice(firstBreak + 1);
  return redactSecrets(slice.trim());
}
