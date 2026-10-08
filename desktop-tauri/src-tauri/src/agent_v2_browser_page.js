// Runs in a Vibyra-only isolated world of the Agent browser's page (the
// page's own scripts cannot reach these functions). Describes the page for
// the model with secrets removed, and locates elements by snapshot ref.
// Refs are positions in a deterministic element list; every action rechecks
// the element's signature, so a changed page is refused, not guessed at.
(function (op, arg, serialize) {
  const MAX = 120;
  const SECRET_NAME = new RegExp('pass|pwd|otp|one.?time|captcha|verif|secret|\\bpin\\b|cvv|cvc|card.?num|token|security.?code|'
    + 'social.?sec|routing|sort.?code|account.?num|credit|totp|recovery|backup.?code|private.?key|seed.?phrase|mnemonic|'
    + '(^|[^a-z])(ssn|iban|mfa|2fa)([^a-z]|$)', 'i');
  const SECRET_AC = ['current-password', 'new-password', 'one-time-code', 'cc-number', 'cc-csc', 'cc-exp'];
  const TEXT_TYPES = ['', 'text', 'email', 'search', 'url', 'tel', 'number'];
  const clip = (s, n) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);
  const redact = (s) => String(s || '')
    .replace(/\beyJ[\w-]{8,}\.[\w-]{8,}\.[\w-]{4,}/g, '[redacted]')
    .replace(/\b(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]{8,}/g, '[redacted]')
    .replace(/\b(?:sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_\w{20,}|xox[abprs]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16})/g, '[redacted]')
    .replace(/((?:password|passwd|secret|token|api[_-]?key|session(?:id)?|cookie)\s*[:=]\s*)[^\s"'<>]+/gi, '$1[redacted]')
    .replace(/\b[A-Fa-f0-9]{40,}\b/g, '[redacted]');
  const SECRET_KEY = /token|code|session|key|secret|pass|pwd|auth|sig|state|jwt|bearer|credential|otp|nonce|csrf|xsrf|ticket|magic|reset|verif|hash|cred|login|sso|saml|assertion|cookie|^sid$|_sid$/i;
  // A generated secret: a JWT, a long opaque run, or a mixed letter-and-digit run.
  const tokenish = (text) => /^eyJ/.test(text) && text.length >= 16
    || String(text).split(/[^A-Za-z0-9+=_]/).some((run) => run.length >= 32
      || (run.length >= 20 && /\d/.test(run) && /[A-Za-z]/.test(run)));
  // Never reports the #fragment, credentials, token-like path segments or secret query values.
  const cleanUrl = (raw) => {
    try {
      const u = new URL(raw, location.href);
      u.hash = '';
      u.username = ''; u.password = '';
      for (const [k, v] of [...u.searchParams.entries()])
        if (SECRET_KEY.test(k) || tokenish(v)) u.searchParams.set(k, '[redacted]');
      u.pathname = u.pathname.split('/').map((seg) => (tokenish(seg) ? '[redacted]' : seg)).join('/');
      return u.href;
    } catch (_) { return ''; }
  };
  const typeOf = (el) => (el.getAttribute('type') || '').toLowerCase();
  const visible = (el) => {
    if (typeOf(el) === 'hidden' || !el.getClientRects().length) return false;
    const st = getComputedStyle(el);
    return st.visibility !== 'hidden' && st.display !== 'none';
  };
  const secret = (el) => {
    if (typeOf(el) === 'password') return true;
    const ac = (el.getAttribute('autocomplete') || '').toLowerCase();
    if (SECRET_AC.some((a) => ac.includes(a))) return true;
    return SECRET_NAME.test([el.id, el.getAttribute('name'), el.getAttribute('aria-label'), el.getAttribute('placeholder')]
      .filter(Boolean).join(' '));
  };
  const labelOf = (el) => clip(el.getAttribute('aria-label') || (el.labels && el.labels[0] && el.labels[0].innerText)
    || el.getAttribute('placeholder') || el.getAttribute('title') || (el.tagName !== 'INPUT' && el.innerText)
    || (['submit', 'button'].includes(typeOf(el)) && el.value) || el.getAttribute('name') || '', 120);
  const isSubmit = (el) => {
    const tag = el.tagName, t = typeOf(el);
    return !!el.form && ((tag === 'BUTTON' && (t === '' || t === 'submit')) || (tag === 'INPUT' && (t === 'submit' || t === 'image')));
  };
  const editable = (el) => (el.tagName === 'INPUT' && TEXT_TYPES.includes(typeOf(el))) || el.tagName === 'TEXTAREA';
  const valueOf = (el) => {
    if (secret(el) || typeOf(el) === 'hidden') return '[hidden]';
    if (['checkbox', 'radio'].includes(typeOf(el))) return el.checked ? 'checked' : 'unchecked';
    if (el.tagName === 'SELECT') return clip(el.selectedOptions[0] ? el.selectedOptions[0].text : '', 200);
    if (typeOf(el) === 'file') return '';
    return clip(redact(el.value), 2000);
  };
  const list = () => [...document.querySelectorAll('a[href],button,input,select,textarea,[role=button],[role=link],'
    + '[role=tab],[role=checkbox],[role=menuitem],summary')].filter(visible).slice(0, MAX);
  const sig = (el) => [el.tagName, typeOf(el), el.getAttribute('name') || '', el.id || '', el.tagName === 'A' ? el.href : ''].join('|');
  const roleOf = (el) => el.getAttribute('role') || ({ A: 'link', BUTTON: 'button', SELECT: 'combobox', TEXTAREA: 'textbox',
    SUMMARY: 'button' })[el.tagName] || (['submit', 'button', 'reset', 'image'].includes(typeOf(el)) ? 'button'
    : ['checkbox', 'radio'].includes(typeOf(el)) ? typeOf(el) : 'textbox');
  const find = (a) => {
    const el = list()[Number(String(a.ref).slice(1)) - 1];
    return el && sig(el) === a.sig ? el : null;
  };
  // formAction/formMethod return the document URL / "" when the button has no own attribute.
  const destination = (el) => cleanUrl(el.hasAttribute('formaction') ? el.formAction : el.form.action);
  const methodOf = (el) => (el.hasAttribute('formmethod') ? el.formMethod : el.form.method || 'get').toUpperCase();

  if (op === 'snapshot') {
    const els = list();
    const refOf = new Map(els.map((el, i) => [el, 'e' + (i + 1)]));
    const elements = els.map((el) => {
      const e = { ref: refOf.get(el), role: roleOf(el), name: labelOf(el) };
      if (el.tagName === 'A') e.href = cleanUrl(el.href);
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) { e.type = typeOf(el) || el.tagName.toLowerCase(); e.value = valueOf(el); }
      if (secret(el)) e.secret = true;
      if (isSubmit(el)) e.submit = true;
      if (el.disabled) e.disabled = true;
      return e;
    });
    const forms = [...document.forms].slice(0, 5).map((f) => ({
      action: cleanUrl(f.action), method: (f.method || 'get').toLowerCase(),
      fields: [...f.elements].filter((el) => !['BUTTON', 'FIELDSET', 'OUTPUT'].includes(el.tagName) && !['submit', 'button', 'image', 'reset'].includes(typeOf(el)))
        .slice(0, 20).map((el) => {
          const x = { name: clip(el.getAttribute('name') || el.id, 100), label: labelOf(el), type: typeOf(el) || el.tagName.toLowerCase(), value: valueOf(el) };
          if (refOf.has(el)) x.ref = refOf.get(el);
          if (secret(el)) x.secret = true;
          return x;
        }),
      submits: [...f.elements].filter((el) => isSubmit(el) && refOf.has(el)).map((el) => ({ ref: refOf.get(el), label: labelOf(el) })),
    }));
    const frames = [...document.querySelectorAll('iframe')].map((f) => f.src || '').join(' ');
    const challenge = /recaptcha|hcaptcha|challenges\.cloudflare|turnstile|arkoselabs|funcaptcha/i.test(frames)
      || /verify you are (a )?human|are you a robot|unusual traffic|security check/i.test(clip(document.body && document.body.innerText, 4000));
    return {
      url: cleanUrl(location.href), title: clip(redact(document.title), 200),
      headings: [...document.querySelectorAll('h1,h2,h3')].slice(0, 20).map((h) => clip(redact(h.innerText), 200)),
      elements, forms, challenge, sigs: els.map(sig), full: serialize(refOf),
    };
  }
  if (op === 'locate') {
    const el = find(arg);
    if (!el) return { error: 'changed' };
    el.scrollIntoView({ block: 'center', inline: 'center' });
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const top = document.elementFromPoint(x, y);
    const covered = !(top && (top === el || el.contains(top) || (top.tagName === 'LABEL' && top.control === el)));
    return { x, y, covered, tag: el.tagName, type: typeOf(el), href: el.tagName === 'A' ? el.href : '', target: el.target || '',
      submit: isSubmit(el), secret: secret(el), editable: editable(el), disabled: el.matches(':disabled'),
      destination: isSubmit(el) ? destination(el) : '',
      method: isSubmit(el) ? methodOf(el) : '' };
  }
  if (op === 'clear') {
    const el = find(arg);
    if (!el || !editable(el) || secret(el)) return { error: 'changed' };
    el.focus();
    // An onfocus handler may have moved the cursor (for example into a password field).
    if (document.activeElement !== el) return { error: 'focus' };
    el.value = '';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return { ok: true };
  }
  if (op === 'focused') {
    const el = find(arg);
    return { ok: !!el && document.activeElement === el && editable(el) && !secret(el) };
  }
  if (op === 'read') {
    const text = redact(document.body ? document.body.innerText : '');
    return { url: cleanUrl(location.href), title: clip(redact(document.title), 200), text: text.slice(arg.start, arg.start + 12000),
      chars: text.length };
  }
  if (op === 'state') return { ready: document.readyState, url: location.href };
  return { error: 'unknown op' };
})
