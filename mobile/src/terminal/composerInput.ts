// Follow xterm's newline normalization and the host application's DECSET 2004
// mode; multiline input must not become several accidental submissions.
export function composerInput(value: string, bracketed: boolean) {
  const text = value.replace(/\r?\n/g, '\r');
  if (text.includes('\r') && !bracketed) {
    throw new Error('This terminal does not support multiline paste. Send one line at a time.');
  }
  return (bracketed ? `\x1b[200~${text}\x1b[201~` : text) + '\r';
}
