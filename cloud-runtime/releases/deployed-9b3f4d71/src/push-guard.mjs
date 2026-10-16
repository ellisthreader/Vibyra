/** True for a destination ref the cloud computer may push: refs/heads/vibyra/<name>, nothing else. */
export function isAllowedPushRef(ref) {
  return typeof ref === 'string' && /^refs\/heads\/vibyra\/[A-Za-z0-9._/-]+$/.test(ref) && !ref.includes('..') && !ref.includes('//') && !ref.endsWith('/') && !ref.endsWith('.lock');
}
/** Refusal reason for a pre-push stdin (`<local ref> <local sha> <remote ref> <remote sha>` lines), or null when allowed. */
export function pushViolation(stdin) {
  for (const line of String(stdin).split('\n')) {
    if (!line.trim()) continue;
    const remote = line.trim().split(/\s+/)[2];
    if (!isAllowedPushRef(remote))
      return `Refusing to push ${remote ?? '(unknown ref)'}: the cloud computer may only push branches named vibyra/<task>.`;
  }
  return null;
}
