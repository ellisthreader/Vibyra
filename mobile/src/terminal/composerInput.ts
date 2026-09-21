// iOS Smart Punctuation rewrites what is typed on its keyboard: `"x"` arrives
// as `“x”`, `don't` as `don’t` and `--` as `—`. A shell treats the curly forms
// as ordinary letters, so `git commit -m "fix"` commits a message wrapped in
// them and `--help` becomes an unknown flag. A terminal wants what was typed.
// ‘ ’ “ ” — as escapes, and the pattern built from them: a bundler rewrites a
// string's characters to escapes but leaves a regular expression's own raw, so
// spelling them there breaks wherever the bundle is read as anything but UTF-8.
const typed: Record<string, string> = { '‘': "'", '’': "'", '“': '"', '”': '"', '—': '--' };
const smart = new RegExp(`[${Object.keys(typed).join('')}]`, 'g');
export const plainPunctuation = (value: string) => value.replace(smart, mark => typed[mark]);

// Follow xterm's newline normalization and the host application's DECSET 2004
// mode; multiline input must not become several accidental submissions.
export function composerInput(value: string, bracketed: boolean) {
  const text = plainPunctuation(value).replace(/\r?\n/g, '\r');
  if (text.includes('\r') && !bracketed) {
    throw new Error('This terminal does not support multiline paste. Send one line at a time.');
  }
  return (bracketed ? `\x1b[200~${text}\x1b[201~` : text) + '\r';
}
