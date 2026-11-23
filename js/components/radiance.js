/* Visual Radiance: setup components (settings, site, model and sky). */
(function (VR) {
  'use strict';
  const U = VR.util;
  const T = VR.types;
  const R = VR.rad;
  const B = VR.build;
  const K = VR.kinds;

  /* == how Radiance objects read in panels and tooltips == */

  K.params = { label: 'Radiance parameters', text: (p) => (p.label ? '[' + p.label + '] ' : '') + (R.formatOptions(p, 'rpict') || '(Radiance defaults)') };
  K.spectral = { label: 'Spectral settings', text: (s) => B.specFlags(s) + ' ' + B.specOut(s) };
  K.image = { label: 'Image settings', text: (i) => '-x ' + i.x + ' -y ' + i.y + (i.warm > 0 ? ', warm-up ' + i.warm + ' px' : ', no warm-up') + ', downsample /' + i.down + ', report every ' + i.report + ' s' };
  K.env = { label: 'Radiance folders', text: (e) => B.envLines(e).join('\n') };
  K.location = { label: 'Location', text: (l) => (l.name ? l.name + '\n' : '') + 'Latitude ' + U.fmt(l.lat) + ', longitude ' + U.fmt(l.lon) + ', UTC' + (l.tz >= 0 ? '+' : '') + U.fmt(l.tz) + '\n' + B.locArgs(l) };
  K.weather = { label: 'Weather file', text: (w) => w.path + (w.location ? '\n' + K.location.text(w.location) : '') };
  K.scene = { label: 'Scene', text: (s) => (s.prebuilt ? 'Octree ' + s.oct : (s.freeze ? 'oconv -f ' : 'oconv ') + s.files.join(' ') + (s.oct ? ' > ' + s.oct : '')) };
  K.grid = { label: 'Sensor grid', text: (g) => g.path + (g.count > 0 ? ' (' + g.count + ' sensors)' : ' (sensors counted when the batch file runs)') };
  K.view = { label: 'View', text: (v) => B.viewText(v) };
  K.receiver = { label: 'Sky receiver', text: (r) => r.file + ', Reinhart MF ' + r.mf + (r.write ? ', written by the batch file' : ', existing file') };
  K.sky = { label: 'Sky', text: (s) => (s.cmds && s.cmds.length ? s.cmds.join('\n') : s.file) };
  K.script = { label: 'Workflow script', text: (s) => B.compose([s], { comments: true, progress: true }) };
  const MN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  K.period = { label: 'Analysis period', text: (p) => MN[p.sm - 1] + ' ' + p.sd + ' to ' + MN[p.em - 1] + ' ' + p.ed + ', ' + p.sh + ' to ' + (p.eh + 1) + ' h' };
  K.schedule = { label: 'Occupancy schedule', text: (s) => (s.file ? 'From ' + s.file : 'Occupied ' + s.start + ' to ' + s.end + ' h every day') };
  K.bsdf = { label: 'BSDF', text: (b) => b.file + (b.pre && b.pre.length ? ' (made by genBSDF)' : '') };
  K.aperture = { label: 'Window group', text: (a) => a.name + ': ' + a.glazing.join(', ') + ' with ' + a.bsdf + (a.facade ? ', facade aperture ' + a.facadeFiles.join(', ') : '') };
  K.lum = { label: 'Luminaires', text: (l) => l.files.join(', ') + (l.pre && l.pre.length ? '\n' + l.pre.map((b) => b.cmds.join('\n')).join('\n') : '') };

  /* == coercion used by components that accept objects or plain text == */

  const C = VR.coerce = {};
  const isKind = (v, k) => v && typeof v === 'object' && v.kind === k;

  C.location = function (v) {
    if (isKind(v, 'location')) return v;
    if (isKind(v, 'weather')) return v.location || null;
    return null;
  };
  C.scene = function (vals) {
    vals = T.flat([vals]);
    if (vals.length === 1 && isKind(vals[0], 'scene')) return vals[0];
    if (vals.some((v) => typeof v === 'object')) return null;
    const files = T.strList(vals);
    if (!files.length) return null;
    if (files.length === 1 && /\.oct$/i.test(files[0])) return { kind: 'scene', files: [], oct: files[0], freeze: false, prebuilt: true };
    return { kind: 'scene', files, oct: null, freeze: false, prebuilt: false };
  };
  C.grid = function (v) {
    if (isKind(v, 'grid')) return v;
    if (typeof v === 'string' && v.trim()) return { kind: 'grid', path: v.trim(), count: 0 };
    return null;
  };
  C.weather = function (v) {
    if (isKind(v, 'weather')) return v;
    if (typeof v === 'string' && v.trim()) return { kind: 'weather', path: v.trim(), location: null, hourly: null };
    return null;
  };
  C.receiver = function (v) {
    if (isKind(v, 'receiver')) return v;
    if (typeof v === 'string' && v.trim()) return { kind: 'receiver', file: v.trim(), mf: 1, write: false, up: '+Y' };
    return null;
  };
  C.params = function (v) {
    if (isKind(v, 'params')) return v;
    if (typeof v === 'string') {
      const p = R.parseOptions(v);
      return { kind: 'params', values: p.values, raw: p.raw, label: '', preset: 'none' };
    }
    return null;
  };
  C.sky = function (v) {
    if (isKind(v, 'sky')) return v;
    if (typeof v === 'string' && v.trim()) return B.skyOf(v.trim());
    return null;
  };
  C.view = function (v) {
    if (isKind(v, 'view')) return v;
    if (typeof v === 'string' && /-vt/.test(v)) return v.trim();
    return null;
  };
  C.image = function (v) {
    if (isKind(v, 'image')) return v;
    const p = T.pair(v);
    return p ? { kind: 'image', x: Math.round(p[0]), y: Math.round(p[1]), warm: 64, down: 2, report: 10 } : null;
  };
  C.spectral = function (v) {
    if (isKind(v, 'spectral')) return v;
    return null;
  };
  C.period = function (v) {
    if (isKind(v, 'period')) return v;
    return null;
  };
  C.schedule = function (v) {
    if (isKind(v, 'schedule')) return v;
    if (typeof v === 'string' && v.trim()) {
      const m = v.trim().match(/^(\d+(?:\.\d+)?)\s*(?:-|to)\s*(\d+(?:\.\d+)?)$/);
      if (m) return { kind: 'schedule', start: Number(m[1]), end: Number(m[2]), file: '' };
      return { kind: 'schedule', start: 0, end: 24, file: v.trim() };
    }
    return null;
  };
  C.bsdf = function (v) {
    if (isKind(v, 'bsdf')) return v;
    if (typeof v === 'string' && v.trim()) return { kind: 'bsdf', file: v.trim(), pre: [] };
    return null;
  };
  // Luminaire inputs: file names, or Luminaire objects (which bring ies2rad steps).
  C.lights = function (vals) {
    const files = [];
    const pre = [];
    T.flat([vals]).forEach((v) => {
      if (isKind(v, 'lum')) { v.files.forEach((f) => files.push(f)); (v.pre || []).forEach((b) => pre.push(b)); } else T.strList([v]).forEach((f) => files.push(f));
    });
    return { files, pre, objects: T.flat([vals]).filter((v) => isKind(v, 'lum')) };
  };
  // Points from Construct Point outputs, pairs of brackets or text with one "x y z" per line.
  C.points = function (raw) {
    const out = [];
    const walk = (v) => {
      if (Array.isArray(v)) {
        if (v.length === 3 && v.every((x) => typeof x === 'number')) { out.push(v); return; }
        v.forEach(walk);
        return;
      }
      if (typeof v === 'string') { v.split(/\r?\n|;/).map((l) => l.trim()).filter(Boolean).forEach((l) => { const p = T.vec3(l); if (p) out.push(p); else out.push(null); }); return; }
      const p = T.vec3(v);
      out.push(p);
    };
    walk(raw);
    return out;
  };

  // Read and check a Location (or a Weather object carrying one) from an input.
  C.needLocation = function (ctx, i) {
    const v = ctx.raw(i);
    const loc = C.location(v);
    if (!loc) {
      if (isKind(v, 'weather')) ctx.fail('This weather file has no location yet. Double-click the Weather File component to read the EPW, or connect a Location component.');
      ctx.fail('Location needs a Location or Weather File component');
    }
    return loc;
  };

  const hint = {
    slider: (min, max, dec, value) => ({ widget: 'slider', min, max, dec, value }),
    int: (min, max, value) => ({ widget: 'slider', min, max, dec: 0, mode: 'N', value }),
    panel: (text) => ({ widget: 'panel', text }),
    toggle: (value) => ({ widget: 'toggle', value }),
    list: (items, index) => ({ widget: 'list', items, index: index || 0 })
  };
  VR.hint = hint;

  const D = (spec) => VR.defineComponent(Object.assign({ tab: 'Radiance' }, spec));

  /* == Settings == */

  const parInputs = [{
    name: 'Preset', nick: 'Preset', def: 'medium',
    desc: 'Starting values before your own: none, low, medium or high (Honeybee-style settings). Medium when nothing is connected.',
    hint: hint.list([{ label: 'None', value: 'none' }, { label: 'Low', value: 'low' }, { label: 'Medium', value: 'medium' }, { label: 'High', value: 'high' }], 2)
  }];
  R.OPTIONS.forEach((o) => parInputs.push({
    name: o.name, nick: o.k, desc: o.desc + ' (-' + o.k + ')', opt: o.k,
    hint: o.type === 'vec3' ? hint.panel('0 0 0') : { widget: 'slider', min: o.min, max: o.max, dec: o.dec, mode: o.type === 'int' ? 'N' : 'R' }
  }));
  parInputs.push({ name: 'Extra', nick: 'Extra', access: 'list', desc: 'More options in Radiance syntax, for example "-i+" or "-av 0 0 0". These override the values above.', hint: hint.panel('-av 0 0 0') });
  parInputs.push({ name: 'Name', nick: 'Name', desc: 'Label used in batch comments, for example "quality 4". Defaults to the preset name.', hint: hint.panel('quality 4') });
  const EXTRA = parInputs.length - 2;
  const NAME = parInputs.length - 1;

  D({
    type: 'Rad.Params', name: 'Radiance Parameters', nick: 'RadPar', group: 'Settings', icon: 'params',
    desc: 'All quality options in one place. Start from a preset and connect sliders or panels to the options you want to set. Unconnected options keep the preset value (or the Radiance default when the preset is none).',
    keywords: 'radiance parameters quality ab ad as ar aa lr lw options settings rtrace rpict',
    help: 'Each workflow uses only the options its program accepts: rpict gets the pixel options (-ps -pt -pj), rtrace does not, and rfluxmtx/rcontrib skip the ambient cache options (-aa -ar -av -aw).',
    inputs: parInputs,
    outputs: [{ name: 'Parameters', nick: 'Par', desc: 'Radiance parameters for a workflow' },
      { name: 'Options', nick: 'Txt', desc: 'Options as text' }],
    solve(ctx) {
      const key = R.presetKey(ctx.get(0));
      if (key === null) ctx.fail('Preset must be none, low, medium or high (or -1, 0, 1, 2)');
      const values = key === 'none' ? {} : Object.assign({}, R.PRESETS[key].values);
      R.OPTIONS.forEach((o, j) => {
        const i = j + 1;
        if (!ctx.has(i)) return;
        if (o.type === 'vec3') {
          const v = T.vec3(ctx.raw(i));
          if (!v) ctx.fail(o.name + ' needs three numbers, such as 0 0 0');
          values[o.k] = v;
          return;
        }
        const n = ctx.num(i);
        values[o.k] = o.type === 'int' ? Math.round(n) : n;
      });
      let raw = '';
      const extra = ctx.list(EXTRA).map(T.str).join(' ').trim();
      if (extra) {
        const p = R.parseOptions(extra);
        Object.assign(values, p.values);
        raw = p.raw;
      }
      if (values.lr !== undefined && values.lr <= 0 && !(values.lw > 0)) ctx.warn('-lr ' + values.lr + ' uses Russian roulette, which needs -lw above 0');
      if (values.ab > 8) ctx.remark('-ab ' + values.ab + ' is unusually high; most daylight studies use 3 to 7');
      const label = ctx.str(NAME) || (key === 'none' ? '' : R.PRESETS[key].label);
      if (!Object.keys(values).length && !raw) ctx.remark('No options set, so the Radiance defaults apply');
      const p = { kind: 'params', values, raw, label, preset: key };
      return [p, R.formatOptions(p, 'rpict')];
    }
  });

  D({
    type: 'Rad.Spectral', name: 'Spectral Settings', nick: 'Spec', group: 'Settings', icon: 'spectral',
    desc: 'Spectral sampling for Radiance 6: number of bands (-cs), wavelength range (-cw) and what to write out (-co+ for all bands, or -pY, -pM, -pS, -pXYZ, -pRGB, -pA).',
    keywords: 'spectral hyperspectral cs cw co melanopic photopic wavelength',
    inputs: [
      { name: 'Samples', nick: 'Bands', def: 20, desc: 'Number of spectral bands (-cs). Radiance allows up to 24 unless compiled with more.', hint: hint.int(3, 24, 20) },
      { name: 'Range', nick: 'Range', def: [380, 780], desc: 'Shortest and longest wavelength in nm (-cw).', hint: { widget: 'md', xmin: 300, xmax: 500, ymin: 600, ymax: 900, x: 380, y: 780, dec: 0 } },
      { name: 'Output', nick: 'Out', def: 'co', desc: 'What rtrace writes: co (all bands), RGB, XYZ, Y (photopic), S (scotopic), M (melanopic), A (radiometric), PAR (W/m2, 400 to 700 nm) or PPFD (umol/m2/s, 4.57 x PAR).',
        hint: hint.list([{ label: 'All bands (-co+)', value: 'co' }, { label: 'Photopic Y', value: 'Y' }, { label: 'Melanopic M', value: 'M' },
          { label: 'Scotopic S', value: 'S' }, { label: 'CIE XYZ', value: 'XYZ' }, { label: 'RGB', value: 'RGB' }, { label: 'Radiometric A', value: 'A' },
          { label: 'PAR (W/m2)', value: 'PAR' }, { label: 'PPFD (umol/m2/s)', value: 'PPFD' }]) }
    ],
    outputs: [{ name: 'Spectral', nick: 'Spec', desc: 'Spectral settings' }, { name: 'Options', nick: 'Txt', desc: 'Options as text' }],
    solve(ctx) {
      const cs = ctx.int(0);
      if (cs < 1) ctx.fail('Samples must be at least 1');
      if (cs > 24) ctx.warn('Radiance caps -cs at 24 unless it was compiled with a larger MAXCSAMP');
      const cw = T.pair(ctx.raw(1));
      if (!cw) ctx.fail('Range needs two wavelengths, such as 380 780');
      const m = String(ctx.str(2) || 'co').trim().replace(/^-co\+?$/i, 'co').replace(/^-p/i, '');
      const map = { co: 'co', spectral: 'co', rgb: 'RGB', xyz: 'XYZ', y: 'Y', photopic: 'Y', s: 'S', scotopic: 'S', m: 'M', melanopic: 'M', a: 'A', radiometric: 'A', par: 'PAR', ppfd: 'PPFD' };
      const mode = map[m.toLowerCase()];
      if (!mode) ctx.fail('Output must be co, RGB, XYZ, Y, S, M, A, PAR or PPFD');
      let range = [Math.min(cw[0], cw[1]), Math.max(cw[0], cw[1])];
      if ((mode === 'PAR' || mode === 'PPFD') && (range[0] !== 400 || range[1] !== 700)) {
        range = [400, 700];
        ctx.remark('PAR and PPFD use the photosynthetic range, 400 to 700 nm');
      }
      if (mode === 'PPFD') ctx.remark('PPFD = 4.57 x PAR, the usual factor for daylight; daily light integral = sum of hourly PPFD x 0.0036');
      const sp = { kind: 'spectral', cs, cw: range, mode };
      return [sp, K.spectral.text(sp)];
    }
  });

  D({
    type: 'Rad.Image', name: 'Image Settings', nick: 'Img', group: 'Settings', icon: 'image',
    desc: 'Image size and post-processing for renders: resolution (-x -y), the low resolution warm-up pass, the pfilt downsampling factor and progress reports (-t).',
    keywords: 'image resolution render pfilt warm up overture downsample',
    inputs: [
      { name: 'Resolution', nick: 'Res', def: 1024, desc: 'Image size in pixels. One number for square images, or a pair (MD slider) for x and y.', hint: hint.int(64, 8192, 1024) },
      { name: 'Warm-up', nick: 'Warm', def: 64, desc: 'Resolution of the warm-up pass that fills the ambient cache first. 0 skips it.', hint: hint.int(0, 512, 64) },
      { name: 'Downsample', nick: 'Down', def: 2, desc: 'pfilt reduction factor for anti-aliasing. 1 keeps the full size.', hint: hint.int(1, 4, 2) },
      { name: 'Report', nick: 'Rep', def: 10, desc: 'Seconds between rpict progress reports (-t). 0 turns them off.', hint: hint.int(0, 120, 10) }
    ],
    outputs: [{ name: 'Image', nick: 'Img', desc: 'Image settings' }],
    solve(ctx) {
      const r = T.pair(ctx.raw(0));
      if (!r || r[0] < 1 || r[1] < 1) ctx.fail('Resolution needs a positive number or a pair');
      const img = { kind: 'image', x: Math.round(r[0]), y: Math.round(r[1]), warm: Math.max(0, ctx.int(1)), down: Math.max(1, ctx.int(2)), report: Math.max(0, ctx.int(3)) };
      if (img.x % img.down || img.y % img.down) ctx.remark('Resolution is not a multiple of the downsample factor; pfilt will round the final size');
      return [img];
    }
  });

  D({
    type: 'Rad.Env', name: 'Radiance Folders', nick: 'Env', group: 'Settings', icon: 'env',
    desc: 'Where Radiance is installed. The batch file adds its bin folder to PATH and its lib folder to RAYPATH, so it runs even when Radiance is not on the system path.',
    keywords: 'environment path raypath install folder radiance bin lib',
    inputs: [
      { name: 'Folder', nick: 'Dir', def: 'C:\\Radiance', desc: 'Radiance install folder (contains bin and lib).', hint: hint.panel('C:\\Radiance') },
      { name: 'Library', nick: 'Lib', desc: 'Extra folders for RAYPATH, separated by semicolons (optional).', hint: hint.panel('C:\\Radiance\\lib\\extra') }
    ],
    outputs: [{ name: 'Env', nick: 'Env', desc: 'Connect to the Env input of the Batch Writer' }],
    solve: (ctx) => [{ kind: 'env', folder: ctx.str(0), extra: ctx.str(1) || '' }]
  });

  /* == Site == */

  D({
    type: 'Rad.Weather', name: 'Weather File', nick: 'EPW', group: 'Site', icon: 'weather',
    desc: 'The EPW weather file used by annual workflows. Connect its name, or double-click the component to load the file: its location and hourly cloud cover and illuminance are then available to sky components and Spectral Annual.',
    keywords: 'weather epw climate file location tmy',
    inputs: [{ name: 'EPW', nick: 'EPW', desc: 'EPW file name or path, as the batch file should see it.', hint: hint.panel('weather.epw') }],
    outputs: [{ name: 'Weather', nick: 'W', desc: 'Weather file' }, { name: 'Location', nick: 'Loc', desc: 'Location read from the EPW header' }],
    menu: [{ label: 'Load EPW file...', action: 'loadEpw' }],
    dblclick: 'loadEpw',
    init: () => ({ file: '', header: null, hourly: null }),
    solve(ctx) {
      const st = ctx.state;
      const path = ctx.str(0) || st.file;
      if (!path) ctx.fail('Connect the EPW file name, or double-click to load an EPW file', 'warning');
      const match = st.header && (!ctx.has(0) || U.basename(path).toLowerCase() === String(st.file).toLowerCase());
      if (st.header && !match) ctx.remark('The loaded EPW (' + st.file + ') does not match this name, so its location is not used');
      if (!st.header) ctx.remark('Double-click to read the location from the EPW (sky components need it)');
      const loc = match ? Object.assign({ kind: 'location' }, st.header) : null;
      const w = { kind: 'weather', path, location: loc, hourly: match ? st.hourly : null };
      return [w, loc || undefined];
    }
  });

  D({
    type: 'Rad.Location', name: 'Location', nick: 'Loc', group: 'Site', icon: 'location',
    desc: 'Latitude, longitude (east positive, as in EPW files) and time zone (hours from UTC). Sky components convert these to the -a, -o and -m options Radiance expects.',
    keywords: 'location latitude longitude time zone site',
    inputs: [
      { name: 'Latitude', nick: 'Lat', def: 47.46, desc: 'Degrees north (south is negative).', hint: hint.slider(-90, 90, 3, 47.46) },
      { name: 'Longitude', nick: 'Lon', def: -122.31, desc: 'Degrees east (west is negative), as in EPW files.', hint: hint.slider(-180, 180, 3, -122.31) },
      { name: 'Time zone', nick: 'TZ', def: -8, desc: 'Hours from UTC, for example -8 for Pacific Standard Time.', hint: hint.slider(-12, 14, 1, -8) },
      { name: 'Name', nick: 'Name', desc: 'Place name (optional).', hint: hint.panel('Seattle') }
    ],
    outputs: [{ name: 'Location', nick: 'Loc', desc: 'Location' }],
    solve(ctx) {
      const lat = ctx.num(0);
      const lon = ctx.num(1);
      const tz = ctx.num(2);
      if (Math.abs(lat) > 90) ctx.fail('Latitude must be between -90 and 90');
      if (Math.abs(lon) > 180) ctx.fail('Longitude must be between -180 and 180');
      if (Math.abs(tz * 15 - lon) > 60) ctx.remark('The time zone is far from this longitude; check the signs (east and UTC offsets are positive)');
      return [{ kind: 'location', lat, lon, tz, name: ctx.str(3) || '' }];
    }
  });

  /* == Model == */

  D({
    type: 'Rad.Scene', name: 'Scene', nick: 'Scene', group: 'Model', icon: 'scene',
    desc: 'Radiance scene files compiled with oconv, in order (materials first). Connect a panel with one file per line, or several panels. To use an octree you already have, leave Files empty and give its name in Octree.',
    keywords: 'scene octree oconv files materials geometry rad mat',
    inputs: [
      { name: 'Files', nick: 'Files', access: 'list', desc: 'Scene files such as envelope.mat and envelope.rad, one per line.', hint: hint.panel('envelope.mat\nenvelope.rad') },
      { name: 'Octree', nick: 'Oct', desc: 'Octree name. Workflows pick a name when this is empty.', hint: hint.panel('model.oct') },
      { name: 'Freeze', nick: 'Frz', def: false, desc: 'Freeze the octree (oconv -f) so it does not depend on the scene files later.', hint: hint.toggle(false) }
    ],
    outputs: [{ name: 'Scene', nick: 'Scn', desc: 'Scene for a workflow' }],
    solve(ctx) {
      const files = T.strList(ctx.list(0));
      const oct = ctx.str(1) || null;
      if (!files.length && !oct) ctx.fail('Connect scene files, or an existing octree name', 'warning');
      if (!files.length && !/\.oct$/i.test(oct)) ctx.remark('With no files, ' + oct + ' is used as an existing octree');
      files.forEach((f) => { if (/\.oct$/i.test(f)) ctx.warn(f + ' looks like an octree; oconv needs scene files'); });
      return [{ kind: 'scene', files, oct, freeze: !!ctx.bool(2), prebuilt: !files.length }];
    }
  });

  D({
    type: 'Rad.Grid', name: 'Sensor Grid', nick: 'Grid', group: 'Model', icon: 'grid',
    desc: 'Sensor points file (x y z dx dy dz per line). Set Count to write -y with a fixed number; leave it empty and the batch file counts the points when it runs.',
    keywords: 'sensor grid points pts analysis',
    inputs: [
      { name: 'Points', nick: 'Pts', optional: false, desc: 'Points file name or path.', hint: hint.panel('0.pts') },
      { name: 'Count', nick: 'N', desc: 'Number of sensors (optional).', hint: hint.int(1, 5000, 100) }
    ],
    outputs: [{ name: 'Grid', nick: 'Grid', desc: 'Sensor grid' }],
    solve(ctx) {
      const count = ctx.has(1) ? ctx.int(1) : 0;
      if (ctx.has(1) && count < 1) ctx.fail('Count must be 1 or more');
      return [{ kind: 'grid', path: ctx.str(0), count }];
    }
  });

  const VIEW_TYPES = { v: 'v', perspective: 'v', l: 'l', parallel: 'l', c: 'c', cylindrical: 'c', h: 'h', hemispherical: 'h', fisheye: 'h', a: 'a', angular: 'a', s: 's', planisphere: 's', stereographic: 's' };
  D({
    type: 'Rad.View', name: 'View', nick: 'View', group: 'Model', icon: 'view',
    desc: 'Camera for renders: view type (-vt), position (-vp), direction (-vd), up vector (-vu) and horizontal and vertical size (-vh -vv, degrees, or world units for parallel views).',
    keywords: 'view camera vp vd vu vh vv fisheye perspective',
    inputs: [
      { name: 'Type', nick: 'Type', def: 'v', desc: 'v perspective, l parallel, c cylindrical, h hemispherical fisheye, a angular fisheye, s planisphere.',
        hint: hint.list([{ label: 'Perspective', value: 'v' }, { label: 'Parallel', value: 'l' }, { label: 'Cylindrical', value: 'c' },
          { label: 'Hemispherical fisheye', value: 'h' }, { label: 'Angular fisheye', value: 'a' }, { label: 'Planisphere', value: 's' }]) },
      { name: 'Position', nick: 'vp', optional: false, desc: 'View point x y z.', hint: hint.panel('0 0 1.2') },
      { name: 'Direction', nick: 'vd', optional: false, desc: 'View direction x y z.', hint: hint.panel('0 1 0') },
      { name: 'Up', nick: 'vu', def: '0 0 1', desc: 'Up vector x y z.', hint: hint.panel('0 0 1') },
      { name: 'Size', nick: 'Size', desc: 'Horizontal and vertical size (-vh -vv). One number for both, or a pair. Defaults: 60 for perspective, 180 for fisheyes.', hint: { widget: 'md', xmin: 1, xmax: 180, ymin: 1, ymax: 180, x: 60, y: 60, dec: 1 } }
    ],
    outputs: [{ name: 'View', nick: 'View', desc: 'View for a render' }, { name: 'Options', nick: 'Txt', desc: 'View options as text' }],
    solve(ctx) {
      const type = VIEW_TYPES[String(ctx.str(0) || 'v').toLowerCase().replace(/^-vt/, '')];
      if (!type) ctx.fail('Type must be v, l, c, h, a or s');
      const vp = T.vec3(ctx.raw(1));
      const vd = T.vec3(ctx.raw(2));
      const vu = T.vec3(ctx.raw(3));
      if (!vp) ctx.fail('Position needs three numbers');
      if (!vd) ctx.fail('Direction needs three numbers');
      if (!vu) ctx.fail('Up needs three numbers');
      if (vd.every((x) => x === 0)) ctx.fail('Direction cannot be 0 0 0');
      const fish = type === 'h' || type === 'a' || type === 's';
      const size = ctx.has(4) ? T.pair(ctx.raw(4)) : (fish ? [180, 180] : type === 'c' ? [180, 45] : [60, 60]);
      if (!size) ctx.fail('Size needs a number or a pair');
      if (type === 'h' && (size[0] > 180 || size[1] > 180)) ctx.warn('Hemispherical fisheyes are limited to 180 degrees');
      const dot = vd[0] * vu[0] + vd[1] * vu[1] + vd[2] * vu[2];
      const len = Math.hypot(vd[0], vd[1], vd[2]) * Math.hypot(vu[0], vu[1], vu[2]);
      if (len && Math.abs(dot / len) > 0.999) ctx.fail('Direction and Up must not be parallel');
      const v = { kind: 'view', type, vp, vd, vu, vh: size[0], vv: size[1] };
      return [v, B.viewText(v)];
    }
  });

  /* == Sky == */

  D({
    type: 'Rad.Receiver', name: 'Sky Receiver', nick: 'SkyRx', group: 'Sky', icon: 'receiver',
    desc: 'The sky patch receiver (skyglow.rad) for rfluxmtx: ground plus Tregenza or Reinhart patches. Its density sets gendaymtx -m too. With Write on, the batch file creates the file itself.',
    keywords: 'sky receiver skyglow rfluxmtx reinhart tregenza patches mf density',
    inputs: [
      { name: 'Density', nick: 'MF', def: 1, desc: 'Reinhart subdivision: 1 (Tregenza, 145 patches), 2 (577), 4 (2305) or 6 (5185).',
        hint: hint.list([{ label: 'Tregenza 145', value: 1 }, { label: 'Reinhart 577', value: 2 }, { label: 'Reinhart 2305', value: 4 }, { label: 'Reinhart 5185', value: 6 }]) },
      { name: 'File', nick: 'File', def: 'skyglow.rad', desc: 'Receiver file name.', hint: hint.panel('skyglow.rad') },
      { name: 'Write', nick: 'Write', def: true, desc: 'Write the receiver file from the batch file (True), or use an existing one (False).', hint: hint.toggle(true) },
      { name: 'Up', nick: 'Up', def: '+Y', desc: 'Direction of the first patch (north). gendaymtx assumes +Y.', hint: hint.panel('+Y') }
    ],
    outputs: [{ name: 'Receiver', nick: 'Rx', desc: 'Sky receiver' }, { name: 'Content', nick: 'Txt', desc: 'Receiver file content' }],
    solve(ctx) {
      const mf = ctx.int(0);
      if (mf < 1) ctx.fail('Density must be 1 or more');
      if ([1, 2, 4, 6].indexOf(mf) < 0) ctx.remark('Common densities are 1, 2, 4 and 6');
      const rx = { kind: 'receiver', mf, file: ctx.str(1) || 'skyglow.rad', write: !!ctx.bool(2), up: ctx.str(3) || '+Y' };
      const content = B.receiverLines(rx).map((l) => l.replace(/^echo /, '').replace(/ >>? .*$/, '')).join('\n');
      return [rx, content];
    }
  });

  const skyTime = [
    { name: 'Month', nick: 'M', def: 6, desc: 'Month, 1 to 12.', hint: hint.int(1, 12, 6) },
    { name: 'Day', nick: 'D', def: 21, desc: 'Day of the month.', hint: hint.int(1, 31, 21) },
    { name: 'Hour', nick: 'H', def: 12, desc: 'Standard local time in decimal hours (14.5 is 2:30 pm).', hint: hint.slider(0, 24, 2, 12) }
  ];
  function readTime(ctx, first) {
    const month = ctx.int(first);
    const day = ctx.int(first + 1);
    const hour = ctx.num(first + 2);
    if (month < 1 || month > 12) ctx.fail('Month must be 1 to 12');
    if (day < 1 || day > B.MONTH_DAYS[month - 1] + (month === 2 ? 1 : 0)) ctx.fail('Day ' + day + ' does not exist in month ' + month);
    if (hour < 0 || hour > 24) ctx.fail('Hour must be 0 to 24');
    return { month, day, hour };
  }
  const locInput = { name: 'Location', nick: 'Loc', optional: false, desc: 'Location, or a Weather File with its EPW loaded.' };

  D({
    type: 'Rad.Gensky', name: 'CIE Sky', nick: 'gensky', group: 'Sky', icon: 'gensky',
    desc: 'A CIE standard sky from gensky for one moment, written to a sky file the workflow adds to its octree (with sky and ground glow sources).',
    keywords: 'gensky cie sky sunny overcast intermediate clear',
    inputs: [locInput].concat(skyTime, [
      { name: 'Type', nick: 'Type', def: '+s', desc: '+s sunny with sun, -s sunny without sun, +i and -i intermediate, -c overcast, -u uniform.',
        hint: hint.list([{ label: 'Sunny with sun', value: '+s' }, { label: 'Sunny, no sun', value: '-s' }, { label: 'Intermediate with sun', value: '+i' },
          { label: 'Intermediate, no sun', value: '-i' }, { label: 'Overcast', value: '-c' }, { label: 'Uniform', value: '-u' }]) },
      { name: 'Ground', nick: 'Grnd', def: 0.2, desc: 'Ground reflectance (-g).', hint: hint.slider(0, 1, 2, 0.2) },
      { name: 'Turbidity', nick: 'Turb', desc: 'Linke turbidity (-t), optional.', hint: hint.slider(1, 10, 2, 2.45) },
      { name: 'File', nick: 'File', def: 'sky.rad', desc: 'Sky file name.', hint: hint.panel('sky.rad') }
    ]),
    outputs: [{ name: 'Sky', nick: 'Sky', desc: 'Sky for a workflow' }, { name: 'Commands', nick: 'Txt', desc: 'Commands that write the sky file' }],
    solve(ctx) {
      const loc = C.needLocation(ctx, 0);
      const t = readTime(ctx, 1);
      const type = ctx.str(4) || '+s';
      if (!/^[+-][sic]$|^-u$/.test(type)) ctx.fail('Type must be +s, -s, +i, -i, -c or -u');
      const sky = B.gensky(Object.assign({ loc, type, ground: ctx.num(5), turbidity: ctx.has(6) ? ctx.num(6) : undefined, file: ctx.str(7) || 'sky.rad' }, t));
      return [sky, sky.cmds.join('\n')];
    }
  });

  D({
    type: 'Rad.Gendaylit', name: 'Perez Sky', nick: 'gendaylit', group: 'Sky', icon: 'gendaylit',
    desc: 'A Perez all-weather sky from gendaylit using direct normal and diffuse horizontal irradiance (-W), for example from one hour of an EPW file.',
    keywords: 'gendaylit perez sky irradiance direct diffuse all weather',
    inputs: [locInput].concat(skyTime, [
      { name: 'Direct', nick: 'DNI', def: 500, desc: 'Direct normal irradiance in W/m2.', hint: hint.slider(0, 1000, 0, 500) },
      { name: 'Diffuse', nick: 'DHI', def: 100, desc: 'Diffuse horizontal irradiance in W/m2.', hint: hint.slider(0, 600, 0, 100) },
      { name: 'Ground', nick: 'Grnd', def: 0.2, desc: 'Ground reflectance (-g).', hint: hint.slider(0, 1, 2, 0.2) },
      { name: 'File', nick: 'File', def: 'sky.rad', desc: 'Sky file name.', hint: hint.panel('sky.rad') }
    ]),
    outputs: [{ name: 'Sky', nick: 'Sky', desc: 'Sky for a workflow' }, { name: 'Commands', nick: 'Txt', desc: 'Commands that write the sky file' }],
    solve(ctx) {
      const loc = C.needLocation(ctx, 0);
      const t = readTime(ctx, 1);
      const direct = ctx.num(4);
      const diffuse = ctx.num(5);
      if (direct < 0 || diffuse < 0) ctx.fail('Irradiance values cannot be negative');
      if (direct + diffuse === 0) ctx.warn('Both irradiance values are 0, which gives a dark sky');
      const sky = B.gendaylit(Object.assign({ loc, direct, diffuse, ground: ctx.num(6), file: ctx.str(7) || 'sky.rad' }, t));
      return [sky, sky.cmds.join('\n')];
    }
  });

  D({
    type: 'Rad.Genssky', name: 'Spectral Sky', nick: 'genssky', group: 'Sky', icon: 'genssky',
    desc: 'A spectral sky and ground from genssky (Radiance 6), for spectral workflows. Cloud cover blends a clear sky with a CIE overcast sky. The first run precomputes atmosphere data into an atmos_data folder.',
    keywords: 'genssky spectral sky hyperspectral cloud aerosol',
    inputs: [locInput].concat(skyTime, [
      { name: 'Cloud', nick: 'CC', def: 0, desc: 'Cloud cover from 0 (clear) to 1 (overcast), -c.', hint: hint.slider(0, 1, 2, 0) },
      { name: 'Aerosol', nick: 'AOD', desc: 'Broadband aerosol optical depth (-d), optional; Radiance uses 0.115.', hint: hint.slider(0, 1, 3, 0.115) },
      { name: 'Ground', nick: 'Grnd', desc: 'Ground reflectance (-g), optional; Radiance uses 0.2.', hint: hint.slider(0, 1, 2, 0.2) },
      { name: 'Threads', nick: 'Thr', desc: 'Threads for the precomputation (-n), optional.', hint: hint.int(1, 16, 8) },
      { name: 'File', nick: 'File', def: 'spectralsky.rad', desc: 'Sky file name; its name without .rad also prefixes the .hsr maps.', hint: hint.panel('spectralsky.rad') }
    ]),
    outputs: [{ name: 'Sky', nick: 'Sky', desc: 'Spectral sky for a workflow' }, { name: 'Commands', nick: 'Txt', desc: 'Command that writes the sky file' }],
    solve(ctx) {
      const loc = C.needLocation(ctx, 0);
      const t = readTime(ctx, 1);
      const cloud = ctx.num(4);
      if (cloud < 0 || cloud > 1) ctx.fail('Cloud cover must be between 0 and 1');
      const sky = B.genssky(Object.assign({ loc, cloud, aod: ctx.has(5) ? ctx.num(5) : undefined, ground: ctx.has(6) ? ctx.num(6) : undefined,
        threads: ctx.has(7) ? ctx.int(7) : 0, file: ctx.str(8) || 'spectralsky.rad' }, t));
      return [sky, sky.cmds.join('\n')];
    }
  });

  /* == Time == */

  D({
    type: 'Rad.Period', name: 'Analysis Period', nick: 'Period', group: 'Time', icon: 'period',
    desc: 'A range of days and hours, as in Ladybug: from the start date to the end date, each day from the start hour to the end hour. Dates may wrap around the new year and hours around midnight.',
    keywords: 'analysis period dates hours range season month day',
    inputs: [
      { name: 'Start month', nick: 'SM', def: 1, desc: 'Month, 1 to 12.', hint: hint.int(1, 12, 1) },
      { name: 'Start day', nick: 'SD', def: 1, desc: 'Day of the month.', hint: hint.int(1, 31, 1) },
      { name: 'Start hour', nick: 'SH', def: 0, desc: 'First hour of each day, 0 to 23 (0 is midnight to 1 am).', hint: hint.int(0, 23, 0) },
      { name: 'End month', nick: 'EM', def: 12, desc: 'Month, 1 to 12.', hint: hint.int(1, 12, 12) },
      { name: 'End day', nick: 'ED', def: 31, desc: 'Day of the month.', hint: hint.int(1, 31, 31) },
      { name: 'End hour', nick: 'EH', def: 23, desc: 'Last hour of each day, 0 to 23 (23 ends at midnight).', hint: hint.int(0, 23, 23) }
    ],
    outputs: [{ name: 'Period', nick: 'Per', desc: 'Analysis period' }, { name: 'Hours', nick: 'Hrs', desc: 'Hours of the year in the period (0 to 8759), as ranges' }],
    solve(ctx) {
      const v = [0, 1, 2, 3, 4, 5].map((i) => ctx.int(i));
      const [sm, sd, sh, em, ed, eh] = v;
      [[sm, sd], [em, ed]].forEach(([m, d]) => {
        if (m < 1 || m > 12) ctx.fail('Months must be 1 to 12');
        if (d < 1 || d > B.MONTH_DAYS[m - 1]) ctx.fail('Day ' + d + ' does not exist in month ' + m + ' (no leap day)');
      });
      if (sh < 0 || sh > 23 || eh < 0 || eh > 23) ctx.fail('Hours must be 0 to 23');
      const p = { kind: 'period', sm, sd, sh, em, ed, eh };
      const s0 = B.CUM[sm - 1] + sd - 1;
      const e0 = B.CUM[em - 1] + ed - 1;
      const days = [];
      for (let d = s0; ; d = (d + 1) % 365) { days.push(d); if (d === e0 || days.length > 365) break; }
      const runs = [];
      days.forEach((d) => {
        const hs = [];
        if (sh <= eh) { for (let h = sh; h <= eh; h += 1) hs.push(h); } else { for (let h = 0; h <= eh; h += 1) hs.push(h); for (let h = sh; h < 24; h += 1) hs.push(h); }
        hs.forEach((h) => {
          const x = d * 24 + h;
          const last = runs[runs.length - 1];
          if (last && x === last[1] + 1) last[1] = x; else runs.push([x, x]);
        });
      });
      const text = runs.map((r) => (r[0] === r[1] ? String(r[0]) : r[0] + '-' + r[1])).join(', ');
      return [p, text];
    }
  });

  D({
    type: 'Rad.Schedule', name: 'Occupancy Schedule', nick: 'Occ', group: 'Time', icon: 'schedule',
    desc: 'Occupied hours for annual metrics and glare autonomy: the same hours every day (IES LM-83 uses 8 to 18), or a CSV file with one value per hour of the year (the last value on each line counts; lines starting with # are skipped).',
    keywords: 'occupancy schedule occupied hours lm-83 csv daysim',
    inputs: [
      { name: 'Start', nick: 'Start', def: 8, desc: 'First occupied hour of the day.', hint: hint.int(0, 23, 8) },
      { name: 'End', nick: 'End', def: 18, desc: 'Hour when occupancy ends (18 means up to 6 pm).', hint: hint.int(1, 24, 18) },
      { name: 'File', nick: 'CSV', desc: 'Schedule file with 8760 lines, used instead of the hours (optional).', hint: hint.panel('occupancy.csv') }
    ],
    outputs: [{ name: 'Schedule', nick: 'Occ', desc: 'Occupancy schedule' }],
    solve(ctx) {
      const file = ctx.str(2) || '';
      const start = ctx.num(0);
      const end = ctx.num(1);
      if (!file && (start < 0 || start > 24 || end < 0 || end > 24 || start === end)) ctx.fail('Start and End must be different hours between 0 and 24');
      if (!file && start > end) ctx.remark('Occupied overnight, from ' + start + ' h to ' + end + ' h the next day');
      return [{ kind: 'schedule', start, end, file }];
    }
  });

  /* == Fenestration == */

  const LAUNCH = [{ label: 'genBSDF', value: 'genBSDF' }, { label: 'perl -S genBSDF.pl (Perl script on PATH)', value: 'perl -S genBSDF.pl' }];
  D({
    type: 'Rad.BSDF', name: 'BSDF', nick: 'BSDF', group: 'Fenestration', icon: 'bsdf',
    desc: 'A BSDF (XML) for a window or shading system. Give an existing file (for example from LBNL WINDOW), or connect the shading geometry and genBSDF makes it: Klems (145 x 145) for the three- to six-phase methods, or a tensor tree for renderings.',
    keywords: 'bsdf xml genbsdf klems tensor tree blinds shading complex fenestration',
    help: 'genBSDF expects the system with its width along X, height along Y and positive Z pointing into the room, with no geometry at positive Z. It is a Perl script: on Windows install Perl, and pick "perl -S genBSDF.pl" in this component\'s menu if the genBSDF command is not found.',
    inputs: [
      { name: 'XML', nick: 'XML', optional: false, desc: 'BSDF file name. Made by genBSDF when Geometry is connected, otherwise an existing file.', hint: hint.panel('clear.xml') },
      { name: 'Geometry', nick: 'Geo', access: 'list', desc: 'Shading system files for genBSDF (materials and geometry), optional.', hint: hint.panel('blinds.mat\nblinds.rad') },
      { name: 'Samples', nick: 'N', def: 2000, desc: 'Samples per incident direction (-c).', hint: hint.int(100, 20000, 2000) },
      { name: 'Tensor tree', nick: 'Tree', def: 0, desc: '0 for Klems, or 4 to 7 for a rank 4 tensor tree (-t4).', hint: hint.int(0, 7, 0) },
      { name: 'Options', nick: 'Opt', def: '-ab 5 -ad 700 -lw 3e-6', desc: 'rcontrib options for genBSDF (-r).', hint: hint.panel('-ab 5 -ad 700 -lw 3e-6') },
      { name: 'Color', nick: 'C', def: false, desc: 'Keep color in the XML (+C).', hint: hint.toggle(false) },
      { name: 'Processes', nick: 'Proc', def: 4, desc: 'Parallel processes (-n).', hint: hint.int(1, 32, 4) }
    ],
    outputs: [{ name: 'BSDF', nick: 'BSDF', desc: 'BSDF for a window group' }],
    menu: [{ label: 'genBSDF command', key: 'launch', options: LAUNCH }],
    init: () => ({ launch: 'genBSDF' }),
    solve(ctx) {
      const file = ctx.str(0);
      if (!/\.xml$/i.test(file)) ctx.remark('BSDF files usually end in .xml');
      const geo = T.strList(ctx.list(1));
      const b = { kind: 'bsdf', file, pre: [] };
      if (geo.length) {
        const tree = ctx.int(3);
        if (tree && (tree < 3 || tree > 8)) ctx.fail('Tensor tree must be 0 (Klems) or 4 to 7');
        const cmd = B.join([ctx.state.launch || 'genBSDF', '-n', Math.max(1, ctx.int(6)), '-c', ctx.int(2), ctx.bool(5) ? '+C' : '',
          tree ? '-t4 ' + tree : '', '-r "' + U.batEscape(ctx.str(4) || '') + '"', geo.map((f) => U.q(f)).join(' '), '>', U.q(file)]);
        b.pre = [{ rem: 'BSDF from the shading geometry (genBSDF' + (tree ? ', tensor tree' : ', Klems') + ')', cmds: [cmd], key: 'bsdf|' + cmd, writes: [file] }];
        if (tree) ctx.remark('Tensor trees suit renderings; the matrix methods need Klems (Tree 0)');
      }
      return [b];
    }
  });

  const UPS = { z: ['Z', '0 0 1'], '+z': ['Z', '0 0 1'], '-z': ['-Z', '0 0 -1'], y: ['Y', '0 1 0'], '+y': ['Y', '0 1 0'], '-y': ['-Y', '0 -1 0'], x: ['X', '1 0 0'], '+x': ['X', '1 0 0'], '-x': ['-X', '-1 0 0'] };
  D({
    type: 'Rad.Aperture', name: 'Window Group', nick: 'WinGrp', group: 'Fenestration', icon: 'aperture',
    desc: 'One window group for the three- to six-phase methods: its glazing polygons (facing into the room), its BSDF, and for four- and six-phase a facade aperture around the exterior shading. The batch file writes the receiver files (#@rfluxmtx h=kf) and a BSDF material version of the glazing.',
    keywords: 'window group aperture glazing three phase five phase klems receiver facade f matrix',
    help: 'Radiance treats window surfaces as facing into the room, and rfluxmtx sends rays from the back of a sender and receives them on the front of a receiver, so the same file serves as the receiver of the view matrix and the sender of the daylight matrix. Give only the glazing polygons: their material is replaced.',
    inputs: [
      { name: 'Glazing', nick: 'Glz', access: 'list', optional: false, desc: 'Files with the glazing polygons of this group, normals into the room.', hint: hint.panel('glazing.rad') },
      { name: 'BSDF', nick: 'BSDF', optional: false, desc: 'BSDF component or XML file name (Klems basis).', hint: hint.panel('clear.xml') },
      { name: 'Name', nick: 'Name', def: 'win', desc: 'Group name, used in file names.', hint: hint.panel('south') },
      { name: 'Basis', nick: 'Basis', def: 'kf', desc: 'Klems basis: kf full (145), kh half, kq quarter. Must match the BSDF.', hint: hint.list([{ label: 'Klems full', value: 'kf' }, { label: 'Klems half', value: 'kh' }, { label: 'Klems quarter', value: 'kq' }]) },
      { name: 'Up', nick: 'Up', def: 'Z', desc: 'Up direction: Z for walls, Y for skylights.', hint: hint.list([{ label: 'Z (walls)', value: 'Z' }, { label: 'Y (skylights)', value: 'Y' }]) },
      { name: 'Flip', nick: 'Flip', def: false, desc: 'Reverse the polygons (xform -I) when they face out of the room.', hint: hint.toggle(true) },
      { name: 'Facade', nick: 'F', access: 'list', desc: 'Facade aperture for four- and six-phase: polygons enclosing the exterior shading, facing the window (into the room).', hint: hint.panel('facade.rad') }
    ],
    outputs: [{ name: 'Window group', nick: 'Ap', desc: 'Window group for Annual (three- to six-phase)' }],
    solve(ctx) {
      const glazing = T.strList(ctx.list(0));
      const bsdf = C.bsdf(ctx.raw(1));
      if (!bsdf) ctx.fail('BSDF needs a BSDF component or an XML file name');
      const name = String(ctx.str(2) || 'win').replace(/[^\w-]/g, '_');
      const basis = String(ctx.str(3) || 'kf').toLowerCase();
      if (['kf', 'kh', 'kq'].indexOf(basis) < 0) ctx.fail('Basis must be kf, kh or kq');
      const up = UPS[String(ctx.str(4) || 'Z').toLowerCase()];
      if (!up) ctx.fail('Up must be X, Y or Z (with - for the opposite direction)');
      const inv = ctx.bool(5) ? '-I ' : '';
      const facadeFiles = T.strList(ctx.list(6));
      const rcv = name + '_ap.rad';
      const brad = name + '_bsdf.rad';
      const ff = name + '_F.rad';
      const files = glazing.map((f) => U.q(f)).join(' ');
      const cmds = [
        'echo #@rfluxmtx h=' + basis + ' u=' + up[0] + ' > ' + rcv,
        'echo void glow ' + name + '_glow 0 0 4 1 1 1 0 >> ' + rcv,
        'xform ' + inv + '-m ' + name + '_glow ' + files + ' >> ' + rcv,
        'echo void BSDF ' + name + '_bsdf 6 0 ' + U.q(bsdf.file) + ' ' + up[1] + ' . 0 0 > ' + brad,
        'xform ' + inv + '-m ' + name + '_bsdf ' + files + ' >> ' + brad];
      if (facadeFiles.length) {
        cmds.push('echo #@rfluxmtx h=' + basis + ' u=' + up[0] + ' > ' + ff,
          'echo void glow ' + name + '_Fglow 0 0 4 1 1 1 0 >> ' + ff,
          'xform ' + inv + '-m ' + name + '_Fglow ' + facadeFiles.map((f) => U.q(f)).join(' ') + ' >> ' + ff);
      }
      const ap = { kind: 'aperture', name, glazing, bsdf: bsdf.file, basis, up: up[0], receiver: rcv, bsdfRad: brad,
        facade: facadeFiles.length ? ff : null, facadeFiles,
        pre: (bsdf.pre || []).concat([{ rem: 'Window group ' + name + ': receiver and sender file, and the glazing with its BSDF material', cmds,
          key: 'ap|' + cmds.join('|'), writes: [rcv, brad].concat(facadeFiles.length ? [ff] : []) }]) };
      return [ap];
    }
  });

  /* == Lighting == */

  D({
    type: 'Rad.IES', name: 'IES Luminaire', nick: 'IES', group: 'Lighting', icon: 'ies',
    desc: 'Converts an IES photometry file with ies2rad and places copies of the luminaire with xform at the given points (rotated about Z). Connect it to the Luminaires input of Electric, Render or Lighting Scenes; one component is one luminaire group.',
    keywords: 'ies ies2rad luminaire photometry fixture layout electric lighting',
    inputs: [
      { name: 'IES file', nick: 'IES', optional: false, desc: 'IES photometry file.', hint: hint.panel('luminaire.ies') },
      { name: 'Positions', nick: 'Pos', access: 'list', desc: 'Construct Point components or a panel with "x y z" per line. Empty: one luminaire at the origin.', hint: hint.panel('2 2 2.7\n4 2 2.7') },
      { name: 'Rotation', nick: 'Rot', def: 0, access: 'list', desc: 'Rotation about Z in degrees: one value, or one per position.', hint: hint.slider(0, 360, 0, 0) },
      { name: 'Units', nick: 'Units', def: 'm', desc: 'Model units for ies2rad (-d): m, c (cm), f (feet) or i (inches).', hint: hint.list([{ label: 'Meters', value: 'm' }, { label: 'Centimeters', value: 'c' }, { label: 'Feet', value: 'f' }, { label: 'Inches', value: 'i' }]) },
      { name: 'Multiplier', nick: 'Mult', def: 1, desc: 'Output multiplier (-m), for lumen depreciation or dimming.', hint: hint.slider(0, 2, 2, 1) },
      { name: 'Name', nick: 'Name', desc: 'Base name of the luminaire files (default: the IES file name).', hint: hint.panel('downlight') }
    ],
    outputs: [{ name: 'Luminaires', nick: 'Lum', desc: 'Luminaire group' }],
    solve(ctx) {
      const ies = ctx.str(0);
      const pts = ctx.has(1) ? C.points(ctx.inputs[1].values) : [];
      if (pts.some((p) => !p)) ctx.fail('Positions need three numbers per point, such as 2 2 2.7');
      const rots = ctx.list(2).map(T.num);
      if (rots.some((r) => !isFinite(r))) ctx.fail('Rotation needs numbers');
      if (rots.length > 1 && rots.length !== pts.length) ctx.warn('Rotation has ' + rots.length + ' values for ' + pts.length + ' positions; the last value repeats');
      const units = String(ctx.str(3) || 'm').toLowerCase()[0];
      if ('mcfi'.indexOf(units) < 0) ctx.fail('Units must be m, c, f or i');
      const mult = ctx.num(4);
      const name = String(ctx.str(5) || U.basename(ies).replace(/\.ies$/i, '')).replace(/[^\w-]/g, '_') || 'luminaire';
      const cmds = [B.join(['ies2rad -d' + units, '-t default', mult !== 1 ? '-m ' + U.fmt(mult) : '', '-o', name, U.q(ies)])];
      let file = name + '.rad';
      if (pts.length) {
        file = name + '_layout.rad';
        pts.forEach((p, i) => {
          const r = rots.length ? rots[Math.min(i, rots.length - 1)] : 0;
          cmds.push(B.join(['xform', r ? '-rz ' + U.fmt(r) : '', '-t', p.map(U.fmt).join(' '), name + '.rad', i ? '>>' : '>', file]));
        });
      } else ctx.remark('No positions: one luminaire at the origin');
      return [{ kind: 'lum', files: [file], name, count: Math.max(1, pts.length),
        pre: [{ rem: 'Luminaire ' + name + ' from ' + U.basename(ies) + (pts.length ? ', ' + pts.length + ' positions' : ''), cmds,
          key: 'ies|' + cmds.join('|'), writes: [name + '.rad', name + '.dat'].concat(pts.length ? [file] : []) }] }];
    }
  });

  /* == advanced settings == */

  D({
    type: 'Rad.PhotonMap', name: 'Photon Map', nick: 'PMap', group: 'Settings', icon: 'pmap',
    desc: 'Adds a photon map to Radiance Parameters: the workflow runs mkpmap after its octree and adds -ap to rtrace or rpict. For daylight, name the window modifiers as photon ports so photons enter through the openings.',
    keywords: 'photon map mkpmap caustic global ports apo ap',
    help: 'With a photon map, any positive -ab works like -ab 1 (one final gather). Photon maps suit light pipes, redirecting systems and caustics; ports are the glazing modifiers, facing into the room.',
    inputs: [
      { name: 'Parameters', nick: 'Par', desc: 'Radiance Parameters to extend. Medium preset when empty.' },
      { name: 'Global photons', nick: 'Glob', def: '1m', desc: 'Photons in the global map (-apg), for example 500k or 2m.', hint: hint.panel('1m') },
      { name: 'Caustic photons', nick: 'Caus', desc: 'Photons in a caustic map (-apc), optional.', hint: hint.panel('100k') },
      { name: 'Ports', nick: 'Ports', access: 'list', desc: 'Modifiers acting as photon ports (-apo), one per line.', hint: hint.panel('glass_mat') },
      { name: 'Bandwidth', nick: 'Bw', def: 50, desc: 'Photons per density estimate (-ap file N).', hint: hint.int(10, 500, 50) },
      { name: 'Name', nick: 'Name', def: 'pmap', desc: 'Photon map file name, without extension.', hint: hint.panel('pmap') }
    ],
    outputs: [{ name: 'Parameters', nick: 'Par', desc: 'Parameters with the photon map' }],
    solve(ctx) {
      const base = ctx.has(0) ? C.params(ctx.raw(0)) : { kind: 'params', values: Object.assign({}, R.PRESETS.medium.values), raw: '', label: 'Medium', preset: 'medium' };
      if (!base) ctx.fail('Parameters needs a Radiance Parameters component');
      const count = (v, label) => {
        const t = String(v).trim().toLowerCase();
        if (!/^\d+(\.\d+)?[km]?$/.test(t)) ctx.fail(label + ' must be a number such as 500000, 500k or 1m');
        return t;
      };
      const global = count(ctx.str(1) || '1m', 'Global photons');
      const caustic = ctx.has(2) ? count(ctx.str(2), 'Caustic photons') : '';
      const ports = T.strList(ctx.list(3));
      const name = String(ctx.str(5) || 'pmap').replace(/[^\w-]/g, '_');
      if (!ports.length) ctx.remark('No photon ports: fine for electric light, slow or noisy for daylight');
      const pmap = { global, caustic, ports, bw: Math.max(1, ctx.int(4)), file: name + '.gpm', cfile: name + '.cpm' };
      return [Object.assign({}, base, { pmap, label: (base.label ? base.label + ', ' : '') + 'photon map' })];
    }
  });

  D({
    type: 'Rad.Illum', name: 'Illum Windows', nick: 'mkillum', group: 'Model', icon: 'illum',
    desc: 'Turns windows or skylights into secondary light sources with mkillum, for faster and smoother renderings. Builds an octree of the scene with the sky, runs mkillum on the window surfaces, and outputs the scene with the illum file added.',
    keywords: 'mkillum illum secondary source window skylight',
    help: 'Give the scene without the window surfaces, and the window files separately (normals into the room, materials defined in the scene). Use the same sky in the workflow.',
    inputs: [
      { name: 'Scene', nick: 'Scene', access: 'list', optional: false, desc: 'Scene component or files, without the windows.' },
      { name: 'Sky', nick: 'Sky', optional: false, desc: 'Sky component or file (the same sky as the workflow).' },
      { name: 'Windows', nick: 'Win', access: 'list', optional: false, desc: 'Files with the window surfaces.', hint: hint.panel('windows.rad') },
      { name: 'Parameters', nick: 'Par', desc: 'rtrace options for mkillum. Default -ab 2 -ad 1024 -as 512 -aa 0.1 -lw 0.002.' },
      { name: 'Output', nick: 'Out', def: 'illum.rad', desc: 'Illum file name.', hint: hint.panel('illum.rad') },
      { name: 'Processes', nick: 'Proc', desc: 'Parallel processes (-n), optional.', hint: hint.int(1, 32, 4) }
    ],
    outputs: [{ name: 'Scene', nick: 'Scn', desc: 'Scene with the illum windows' }],
    solve(ctx) {
      const scene = C.scene(ctx.list(0));
      if (!scene) ctx.fail('Scene needs a Scene component or file names');
      const sky = C.sky(ctx.raw(1));
      if (!sky) ctx.fail('Sky needs a sky component or a sky file name');
      const wins = T.strList(ctx.list(2));
      const params = ctx.has(3) ? C.params(ctx.raw(3)) : { kind: 'params', values: { ab: 2, ad: 1024, as: 512, aa: 0.1, lw: 0.002 }, raw: '', label: '', preset: 'none' };
      if (!params) ctx.fail('Parameters needs a Radiance Parameters component or an option string');
      const out = ctx.str(4) || 'illum.rad';
      const oct = out.replace(/\.rad$/i, '') + '_sky.oct';
      const o = B.octree(scene, [sky.file], oct, false);
      const n = ctx.has(5) ? ctx.int(5) : 0;
      const src = wins.length === 1 ? '< ' + U.q(wins[0]) : '';
      const mk = B.join([wins.length > 1 ? 'type ' + wins.map((f) => U.q(f)).join(' ') + ' |' : '', 'mkillum', n > 1 ? '-n ' + n : '', B.opts(params, 'rtrace'), U.q(o.oct), src, '>', U.q(out)]);
      const pre = [];
      if (sky.cmds && sky.cmds.length) pre.push(B.skyBlock(sky, 'Sky for mkillum'));
      pre.push({ rem: 'Illum sources for the windows (mkillum)', cmds: o.cmds.concat([mk]), key: 'illum|' + mk, writes: [out, o.oct] });
      const res = Object.assign({}, scene, { pre: (scene.pre || []).concat(pre) });
      if (scene.prebuilt) res.extra = (scene.extra || []).concat([out]);
      else res.files = scene.files.concat([out]);
      return [res];
    }
  });
})(window.VR);
