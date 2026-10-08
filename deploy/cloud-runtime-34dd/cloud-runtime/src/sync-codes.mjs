/**
 * The fixed reasons a cloud computer reports (docs/cloud-sync-contract.md "Runtime API"): `applied` bodies carry
 * `{ok:false, error: code, code, message}` and `status` carries `lastError: {code, message, project}`. The backend shows
 * `message` as is; `error` stays the code so an older backend stores the code as the project's reason.
 */
export const REASONS = {
  key_mismatch: 'This upload was locked for an older Cloud key. Your Mac will send the project again.',
  needs_full: 'Vibyra Cloud needs the whole project again. Your Mac will send it.',
  download_failed: 'Vibyra Cloud could not download this upload.',
  verify_failed: 'This upload arrived damaged, so Vibyra Cloud did not open it.',
  disk_full: 'Vibyra Cloud is out of space.',
  apply_failed: 'Vibyra Cloud could not open this upload.',
  diverged: 'Vibyra Cloud has its own edits to this project, so it kept them.',
  remove_failed: 'Vibyra Cloud could not remove this project.',
};
const KNOWN = new Set(Object.keys(REASONS));

/** An `applied` body for a failed item. `more` may add `needFull` (the Mac resends the whole project). */
export const failure = (code, more = {}) => ({ ok: false, error: code, code, message: REASONS[code], ...more });
/** A thrown error (with `syncCode`, or a raw fs error) as one of the fixed codes. */
export const codeOf = e => (e?.code === 'ENOSPC' || e?.cause?.code === 'ENOSPC') ? 'disk_full' : KNOWN.has(e?.syncCode) ? e.syncCode : 'apply_failed';
/** The `lastError` the VM reports for a failed body, or null. */
export const problemOf = (body, project = null) => body?.ok === false || body?.retry ? { code: body.code ?? 'apply_failed', message: body.message ?? REASONS.apply_failed, project } : null;
