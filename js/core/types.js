/* Visual Radiance: data conversion between components (numbers, text, vectors, lists). */
(function (VR) {
  'use strict';
  const U = VR.util;
  const T = VR.types = {};
  VR.kinds = VR.kinds || {};

  // Flatten nested arrays and drop empty items.
  T.flat = function (v) {
    const out = [];
    (function walk(x) {
      if (Array.isArray(x)) x.forEach(walk);
      else if (x !== undefined && x !== null) out.push(x);
    })(v);
    return out;
  };

  T.empty = (v) => v === undefined || v === null ||
    (typeof v === 'string' && v.trim() === '') ||
    (Array.isArray(v) && T.flat(v).filter((x) => !(typeof x === 'string' && x.trim() === '')).length === 0);

  T.num = function (v) {
    if (Array.isArray(v)) v = T.flat(v)[0];
    if (typeof v === 'number') return v;
    if (typeof v === 'boolean') return v ? 1 : 0;
    if (typeof v === 'string') {
      const s = v.trim();
      return s === '' ? NaN : Number(s);
    }
    return NaN;
  };

  T.int = (v) => {
    const n = T.num(v);
    return isFinite(n) ? Math.round(n) : NaN;
  };

  T.bool = function (v) {
    if (Array.isArray(v)) v = T.flat(v)[0];
    if (typeof v === 'boolean') return v;
    if (typeof v === 'number') return v !== 0;
    if (typeof v === 'string') {
      const s = v.trim().toLowerCase();
      if (['true', 'yes', 'on', '1', 't', 'y'].indexOf(s) >= 0) return true;
      if (['false', 'no', 'off', '0', 'f', 'n', ''].indexOf(s) >= 0) return false;
    }
    return undefined;
  };

  T.str = function (v) {
    if (v === undefined || v === null) return '';
    if (Array.isArray(v)) return T.flat(v).map(T.str).join('\n');
    if (typeof v === 'string') return v;
    if (typeof v === 'number') return U.fmt(v);
    if (typeof v === 'boolean') return v ? 'True' : 'False';
    return T.text(v);
  };

  // A list of non-empty strings. Text with several lines (or semicolons) is split.
  T.strList = function (v) {
    const out = [];
    T.flat(v).forEach((x) => {
      const s = typeof x === 'string' ? x : T.str(x);
      s.split(/\r?\n|;/).forEach((part) => {
        const t = part.trim();
        if (t) out.push(t);
      });
    });
    return out;
  };

  // Three numbers from an array, a point object or text such as "0 0 1" or "{0, 0, 1}".
  T.vec3 = function (v) {
    if (v && typeof v === 'object' && !Array.isArray(v) && 'x' in v) return [Number(v.x), Number(v.y), Number(v.z || 0)];
    let a;
    if (Array.isArray(v)) {
      a = T.flat(v);
      if (a.length === 1 && typeof a[0] === 'string') return T.vec3(a[0]);
    } else {
      a = String(v === undefined || v === null ? '' : v).replace(/[{}()[\]]/g, ' ').split(/[\s,]+/).filter(Boolean);
    }
    a = a.map(Number);
    if (a.length !== 3 || a.some((n) => !isFinite(n))) return null;
    return a;
  };

  // Two numbers: an MD slider point, "3840 2160", "3840x2160" or a single number used twice.
  T.pair = function (v) {
    if (Array.isArray(v)) {
      const f = T.flat(v);
      if (f.length >= 2) {
        const p = [Number(f[0]), Number(f[1])];
        return p.every(isFinite) ? p : null;
      }
      return f.length === 1 ? T.pair(f[0]) : null;
    }
    if (typeof v === 'number') return isFinite(v) ? [v, v] : null;
    if (typeof v === 'string') {
      const p = v.replace(/[{}()[\]]/g, ' ').split(/[\s,x]+/i).filter(Boolean).map(Number);
      if (p.length === 1 && isFinite(p[0])) return [p[0], p[0]];
      if (p.length >= 2 && isFinite(p[0]) && isFinite(p[1])) return [p[0], p[1]];
    }
    return null;
  };

  // Text shown in panels and tooltips for Radiance objects.
  T.text = function (v) {
    if (v && v.kind && VR.kinds[v.kind] && VR.kinds[v.kind].text) return VR.kinds[v.kind].text(v);
    try { return JSON.stringify(v); } catch (e) { return String(v); }
  };

  // Short type label, for tooltips.
  T.label = function (v) {
    if (v === undefined || v === null) return 'empty';
    if (Array.isArray(v)) return 'list of ' + T.flat(v).length;
    if (v.kind && VR.kinds[v.kind]) return VR.kinds[v.kind].label;
    return typeof v === 'number' ? 'number' : typeof v === 'boolean' ? 'boolean' : 'text';
  };
})(window.VR);
