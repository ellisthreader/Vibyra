// Serializes everything a form submission would send, and where, for the
// approval fingerprint: every form on the page (not a bounded summary), every
// control's real value (hidden inputs and secrets included), select options
// and choice, checked state, disabled state, and each button's name, value
// and overrides. It is hashed on the Mac and never shown or sent anywhere.
(function (refOf) {
  const attr = (el, name) => (el.hasAttribute(name) ? el.getAttribute(name) : null);
  const control = (el) => {
    const type = (el.getAttribute('type') || '').toLowerCase();
    const c = { t: el.tagName, ty: type, n: attr(el, 'name'), id: el.id, d: el.matches(':disabled'), r: refOf.get(el) || null };
    if (el.tagName === 'SELECT') {
      c.m = el.multiple;
      c.o = [...el.options].map((o) => [o.value, o.selected, o.disabled, o.label]);
    } else if (type === 'checkbox' || type === 'radio') {
      c.v = el.value;
      c.c = el.checked;
    } else if (type === 'file') {
      c.f = [...(el.files || [])].map((f) => [f.name, f.size]);
    } else if (el.tagName === 'BUTTON' || ['submit', 'image', 'button', 'reset'].includes(type)) {
      c.v = el.value;
      c.l = (el.textContent || '').trim();
      c.o = ['formaction', 'formmethod', 'formenctype', 'formtarget', 'formnovalidate'].map((a) => attr(el, a));
      if (attr(el, 'formaction') !== null) c.fa = el.formAction;
    } else {
      c.v = el.value;
    }
    return c;
  };
  return JSON.stringify({
    href: location.href.split('#')[0],
    base: document.baseURI,
    forms: [...document.forms].map((f) => ({
      a: f.action, m: f.method, e: f.enctype, t: f.target, cs: f.acceptCharset, nv: f.noValidate,
      id: f.id, n: attr(f, 'name'), els: [...f.elements].map(control),
    })),
  });
})
