/* Visual Radiance: post-processing builders. Annual metrics (DA, cDA, UDI, sDA,
   ASE, LEED v4.1 option 1, EN 17037 daylight provision), grid statistics,
   falsecolor, tone mapping and export, and evalglare. Each script depends on
   the simulation that makes its input, so the Batch Writer can run it first. */
(function (VR) {
  'use strict';
  const U = VR.util;
  const B = VR.build;
  const q = U.q;
  const join = B.join;
  const varName = (s) => String(s).replace(/[^A-Za-z0-9]/g, '_').toUpperCase();
  const AND = '-e "and(a,b):if(a,b,a)"';

  // Input files of a post step: from a workflow script (with its result
  // description) or from file names given as text.
  B.inputOf = function (v) {
    if (!v) return null;
    if (v.kind === 'script') return Object.assign({ script: v }, v.result || { files: v.outputs, file: v.outputs[0] });
    const names = Array.isArray(v) ? v : [v];
    const files = names.map(String).filter(Boolean);
    if (!files.length) return null;
    const pattern = files.length === 1 && /[*?]/.test(files[0]) ? files[0] : null;
    return { script: null, file: files[0], files, pattern, quantity: null };
  };
  const depsOf = (inp) => (inp && inp.script ? [inp.script] : []);
  const tmpName = (pre, n) => pre + '_' + n + '.tmp';

  /* == annual metrics == */

  // Annual results have one row per hour and one column per sensor. rcollate -t
  // turns them into one row per sensor, rcomb marks the hours that meet a
  // threshold, and the occupancy vector (-m) sums them over occupied hours.
  B.metrics = function (c) {
    const pre = c.prefix || 'metrics';
    const pfx = 'VR_' + varName(pre);
    const s = B.script({ name: 'Annual metrics' });
    const inp = c.input;
    const en = c.check === 'en17037';
    s.title = 'Radiance annual daylight metrics' + (c.check === 'leed' ? ', LEED v4.1 EQ Daylight option 1' : en ? ', EN 17037 daylight provision' : '');
    s.info = ['Annual result: ' + inp.file + (c.direct ? ', direct sun: ' + c.direct : ''),
      en ? 'Daylight hours: the 4380 hours with the most global horizontal irradiance in ' + c.epw
        : 'Occupied hours: ' + (c.schedule && c.schedule.file ? c.schedule.file : (c.schedule ? c.schedule.start : 8) + ' to ' + (c.schedule ? c.schedule.end : 18) + ' h every day')];
    s.start = 'Annual metrics';
    s.end = 'Done. Summary: ' + pre + '_summary.txt';
    s.deps = depsOf(inp);
    const occ = pre + '_occ.txt';
    const occm = pre + '_occ.mtx';
    const T = pre + '_T.mtx';
    const sum = pre + '_summary.txt';
    const t = (n) => tmpName(pre, n);
    const occCmds = en ? [
      'rcalc -t, -e "cond=recno-8.5" -e "$1=$14+10000" ' + q(c.epw) + ' > ' + pre + '_ghi.txt',
      'sort /r ' + pre + '_ghi.txt > ' + pre + '_ghi_sorted.txt',
      'rcalc ' + AND + ' -e "cond=and(recno-4379.5,4380.5-recno)" -e "$1=$1" ' + pre + '_ghi_sorted.txt > ' + t('ghi'),
      B.setFrom(pfx + '_GHI', t('ghi')),
      'rcalc -e "$1=if($1-%' + pfx + '_GHI%+0.5,1,0)" ' + pre + '_ghi.txt > ' + occ]
      : B.scheduleCsv(c.schedule, occ);
    s.blocks.push({ rem: en ? 'Daylight hours: half of the year with the most daylight (global horizontal irradiance from the EPW)' : 'Occupancy schedule, one value per hour',
      cmds: occCmds.concat([B.countLines(pfx + '_HRS', occ)], B.mtxHeader(occm, '%' + pfx + '_HRS%', 1, 1), [
        'type ' + occ + ' >> ' + occm, 'total ' + occ + ' > ' + t('occ'), B.setFrom(pfx + '_OCC', t('occ')),
        'rcollate -t ' + q(inp.file) + ' > ' + T]) });

    const share = (expr, out) => 'rcomb -e "co=' + expr + '" ' + T + ' -m ' + occm + ' -fa | getinfo - | rcalc -e "$1=$1*100/%' + pfx + '_OCC%" > ' + out;
    const da = c.da;
    const u = c.udi;
    const files = { da: pre + '_DA.txt', cda: pre + '_cDA.txt', udiLow: pre + '_UDI_below.txt', udi: pre + '_UDI.txt', udiHigh: pre + '_UDI_above.txt' };
    s.blocks.push({ rem: 'Per sensor, percent of ' + (en ? 'daylight' : 'occupied') + ' hours: DA ' + da + ' lux, continuous DA, and UDI below, within and above ' + u[0] + ' to ' + u[1] + ' lux', cmds: [
      share('if(ci(1)-' + (da - 0.001) + ',1,0)', files.da),
      share('if(ci(1)-' + da + ',1,ci(1)/' + da + ')', files.cda),
      share('if(' + u[0] + '-ci(1),1,0)', files.udiLow),
      share('if(ci(1)-' + (u[0] - 0.001) + ',if(' + (u[1] + 0.001) + '-ci(1),1,0),0)', files.udi),
      share('if(ci(1)-' + u[1] + ',1,0)', files.udiHigh)] });
    const mean = (file, v) => ['total -m ' + file + ' > ' + t(v), B.setFrom(pfx + '_' + v, t(v))];
    s.blocks.push({ rem: 'sDA ' + da + ' lux / ' + c.sda + ' percent of hours: share of sensors that reach it', cmds: [
      'rcalc -e "$1=if($1-' + (c.sda - 0.0001) + ',1,0)" ' + files.da + ' | total -m | rcalc -e "$1=$1*100" > ' + t('sda'),
      B.setFrom(pfx + '_SDA', t('sda'))].concat(mean(files.da, 'MDA'), mean(files.udi, 'MUDI')) });
    const lines = [
      B.echoTo(sum, 'Annual daylight metrics for ' + inp.file, true),
      B.echoTo(sum, (en ? 'Daylight hours: ' : 'Occupied hours: ') + '{{' + pfx + '_OCC}} of {{' + pfx + '_HRS}}'),
      B.echoTo(sum, 'sDA ' + da + ' lux, ' + c.sda + ' percent of hours: {{' + pfx + '_SDA}} percent of sensors'),
      B.echoTo(sum, 'Mean DA ' + da + ' lux: {{' + pfx + '_MDA}} percent of hours'),
      B.echoTo(sum, 'Mean UDI ' + u[0] + ' to ' + u[1] + ' lux: {{' + pfx + '_MUDI}} percent of hours')];
    if (c.direct && !en) {
      const ah = pre + '_ASE_hours.txt';
      s.blocks.push({ rem: 'ASE ' + c.ase[0] + ' lux, ' + c.ase[1] + ' h: occupied hours of direct sun per sensor, then the share above ' + c.ase[1] + ' h', cmds: [
        'rcollate -t ' + q(c.direct) + ' | rcomb -e "co=if(ci(1)-' + (c.ase[0] - 0.001) + ',1,0)" - -m ' + occm + ' -fa | getinfo - > ' + ah,
        'rcalc -e "$1=if($1-' + c.ase[1] + ',1,0)" ' + ah + ' | total -m | rcalc -e "$1=$1*100" > ' + t('ase'),
        B.setFrom(pfx + '_ASE', t('ase'))] });
      lines.push(B.echoTo(sum, 'ASE ' + c.ase[0] + ' lux, ' + c.ase[1] + ' h: {{' + pfx + '_ASE}} percent of sensors'));
    }
    if (c.check === 'leed') {
      s.blocks.push({ rem: 'LEED v4.1 option 1 points: sDA at least 40, 55 or 75 percent (new construction table)', cmds: [
        'rcalc -n -e "s=%' + pfx + '_SDA%" -e "$1=if(s-74.9999,3,if(s-54.9999,2,if(s-39.9999,1,0)))" > ' + t('pts'),
        B.setFrom(pfx + '_PTS', t('pts'))].concat(c.direct ? ['rcalc -n -e "$1=if(%' + pfx + '_ASE%-10,1,0)" > ' + t('asex'), B.setFrom(pfx + '_ASEX', t('asex'))] : []) });
      lines.push(B.echoTo(sum, 'LEED v4.1 EQ Daylight option 1 points: {{' + pfx + '_PTS}}'));
      if (c.direct) lines.push('if "%' + pfx + '_ASEX%"=="1" ' + B.echoTo(sum, 'ASE is above 10 percent: LEED asks how the space is designed to address glare'));
    }
    if (en) {
      const cmds = [];
      [100, 300, 500, 750].forEach((lx) => {
        const f = pre + '_EN' + lx + '.txt';
        cmds.push(share('if(ci(1)-' + (lx - 0.001) + ',1,0)', f),
          'rcalc -e "$1=if($1-49.9999,1,0)" ' + f + ' | total -m | rcalc -e "$1=$1*100" > ' + t('f' + lx), B.setFrom(pfx + '_F' + lx, t('f' + lx)));
      });
      const F = (lx) => '%' + pfx + '_F' + lx + '%';
      const lvl = (a, b) => 'and(' + F(a) + '-49.9999,' + F(b) + '-94.9999)';
      cmds.push('rcalc -n ' + AND + ' -e "$1=if(' + lvl(750, 500) + ',3,if(' + lvl(500, 300) + ',2,if(' + lvl(300, 100) + ',1,0)))" > ' + t('lvl'),
        B.setFrom(pfx + '_LVL', t('lvl')));
      s.blocks.push({ rem: 'EN 17037 daylight provision: target over 50 percent and minimum target over 95 percent of the plane, for half of the daylight hours', cmds });
      lines.push(B.echoTo(sum, 'Share of sensors lit for half of the daylight hours: 100 lux {{' + pfx + '_F100}}, 300 lux {{' + pfx + '_F300}}, 500 lux {{' + pfx + '_F500}}, 750 lux {{' + pfx + '_F750}} percent'),
        B.echoTo(sum, 'EN 17037 level (0 none, 1 minimum 300/100 lux, 2 medium 500/300 lux, 3 high 750/500 lux): {{' + pfx + '_LVL}}'));
    }
    s.blocks.push({ rem: 'Summary', cmds: lines.concat(['type ' + sum, 'del ' + pre + '_*.tmp']) });
    s.outputs = [files.da, files.cda, files.udi, sum];
    s.result = { type: 'grid', file: files.da, files: s.outputs, quantity: 'DA', unit: '%', grid: inp.grid, columns: 1 };
    return s;
  };

  /* == grid statistics (point-in-time results) == */

  B.gridStats = function (c) {
    const inp = c.input;
    const pre = c.prefix || 'stats';
    const pfx = 'VR_' + varName(pre);
    const s = B.script({ name: 'Grid statistics' });
    const unit = c.unit || inp.unit || '';
    s.title = 'Radiance result statistics for ' + inp.file;
    s.info = ['Result: ' + inp.file + (unit ? ' (' + unit + ')' : '')];
    s.start = 'Statistics';
    s.end = 'Done. Summary: ' + pre + '_summary.txt';
    s.deps = depsOf(inp);
    const f = q(inp.file);
    const sum = pre + '_summary.txt';
    const t = (n) => tmpName(pre, n);
    const u = unit ? ' ' + unit : '';
    const cmds = [];
    [['MEAN', '-m'], ['MIN', '-l'], ['MAX', '-u']].forEach(([v, o]) => cmds.push('total ' + o + ' ' + f + ' > ' + t(v), B.setFrom(pfx + '_' + v, t(v))));
    cmds.push('rcalc -n -e "m=%' + pfx + '_MEAN%" -e "$1=if(m,%' + pfx + '_MIN%/m,0)" > ' + t('U'), B.setFrom(pfx + '_U', t('U')));
    const lines = [B.echoTo(sum, 'Statistics for ' + inp.file, true),
      B.echoTo(sum, 'Mean {{' + pfx + '_MEAN}}' + u + ', minimum {{' + pfx + '_MIN}}' + u + ', maximum {{' + pfx + '_MAX}}' + u),
      B.echoTo(sum, 'Uniformity (minimum / mean): {{' + pfx + '_U}}')];
    c.thresholds.forEach((th, i) => {
      const v = 'P' + i;
      cmds.push('rcalc -e "$1=if($1-' + U.fmt(th) + '+1e-6,1,0)" ' + f + ' | total -m | rcalc -e "$1=$1*100" > ' + t(v), B.setFrom(pfx + '_' + v, t(v)));
      lines.push(B.echoTo(sum, 'Sensors at or above ' + U.fmt(th) + u + ': {{' + pfx + '_' + v + '}} percent'));
    });
    s.blocks.push({ rem: 'Mean, minimum, maximum, uniformity and shares above thresholds', cmds });
    s.blocks.push({ rem: 'Summary', cmds: lines.concat(['type ' + sum, 'del ' + pre + '_*.tmp']) });
    s.outputs = [sum];
    s.result = { type: 'text', file: sum };
    return s;
  };

  /* == images == */

  // Run a command for one picture, or for every picture of a pattern with a for loop.
  // fn(inName, outName) gets quoted names; dir is where per-image outputs go.
  function eachImage(inp, out, dir, ext, fn) {
    if (inp.pattern) {
      return ['if not exist ' + q(dir) + ' mkdir ' + q(dir),
        'for %%F in (' + inp.pattern + ') do (' + fn('"%%F"', '"' + U.batEscape(dir) + '\\%%~nF' + ext + '"') + ')'];
    }
    return (inp.files || [inp.file]).map((f, i, all) => fn(q(f), q(all.length > 1 ? f.replace(/\.\w+$/, '') + '_' + out + ext : out + ext)));
  }
  B.FC_DEFAULTS = {
    luminance: { mult: 179, label: 'cd/m2' }, illuminance: { mult: 179, label: 'lux' }, irradiance: { mult: 1, label: 'W/m2' },
    radiance: { mult: 1, label: 'W/sr/m2' }, df: { mult: 1.79, label: 'DF %' }
  };
  const convert = (fmt, exp) => ({
    bmp: (a, b) => join(['ra_bmp', exp ? '-e ' + exp : '', a, b]),
    tif: (a, b) => join(['ra_tiff -z', exp ? '-e ' + exp : '', a, b]),
    ppm: (a, b) => join(['ra_ppm', exp ? '-e ' + exp : '', a, b])
  })[fmt];

  B.falsecolor = function (c) {
    const inp = c.input;
    const s = B.script({ name: 'Falsecolor' });
    const qd = B.FC_DEFAULTS[inp.quantity] || B.FC_DEFAULTS.luminance;
    const mult = c.mult !== undefined ? c.mult : qd.mult;
    const label = c.label || qd.label;
    s.title = 'Radiance falsecolor batch for ' + (inp.pattern || inp.file);
    s.info = ['Input: ' + (inp.pattern || inp.files.join(', ')), 'Scale: ' + c.max + ' ' + label + ', ' + c.div + ' steps' + (c.log ? ', log ' + c.log + ' decades' : '')];
    s.start = 'Falsecolor';
    s.end = 'Done falsecolor';
    s.deps = depsOf(inp);
    const style = { lines: '-cl', bands: '-cb', posterize: '-cp' }[c.style] || '';
    const opts = join(['-s', c.max, '-n', c.div, '-m', U.fmt(mult), '-l', q(label), c.log ? '-log ' + c.log : '',
      c.pal && c.pal !== 'def' ? '-pal ' + c.pal : '', style, c.extrema ? '-e' : '']);
    const out = c.out.replace(/\.hdr$/i, '');
    const dir = out;
    const cmds = eachImage(inp, out, dir, '.hdr', (a, b) => 'falsecolor ' + (c.overlay ? '-ip ' : '-i ') + a + ' ' + opts + ' > ' + b);
    if (c.format && c.format !== 'hdr') {
      const cv = convert(c.format);
      if (inp.pattern) cmds.push('for %%F in (' + q(dir) + '\\*.hdr) do (' + cv('"%%F"', '"' + U.batEscape(dir) + '\\%%~nF.' + c.format + '"') + ')');
      else cmds.push(cv(q(out + '.hdr'), q(out + '.' + c.format)));
    }
    s.blocks.push({ rem: 'False color' + (c.style && c.style !== 'none' ? ' ' + c.style : '') + (c.overlay ? ' over the rendering' : '') + ' with a legend', cmds });
    s.outputs = inp.pattern ? [dir + '\\*.hdr'] : [out + '.hdr'];
    s.result = inp.pattern ? { type: 'image', pattern: dir + '\\*.hdr', quantity: 'falsecolor', images: inp.images }
      : { type: 'image', files: [out + '.hdr'], quantity: 'falsecolor' };
    return s;
  };

  B.toneMap = function (c) {
    const inp = c.input;
    const s = B.script({ name: 'Tone map and export' });
    const fmt = c.format || 'bmp';
    s.title = 'Radiance tone mapping and export (' + fmt.toUpperCase() + ')';
    s.info = ['Input: ' + (inp.pattern || inp.files.join(', ')), 'Tone mapping: ' + c.mode + (c.exposure ? ', exposure ' + c.exposure : '')];
    s.start = 'Tone mapping';
    s.end = 'Done tone mapping';
    s.deps = depsOf(inp);
    const pc = { human: 'pcond -h', linear: 'pcond -l', acuity: 'pcond -a -v' }[c.mode];
    const exp = c.exposure ? (c.exposure > 0 ? '+' : '') + U.fmt(c.exposure) : '';
    const out = c.out.replace(/\.\w+$/, '');
    const dir = out;
    const ext = '.' + fmt;
    const cmds = eachImage(inp, out, dir, ext, (a, b) => {
      if (fmt === 'hdr') {
        return pc ? join([pc, exp ? '-e ' + exp : '', a, '>', b]) : join(['pfilt -1', exp ? '-e ' + exp : '', a, '>', b]);
      }
      const cv = convert(fmt, pc ? '' : exp);
      return pc ? join([pc, exp ? '-e ' + exp : '', a]) + ' | ' + cv('-', b) : cv(a, b);
    });
    s.blocks.push({ rem: (pc ? pc + ' then ' : '') + 'convert to ' + fmt.toUpperCase(), cmds });
    s.outputs = inp.pattern ? [dir + '\\*' + ext] : [out + ext];
    s.result = { type: 'image', files: s.outputs, quantity: 'display' };
    return s;
  };

  B.glare = function (c) {
    const inp = c.input;
    const pre = c.out.replace(/\.\w+$/, '');
    const s = B.script({ name: 'Glare (evalglare)' });
    s.title = 'Radiance evalglare batch: DGP, DGI, UGR, VCP and CGI';
    s.info = ['Input: ' + (inp.pattern || inp.files.join(', ')), 'Glare source threshold: ' + (c.threshold > 100 ? c.threshold + ' cd/m2' : c.threshold + ' x average luminance')];
    s.start = 'Glare evaluation';
    s.end = 'Done. Results: ' + c.out;
    s.deps = depsOf(inp);
    const opts = join([c.detailed ? '-d' : '', '-b', U.fmt(c.threshold), c.task ? '-T ' + c.task.map(U.fmt).join(' ') : '', c.view || '']);
    const out = q(c.out);
    let cmds;
    if (inp.pattern) {
      const cdir = pre + '_check';
      cmds = ['type nul > ' + out].concat(c.check ? ['if not exist ' + q(cdir) + ' mkdir ' + q(cdir)] : [], [
        'for %%F in (' + inp.pattern + ') do (<nul set /p "=%%~nF " & ' + join(['evalglare', opts,
          c.check ? '-c "' + U.batEscape(cdir) + '\\%%~nF.hdr"' : '', '"%%F"']) + ') >> ' + out]);
    } else {
      cmds = (inp.files || [inp.file]).map((f, i) => join(['evalglare', opts, c.check ? '-c ' + q(pre + '_check' + (i ? '_' + i : '') + '.hdr') : '', q(f), i ? '>>' : '>', out]));
    }
    cmds.push('type ' + out);
    s.blocks.push({ rem: 'Glare indices for each fisheye image (last line columns: DGP, average luminance, vertical illuminance, background, direct vertical illuminance, DGI, UGR, VCP, CGI and more)', cmds });
    s.outputs = [c.out];
    s.result = { type: 'text', file: c.out };
    return s;
  };
})(typeof window !== 'undefined' ? window.VR : globalThis.VR);
