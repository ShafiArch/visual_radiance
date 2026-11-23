/* Visual Radiance: command line builders for each workflow, and the .bat composer.
   Pure functions with no DOM access, so tests can run them in Node. */
(function (VR) {
  'use strict';
  const U = VR.util;
  const R = VR.rad;
  const B = VR.build = {};
  const q = U.q;

  // RGB irradiance to illuminance: 179 lm/W times (0.265, 0.670, 0.065).
  B.LUX = [47.4, 119.9, 11.6];
  B.MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  const join = B.join = (parts) => parts
    .filter((p) => p !== '' && p !== null && p !== undefined && p !== false)
    .join(' ');

  B.script = function (o) {
    return Object.assign({
      kind: 'script', name: '', title: '', info: [], start: null, end: null,
      setup: [], blocks: [], subs: [], outputs: []
    }, o);
  };

  B.opts = (params, cmd) => (params ? R.formatOptions(params, cmd) : '');

  /* == shared pieces == */

  // -y needs the sensor count. A known count is written as is; otherwise the
  // batch file counts the lines of the points file when it runs.
  B.countToken = function (grid, setup) {
    if (grid.count > 0) return String(grid.count);
    const v = 'VR_N_' + String(grid.path).replace(/[^A-Za-z0-9]/g, '_').slice(-24);
    const line = 'for /f %%A in (\'type ' + q(grid.path, true) + ' ^| find /c /v ""\') do set "' + v + '=%%A"';
    if (setup.indexOf(line) < 0) setup.push(line);
    return '%' + v + '%';
  };

  // oconv line for a scene plus extra files (sky, luminaires). A prebuilt octree
  // is used directly, or extended with "oconv -i" when extra files are given.
  B.octree = function (scene, extra, oct, freeze) {
    const more = (extra || []).filter(Boolean);
    if (scene && scene.prebuilt) {
      if (!more.length) return { cmds: [], oct: scene.oct };
      return { cmds: [join(['oconv -i', q(scene.oct), more.map((f) => q(f)).join(' '), '>', q(oct)])], oct };
    }
    const files = (scene ? scene.files : []).concat(more);
    return { cmds: [join(['oconv', freeze ? '-f' : '', files.map((f) => q(f)).join(' '), '>', q(oct)])], oct };
  };

  B.skyOf = function (sky) {
    if (!sky) return null;
    if (typeof sky === 'string') return { kind: 'sky', file: sky, cmds: [], source: 'file' };
    return sky;
  };

  // Location arguments for gensky, gendaylit and genssky. EPW longitudes are east
  // positive and time zones are hours from UTC; Radiance wants degrees west.
  B.locArgs = (loc) => '-a ' + U.fmt(loc.lat) + ' -o ' + U.fmt(-loc.lon) + ' -m ' + U.fmt(-15 * loc.tz);

  B.domeLines = (file) => [
    'echo skyfunc glow sky_glow 0 0 4 1 1 1 0 >> ' + q(file),
    'echo sky_glow source sky 0 0 4 0 0 1 180 >> ' + q(file),
    'echo skyfunc glow ground_glow 0 0 4 1 1 1 0 >> ' + q(file),
    'echo ground_glow source ground 0 0 4 0 0 -1 180 >> ' + q(file)
  ];

  B.gensky = function (c) {
    const cmd = join(['gensky', c.month, c.day, U.fmt(c.hour), c.type || '+s', B.locArgs(c.loc),
      c.ground !== undefined ? '-g ' + U.fmt(c.ground) : '',
      c.turbidity !== undefined ? '-t ' + U.fmt(c.turbidity) : '', '>', q(c.file)]);
    return { kind: 'sky', source: 'gensky', file: c.file, cmds: [cmd].concat(B.domeLines(c.file)) };
  };

  B.gendaylit = function (c) {
    const cmd = join(['gendaylit', c.month, c.day, U.fmt(c.hour), B.locArgs(c.loc),
      '-W', U.fmt(c.direct), U.fmt(c.diffuse),
      c.ground !== undefined ? '-g ' + U.fmt(c.ground) : '', '>', q(c.file)]);
    return { kind: 'sky', source: 'gendaylit', file: c.file, cmds: [cmd].concat(B.domeLines(c.file)) };
  };

  // genssky writes a complete spectral sky (sky and ground) to stdout and two
  // hyperspectral maps named after -f.
  B.genssky = function (c) {
    const prefix = String(c.file).replace(/\.rad$/i, '');
    const cmd = join(['genssky', c.month, c.day, U.fmt(c.hour), B.locArgs(c.loc),
      c.cloud ? '-c ' + U.fmt(c.cloud) : '',
      c.aod !== undefined ? '-d ' + U.fmt(c.aod) : '',
      c.ground !== undefined ? '-g ' + U.fmt(c.ground) : '',
      c.threads ? '-n ' + c.threads : '', '-f', q(prefix), '>', q(c.file)]);
    return { kind: 'sky', source: 'genssky', file: c.file, cmds: [cmd] };
  };

  // Sky receiver for rfluxmtx: ground first (bin 0), then Reinhart patches,
  // matching the row order of gendaymtx.
  B.receiverLines = function (rx) {
    const f = q(rx.file);
    const up = rx.up || '+Y';
    return [
      'echo #@rfluxmtx h=u u=' + up + ' > ' + f,
      'echo void glow groundglow 0 0 4 1 1 1 0 >> ' + f,
      'echo groundglow source ground 0 0 4 0 0 -1 180 >> ' + f,
      'echo #@rfluxmtx h=r' + rx.mf + ' u=' + up + ' >> ' + f,
      'echo void glow skyglow 0 0 4 1 1 1 0 >> ' + f,
      'echo skyglow source skydome 0 0 4 0 0 1 180 >> ' + f
    ];
  };

  B.viewText = function (v) {
    if (typeof v === 'string') return v.trim();
    return join(['-vt' + v.type, '-vp ' + v.vp.map(U.fmt).join(' '), '-vd ' + v.vd.map(U.fmt).join(' '),
      '-vu ' + v.vu.map(U.fmt).join(' '), '-vh ' + U.fmt(v.vh), '-vv ' + U.fmt(v.vv)]);
  };

  B.specFlags = (sp) => '-cs ' + sp.cs + ' -cw ' + U.fmt(sp.cw[0]) + ' ' + U.fmt(sp.cw[1]);
  B.specOut = (sp) => (sp.mode === 'co' ? '-co+' : '-p' + sp.mode);

  B.hourDate = function (h) {
    let doy = Math.floor(h / 24);
    let m = 0;
    while (m < 11 && doy >= B.MONTH_DAYS[m]) { doy -= B.MONTH_DAYS[m]; m += 1; }
    return { month: m + 1, day: doy + 1, hour: (h % 24) + 0.5 };
  };

  // Hours of the year (0 to 8759) from numbers or text such as "4110-4120, 4500".
  B.parseHours = function (list) {
    const set = new Set();
    const bad = [];
    list.forEach((item) => {
      String(item).split(/[\s,;]+/).filter(Boolean).forEach((tok) => {
        const m = tok.match(/^(\d+)(?:-(\d+))?$/);
        if (!m) { bad.push(tok); return; }
        const a = Number(m[1]);
        const b = m[2] === undefined ? a : Number(m[2]);
        for (let h = Math.min(a, b); h <= Math.max(a, b); h += 1) {
          if (h >= 0 && h < 8760) set.add(h); else bad.push(String(h));
        }
      });
    });
    return { hours: Array.from(set).sort((x, y) => x - y), bad };
  };

  function sceneInfo(scene) {
    if (!scene) return [];
    return scene.prebuilt ? ['Octree: ' + scene.oct] : ['Scene files: ' + scene.files.join(', ')];
  }

  /* == workflows == */

  // Annual illuminance: two-phase daylight coefficients plus accurate direct sun
  // (total minus direct-only plus direct sun coefficients).
  B.annual = function (c) {
    const P = c.part;
    const s1 = '_' + P;
    const s2 = '_part' + P;
    const rx = c.receiver;
    const mf = c.sunMF;
    const s = B.script({ name: 'Annual illuminance' });
    s.title = 'Radiance annual illuminance batch, part ' + P + (c.params && c.params.label ? ', ' + c.params.label : '');
    s.info = ['Weather file: ' + c.weather.path].concat(sceneInfo(c.scene),
      ['Black scene: ' + (c.black.prebuilt ? c.black.oct : c.black.files.join(', ')),
        'Sky receiver: ' + rx.file + ' (MF ' + rx.mf + ')', 'Sun patches: Reinhart MF ' + mf,
        'Sensor points: ' + c.grid.path]);
    s.start = 'Annual RUN (part ' + P + ')';
    s.end = 'Done part ' + P;

    const wea = 'Weather' + s1 + '.wea';
    const smx = 'Weather' + s1 + '.smx';
    const smxd = 'Weatherd' + s1 + '.smx';
    const smxs = 'WeathersunM' + mf + s1 + '.smx';
    const aoct = 'amodel' + s1 + '.oct';
    const boct = 'bmodel' + s1 + '.oct';
    const soct = 'sunCoefficientsDDS' + s1 + '.oct';
    const suns = 'suns' + s1 + '.rad';
    const ill = 'illum' + s2 + '.mtx';
    const bill = 'billum' + s2 + '.mtx';
    const cds = 'cdsDDS' + s2 + '.mtx';
    const rT = 'annualR' + s2 + '.ill';
    const rD = 'annualRd' + s2 + '.ill';
    const rS = 'annualRs' + s2 + '.ill';
    const rF = 'annualRfinal' + s2 + '.ill';
    const y = B.countToken(c.grid, s.setup);
    const pts = q(c.grid.path);
    const n = c.procs > 1 ? '-n ' + c.procs : '';
    const prm = B.opts(c.params, 'rfluxmtx');
    const conv = 'rmtxop -fa -t -c ' + B.LUX.join(' ') + ' -';
    const sunCount = 144 * mf * mf + 1;

    if (rx.write) s.blocks.push({ rem: 'Sky receiver (Reinhart MF ' + rx.mf + ')', cmds: B.receiverLines(rx) });
    s.blocks.push({ rem: 'Weather file and sky matrix', cmds: [
      'epw2wea ' + q(c.weather.path) + ' ' + wea,
      'gendaymtx -m ' + rx.mf + ' ' + wea + ' > ' + smx] });
    s.blocks.push({ rem: 'Daylight coefficients, full scene', cmds: [
      B.octree(c.scene, [], aoct, c.scene.freeze).cmds[0] || ('copy /y ' + q(c.scene.oct) + ' ' + aoct),
      join(['rfluxmtx -I+ -y', y, prm, n, '-', q(rx.file), '-i', aoct, '<', pts, '>', ill]),
      'dctimestep ' + ill + ' ' + smx + ' | ' + conv + ' > ' + rT] });
    s.blocks.push({ rem: 'Daylight coefficients, black scene with sun-only sky (direct part)', cmds: [
      B.octree(c.black, [], boct, c.black.freeze).cmds[0] || ('copy /y ' + q(c.black.oct) + ' ' + boct),
      join(['rfluxmtx -I+ -y', y, prm, n, '-', q(rx.file), '-i', boct, '<', pts, '>', bill]),
      'gendaymtx -m ' + rx.mf + ' -d ' + wea + ' > ' + smxd,
      'dctimestep ' + bill + ' ' + smxd + ' | ' + conv + ' > ' + rD] });
    const blackFiles = c.black.prebuilt ? null : c.black.files.map((f) => q(f)).join(' ');
    s.blocks.push({ rem: 'Direct sun coefficients (' + sunCount + ' suns, Reinhart MF ' + mf + ')', cmds: [
      'echo void light solar 0 0 3 1e6 1e6 1e6 > ' + suns,
      'cnt ' + sunCount + ' | rcalc -e MF:' + mf + ' -f ' + (c.sunCal || 'reinsrc.cal') +
        ' -e Rbin=recno -o "solar source sun 0 0 4 ${Dx} ${Dy} ${Dz} 0.533" >> ' + suns,
      blackFiles ? 'oconv -f ' + blackFiles + ' ' + suns + ' > ' + soct
        : 'oconv -i ' + q(c.black.oct) + ' ' + suns + ' > ' + soct,
      join(['rcontrib -I+', B.opts(c.sunParams, 'rcontrib'), '-y', y, n,
        '-fa -e MF:' + mf + ' -f reinhart.cal -b rbin -bn Nrbins -m solar', soct, '<', pts, '>', cds]),
      'gendaymtx -5 0.533 -d -m ' + mf + ' ' + wea + ' > ' + smxs,
      'dctimestep ' + cds + ' ' + smxs + ' | ' + conv + ' > ' + rS] });
    s.blocks.push({ rem: 'Final result: total minus direct-only plus direct sun', cmds: [
      'rmtxop ' + rT + ' + -s -1 ' + rD + ' + ' + rS + ' > ' + rF] });
    s.outputs = [rF];
    return s;
  };

  // Point-in-time illuminance at sensor points (daylight with a sky, or electric light).
  B.pit = function (c) {
    const electric = !!c.electric;
    const s = B.script({ name: electric ? 'Electric illuminance' : 'Point-in-time illuminance' });
    const label = c.params && c.params.label ? ', ' + c.params.label : '';
    s.title = 'Radiance rtrace batch, ' + (electric ? 'electric lighting' : 'point-in-time illuminance') + label;
    s.start = 'Running Radiance Simulation';
    s.end = 'Done!';
    const sky = B.skyOf(c.sky);
    const lights = c.lights || [];
    s.info = sceneInfo(c.scene);
    if (sky) s.info.push('Sky file: "' + sky.file + '"');
    if (lights.length) s.info.push('Luminaires: ' + lights.join(', '));
    s.info.push('Sensor points: ' + c.grid.path);
    if (sky && sky.cmds.length) s.blocks.push({ rem: 'Sky for this point in time', cmds: sky.cmds.slice() });
    const extra = (sky ? [sky.file] : []).concat(lights);
    const octName = (c.scene && !c.scene.prebuilt && c.scene.oct) || 'model.oct';
    const o = B.octree(c.scene, extra, octName, c.scene && c.scene.freeze);
    if (o.cmds.length) s.blocks.push({ rem: 'Build octree', cmds: o.cmds });
    let cmd = join(['rtrace -I -h', B.opts(c.params, 'rtrace'), c.procs > 1 ? '-n ' + c.procs : '',
      c.amb ? '-af ' + q(c.amb) : '', q(o.oct), '<', q(c.grid.path)]);
    if (c.lux) cmd += ' | rcalc -e "$1=' + B.LUX[0] + '*$1+' + B.LUX[1] + '*$2+' + B.LUX[2] + '*$3"';
    cmd += ' > ' + q(c.out);
    s.blocks.push({ rem: c.lux ? 'Trace sensor points (illuminance in lux)' : 'Trace sensor points (RGB irradiance)', cmds: [cmd] });
    s.outputs = [c.out];
    return s;
  };

  // Point-in-time image with rpict, an optional low resolution warm-up pass to fill
  // the ambient cache, then pcompos, pfilt and the view written into the header.
  B.render = function (c) {
    const s = B.script({ name: 'Point-in-time render' });
    const tag = c.tag === undefined || c.tag === null ? '' : String(c.tag).trim();
    const t = tag ? '_' + tag : '';
    const label = c.params && c.params.label ? c.params.label : '';
    const ql = label ? ' (' + label + ')' : '';
    s.title = 'Radiance rpict batch' + (tag ? (/^\d+$/.test(tag) ? ' for hour ' : ' for ') + tag : '') +
      (label ? ', ' + label : '');
    const sky = B.skyOf(c.sky);
    const lights = c.lights || [];
    s.info = [];
    if (sky) s.info.push('Sky file: "' + sky.file + '"');
    if (c.scene && c.scene.prebuilt) s.info.push('Octree: ' + c.scene.oct);
    else if (c.scene) s.info.push('Envelope files: ' + c.scene.files.join(', '));
    if (lights.length) s.info.push((lights.length > 1 ? 'Luminaires files: ' : 'Luminaires file: ') +
      lights.map((f) => '"' + f + '"').join(', '));
    if (sky && sky.cmds.length) s.blocks.push({ rem: 'Sky for this hour', cmds: sky.cmds.slice() });

    const extra = (sky ? [sky.file] : []).concat(lights);
    const octName = (c.scene && !c.scene.prebuilt && c.scene.oct) || ('model' + t + '.oct');
    const o = B.octree(c.scene, extra, octName, c.scene && c.scene.freeze);
    if (o.cmds.length) {
      s.blocks.push({ rem: '0) Build octree with sky (and luminaires)' + (tag ? ' for this hour' : ''), cmds: o.cmds });
    }
    const view = B.viewText(c.view);
    const img = c.image;
    const amb = c.amb || ('render' + t + '.amb');
    const report = img.report > 0 ? '-t ' + img.report : '';
    const preview = 'IMG' + t + '_preview.unf';
    const raw = 'IMG' + t + '_0.unf';
    const tmp = 'temp' + t + '.hdr';
    const err = 'error' + t + '.log';
    const out = c.out || ('Luminance' + t + '.hdr');
    let step = 1;
    if (img.warm > 0) {
      s.blocks.push({ rem: (step++) + ') Low-res warm-up to populate ambient cache' + ql, cmds: [
        join(['rpict', report, view, '-x', img.warm, '-y', img.warm, '-af', q(amb),
          B.opts(c.warmParams || c.params, 'rpict'), q(o.oct), '>', preview]),
        'del ' + preview] });
    }
    s.blocks.push({ rem: (step++) + ') High-res main render' + ql, cmds: [
      join(['rpict', report, view, '-x', img.x, '-y', img.y, '-af', q(amb), B.opts(c.params, 'rpict'),
        '-e', err, q(o.oct), '>', raw])] });
    const d = Math.max(1, Math.round(img.down || 1));
    const fx = Math.round(img.x / d);
    const fy = Math.round(img.y / d);
    const header = 'getinfo -a "VIEW= ' + view + ' -x ' + fx + ' -y ' + fy + '"';
    s.blocks.push({ rem: step + ') Convert to HDR, ' + (d > 1 ? 'filter and downsample to final resolution' : 'add the view to the header'), cmds: [
      'pcompos -a 1 ' + raw + ' > ' + tmp,
      (d > 1 ? 'pfilt -r 0.6 -x /' + d + ' -y /' + d + ' ' + tmp + ' | ' + header : header + ' < ' + tmp) + ' > ' + q(out),
      'del ' + tmp,
      'del ' + raw] });
    s.end = 'Done. Output: ' + out;
    s.outputs = [out];
    return s;
  };

  // Spectral point-in-time: rtrace with -cs/-cw spectral sampling (Radiance 6).
  B.spectralPit = function (c) {
    const s = B.script({ name: 'Spectral point-in-time' });
    s.title = 'Radiance spectral rtrace batch' + (c.params && c.params.label ? ', ' + c.params.label : '');
    s.start = 'Running spectral simulation';
    s.end = 'Done!';
    const sky = B.skyOf(c.sky);
    s.info = sceneInfo(c.scene);
    if (sky) s.info.push('Sky file: "' + sky.file + '"');
    s.info.push('Spectral sampling: ' + B.specFlags(c.spectral) + ' ' + B.specOut(c.spectral));
    if (sky && sky.cmds.length) s.blocks.push({ rem: 'Spectral sky', cmds: sky.cmds.slice() });
    const octName = (c.scene && !c.scene.prebuilt && c.scene.oct) || 'specmodel.oct';
    const o = B.octree(c.scene, sky ? [sky.file] : [], octName, c.scene && c.scene.freeze);
    if (o.cmds.length) s.blocks.push({ rem: 'Build octree', cmds: o.cmds });
    s.blocks.push({ rem: 'Trace sensor points with spectral sampling', cmds: [
      join(['rtrace -I -h', B.specFlags(c.spectral), B.opts(c.params, 'rtrace'), c.procs > 1 ? '-n ' + c.procs : '',
        c.amb ? '-af ' + q(c.amb) : '', c.log ? '-e ' + q(c.log) : '', B.specOut(c.spectral),
        q(o.oct), '<', q(c.grid.path), '>', q(c.out)])] });
    s.outputs = [c.out];
    return s;
  };

  // Spectral annual: one spectral point-in-time run per hour. Each hour gets a
  // genssky sky (with cloud cover and illuminance from the EPW when it was loaded),
  // its own octree and its own result file. Hours are dispatched with "call :label".
  B.spectralAnnual = function (c) {
    const s = B.script({ name: 'Spectral annual' });
    const pre = c.prefix || 'spec';
    const label = ':vr_' + pre.replace(/[^A-Za-z0-9]/g, '_') + '_hour';
    const hours = c.hours;
    const hourly = c.hourly;
    const calls = [];
    const skipped = [];
    hours.forEach((h) => {
      const d = B.hourDate(h);
      let arg = '';
      if (hourly) {
        const dn = Math.round(hourly.dn[h] || 0);
        const dh = Math.round(hourly.dh[h] || 0);
        if (dn + dh <= 0) { skipped.push(h); return; }
        const cc = Math.min(1, Math.max(0, (hourly.cc[h] || 0) / 10));
        arg = ' "-c ' + U.fmt(cc) + ' -L ' + dn + ' ' + dh + '"';
      }
      calls.push('call ' + label + ' ' + h + ' ' + d.month + ' ' + d.day + ' ' + U.fmt(d.hour) + arg);
    });
    s.title = 'Radiance spectral annual batch, ' + calls.length + ' hours' + (c.params && c.params.label ? ', ' + c.params.label : '');
    s.info = sceneInfo(c.scene).concat(['Location: ' + B.locArgs(c.loc),
      'Spectral sampling: ' + B.specFlags(c.spectral) + ' ' + B.specOut(c.spectral),
      'Sensor points: ' + c.grid.path]);
    s.start = 'Spectral annual RUN (' + calls.length + ' hours)';
    s.end = 'Done spectral annual';
    s.blocks.push({ rem: 'One spectral run per hour: genssky, oconv, rtrace', cmds: calls });
    // Names built here contain %1, so they are written without percent escaping.
    const sky = pre + 'sky_%1.rad';
    const oct = pre + 'model_%1.oct';
    const oconv = c.scene.prebuilt
      ? join(['oconv -i', q(c.scene.oct), sky, '>', oct])
      : join(['oconv', c.scene.freeze ? '-f' : '', c.scene.files.map((f) => q(f)).join(' '), sky, '>', oct]);
    s.subs = [
      label,
      join(['genssky %2 %3 %4', B.locArgs(c.loc), c.threads ? '-n ' + c.threads : '', '%~5', '-f', pre + 'sky_%1', '>', sky]),
      oconv,
      join(['rtrace -I -h', B.specFlags(c.spectral), B.opts(c.params, 'rtrace'), c.procs > 1 ? '-n ' + c.procs : '',
        B.specOut(c.spectral), oct, '<', q(c.grid.path), '>', pre + '_%1.res']),
      'goto :eof'
    ];
    s.outputs = calls.map((line) => pre + '_' + line.split(' ')[2] + '.res');
    s.skipped = skipped;
    return s;
  };

  /* == .bat composer == */

  B.envLines = function (env) {
    const root = U.batEscape(String(env.folder).replace(/[\\/]+$/, ''));
    const lib = root + '\\lib' + (env.extra ? ';' + U.batEscape(env.extra) : '');
    return ['set "PATH=' + root + '\\bin;%PATH%"', 'set "RAYPATH=.;' + lib + '"'];
  };

  /* o: { folder, here, echoOff, comments, progress, pause, env } */
  B.compose = function (scripts, o) {
    const L = [];
    const C = !!o.comments;
    const blank = () => { if (L.length && L[L.length - 1] !== '') L.push(''); };
    if (o.echoOff) L.push('@echo off');
    if (C) {
      scripts.forEach((s, i) => {
        L.push('REM ' + U.remText(s.title || s.name));
        if (i === 0 && o.folder) L.push('REM Root folder: "' + U.remText(o.folder) + '"');
        (s.info || []).forEach((x) => L.push('REM ' + U.remText(x)));
      });
      L.push('');
    }
    if (o.env) L.push.apply(L, B.envLines(o.env));
    if (o.folder) L.push('cd /d ' + q(o.folder, true));
    else if (o.here) L.push('cd /d "%~dp0"');
    if (C && (o.env || o.folder || o.here)) L.push('');
    scripts.forEach((s) => {
      if (o.progress && s.start) L.push('echo ' + U.echoText(s.start));
      (s.setup || []).forEach((x) => L.push(x));
      s.blocks.forEach((b) => {
        if (C && b.rem) { blank(); L.push('REM ' + U.remText(b.rem)); }
        b.cmds.forEach((x) => L.push(x));
      });
      if (o.progress && s.end) { if (C) blank(); L.push('echo ' + U.echoText(s.end)); }
    });
    if (o.pause) L.push('pause');
    const subs = [];
    scripts.forEach((s) => { if (s.subs && s.subs.length) subs.push(s.subs); });
    if (subs.length) {
      L.push('goto :eof');
      subs.forEach((sub) => { L.push(''); sub.forEach((x) => L.push(x)); });
    }
    while (L.length && L[L.length - 1] === '') L.pop();
    return L.join('\r\n') + '\r\n';
  };
})(window.VR);
