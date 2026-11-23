/* Visual Radiance: Radiance rendering options, presets and formatting.
   Option meanings follow the rtrace/rpict manual pages; slider ranges follow the
   "Setting Rendering Options" notes on the Radiance site (min, fast, accurate, max). */
(function (VR) {
  'use strict';
  const U = VR.util;
  const R = VR.rad = VR.rad || {};

  R.OPTIONS = [
    { k: 'ab', name: 'Ambient bounces', type: 'int', min: 0, max: 12, dec: 0,
      desc: 'Number of diffuse interreflections. 0 means no indirect light.' },
    { k: 'ad', name: 'Ambient divisions', type: 'int', min: 0, max: 8192, dec: 0,
      desc: 'Rays sent for each indirect sample. Noise falls with the square root of this value.' },
    { k: 'as', name: 'Ambient super-samples', type: 'int', min: 0, max: 8192, dec: 0,
      desc: 'Extra rays where the first divisions show a large change. Often half of -ad.' },
    { k: 'ar', name: 'Ambient resolution', type: 'int', min: 0, max: 1024, dec: 0,
      desc: 'How finely indirect values are spaced over the scene. Higher is finer and slower.' },
    { k: 'aa', name: 'Ambient accuracy', type: 'num', min: 0, max: 0.5, dec: 3,
      desc: 'Allowed error when interpolating indirect values. 0 turns interpolation off.' },
    { k: 'lr', name: 'Limit reflections', type: 'int', min: -12, max: 16, dec: 0,
      desc: 'Maximum reflections per ray. 0 or less uses Russian roulette together with -lw.' },
    { k: 'lw', name: 'Limit weight', type: 'num', min: 0, max: 0.05, dec: 5,
      desc: 'Rays with less weight than this are dropped. For matrix runs keep it at or below 1/-ad.' },
    { k: 'dj', name: 'Direct jitter', type: 'num', min: 0, max: 1, dec: 2,
      desc: '0 samples light sources at fixed points; values up to 1 give soft penumbras.' },
    { k: 'ds', name: 'Direct sampling', type: 'num', min: 0, max: 1, dec: 2,
      desc: 'Subdivides large light sources. 0 sends one shadow ray per source.' },
    { k: 'dt', name: 'Direct threshold', type: 'num', min: 0, max: 1, dec: 2,
      desc: 'Shadow testing stops below this fraction of the result. 0 tests every source.' },
    { k: 'dc', name: 'Direct certainty', type: 'num', min: 0, max: 1, dec: 2,
      desc: '1 guarantees the -dt accuracy; 0 only resolves visible shadow edges.' },
    { k: 'dr', name: 'Direct relays', type: 'int', min: 0, max: 6, dec: 0,
      desc: 'Generations of virtual light sources through mirrors and prisms.' },
    { k: 'dp', name: 'Direct pretest density', type: 'int', min: 0, max: 1024, dec: 0,
      desc: 'Samples per steradian used to pretest virtual sources.' },
    { k: 'ss', name: 'Specular sampling', type: 'num', min: 0, max: 4, dec: 2,
      desc: '0 keeps reflections sharp; above 1 sends several rays per highlight.' },
    { k: 'st', name: 'Specular threshold', type: 'num', min: 0, max: 1, dec: 2,
      desc: 'Reflections weaker than this fraction are approximated instead of traced.' },
    { k: 'av', name: 'Ambient value', type: 'vec3',
      desc: 'Radiance used in place of further bounces, as three numbers (R G B).' },
    { k: 'aw', name: 'Ambient value weight', type: 'int', min: 0, max: 1024, dec: 0,
      desc: 'Weight of -av in the running average. 0 keeps -av fixed.' },
    { k: 'ps', name: 'Pixel sampling', type: 'int', min: 1, max: 16, dec: 0,
      desc: 'Image runs only. Sample spacing in pixels; 1 samples every pixel.' },
    { k: 'pt', name: 'Pixel threshold', type: 'num', min: 0, max: 1, dec: 2,
      desc: 'Image runs only. Adds samples between pixels that differ by more than this.' },
    { k: 'pj', name: 'Pixel jitter', type: 'num', min: 0, max: 1, dec: 2,
      desc: 'Image runs only. Anti-aliasing jitter; 0.5 to 0.8 is typical.' }
  ];

  R.OPTION_MAP = {};
  R.OPTIONS.forEach((o) => { R.OPTION_MAP[o.k] = o; });

  // Order used on command lines (pixel options first, then ambient, limits, direct, specular).
  R.ORDER = ['ps', 'pt', 'pj', 'ab', 'ad', 'as', 'ar', 'aa', 'lr', 'lw',
    'dj', 'ds', 'dt', 'dc', 'dr', 'dp', 'ss', 'st', 'av', 'aw'];

  // Which options each program accepts. rcontrib and rfluxmtx do not cache
  // ambient values, so -aa, -ar, -av and -aw are left out for them.
  const NO_PIXEL = { ps: 1, pt: 1, pj: 1 };
  const NO_CACHE = { ps: 1, pt: 1, pj: 1, aa: 1, ar: 1, av: 1, aw: 1 };
  R.allowed = function (k, cmd) {
    if (cmd === 'rpict') return true;
    if (cmd === 'rcontrib' || cmd === 'rfluxmtx') return !NO_CACHE[k];
    return !NO_PIXEL[k];
  };

  /* Presets: the low, medium and high settings used by Ladybug Tools (Honeybee)
     for grid-based runs, with pixel settings from the Radiance rendering notes. */
  R.PRESETS = {
    low: { label: 'Low', values: { ab: 2, ad: 512, as: 128, ar: 16, aa: 0.25, lr: 4, lw: 0.05,
      dj: 0, ds: 0.5, dt: 0.5, dc: 0.25, dr: 0, dp: 64, ss: 0, st: 0.85, ps: 8, pt: 0.15, pj: 0.6 } },
    medium: { label: 'Medium', values: { ab: 3, ad: 2048, as: 2048, ar: 64, aa: 0.2, lr: 6, lw: 0.01,
      dj: 0.5, ds: 0.25, dt: 0.25, dc: 0.5, dr: 1, dp: 256, ss: 0.7, st: 0.5, ps: 4, pt: 0.1, pj: 0.9 } },
    high: { label: 'High', values: { ab: 6, ad: 4096, as: 4096, ar: 128, aa: 0.1, lr: 8, lw: 0.005,
      dj: 0.7, ds: 0.05, dt: 0.15, dc: 0.75, dr: 3, dp: 512, ss: 1, st: 0.15, ps: 2, pt: 0.05, pj: 0.9 } }
  };

  R.presetKey = function (v) {
    if (v === undefined || v === null || v === '') return 'none';
    if (typeof v === 'number') return { '-1': 'none', 0: 'low', 1: 'medium', 2: 'high' }[String(Math.round(v))] || null;
    const s = String(v).trim().toLowerCase();
    if (/^-?\d+$/.test(s)) return R.presetKey(Number(s));
    if (s === 'none' || s === 'custom' || s === 'off') return 'none';
    return R.PRESETS[s] ? s : null;
  };

  R.formatOptions = function (p, cmd) {
    if (!p) return '';
    const out = [];
    R.ORDER.forEach((k) => {
      const v = p.values ? p.values[k] : undefined;
      if (v === undefined || v === null || !R.allowed(k, cmd)) return;
      out.push('-' + k + ' ' + (Array.isArray(v) ? v.map(U.fmt).join(' ') : U.fmt(v)));
    });
    if (p.raw && p.raw.trim()) out.push(p.raw.trim());
    return out.join(' ');
  };

  // Read an option string such as "-ab 3 -ad 1024 -av 0 0 0 -i+". Known options become
  // values; anything else is kept as text and passed through unchanged.
  R.parseOptions = function (str) {
    const toks = String(str || '').trim().split(/\s+/).filter(Boolean);
    const values = {};
    const raw = [];
    const isOpt = (t) => /^-[A-Za-z]/.test(t);
    for (let i = 0; i < toks.length; i += 1) {
      const t = toks[i];
      const def = isOpt(t) ? R.OPTION_MAP[t.slice(1)] : null;
      if (def) {
        const n = def.type === 'vec3' ? 3 : 1;
        const args = toks.slice(i + 1, i + 1 + n).map(Number);
        if (args.length === n && args.every(isFinite)) {
          values[def.k] = n === 1 ? args[0] : args;
          i += n;
          continue;
        }
      }
      raw.push(t);
      while (i + 1 < toks.length && !isOpt(toks[i + 1])) { i += 1; raw.push(toks[i]); }
    }
    return { values, raw: raw.join(' ') };
  };

  // Manual page links, used in component help.
  R.MAN = 'https://floyd.lbl.gov/radiance/man_html/';
  R.man = (cmd) => R.MAN + cmd + '.1.html';
})(window.VR);
