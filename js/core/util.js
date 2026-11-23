/* Visual Radiance: shared helpers.
   Classic script (no modules) so the app also runs when index.html is opened from disk. */
(function (VR) {
  'use strict';
  const U = VR.util = {};
  let seq = 0;

  U.uid = function (prefix) {
    seq += 1;
    return (prefix || 'n') + Date.now().toString(36).slice(-5) + seq.toString(36) +
      Math.floor(Math.random() * 1296).toString(36);
  };

  U.clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  U.clone = (o) => (o === undefined ? undefined : JSON.parse(JSON.stringify(o)));

  /* Numbers on Radiance command lines: integers stay integers, everything else
     keeps up to six significant digits without trailing zeros (0.001, 0.0003, 1e-7). */
  U.fmt = function (n) {
    if (typeof n !== 'number') n = Number(n);
    if (!isFinite(n)) return String(n);
    if (Object.is(n, -0)) return '0';
    if (Number.isInteger(n)) return String(n);
    return String(Number(n.toPrecision(6)));
  };

  U.escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  U.debounce = function (fn, ms) {
    let t = null;
    return function () {
      const args = arguments;
      const self = this;
      clearTimeout(t);
      t = setTimeout(() => fn.apply(self, args), ms);
    };
  };

  U.basename = (p) => String(p || '').split(/[\\/]/).pop();

  /* == Windows batch text == */

  // Percent signs are doubled so cmd.exe does not read them as variables.
  U.batEscape = (s) => String(s).replace(/%/g, '%%');
  U.needsQuote = (s) => /[\s&()[\]{}^=;!'+,`~|<>]/.test(String(s));
  // Quote a user supplied path when cmd.exe needs it (or always, for cd lines).
  U.q = function (s, always) {
    const raw = String(s);
    const e = U.batEscape(raw);
    return (always || U.needsQuote(raw)) ? '"' + e + '"' : e;
  };
  // Text after "echo": escape the characters cmd.exe treats as operators.
  U.echoText = (s) => String(s).replace(/%/g, '%%').replace(/([&|<>^])/g, '^$1').replace(/[\r\n]+/g, ' ');
  // Text after "REM": percent signs still expand there, so double them.
  U.remText = (s) => String(s).replace(/%/g, '%%').replace(/[\r\n]+/g, ' ');

  /* == browser only helpers (guarded for Node tests) == */

  U.download = function (name, text, mime) {
    const blob = new Blob([text], { type: mime || 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  };

  U.el = function (tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined && text !== null) e.textContent = text;
    return e;
  };

  U.svg = function (tag, attrs) {
    const e = document.createElementNS('http://www.w3.org/2000/svg', tag);
    if (attrs) Object.keys(attrs).forEach((k) => e.setAttribute(k, attrs[k]));
    return e;
  };
})(typeof window !== 'undefined' ? (window.VR = window.VR || {}) : (globalThis.VR = globalThis.VR || {}));
