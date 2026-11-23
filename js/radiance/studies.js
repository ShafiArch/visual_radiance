/* Visual Radiance: builders for the annual methods (two-, three-, four-, five-,
   six-phase and direct), and for radiation, sun hours, annual glare, annual
   images, animation, lighting scenes and the LEED illuminance check.
   Pure functions with no DOM access, so tests can run them in Node. */
(function (VR) {
  'use strict';
  const U = VR.util;
  const B = VR.build;
  const q = U.q;
  const join = B.join;

  B.CUM = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  const AND = '-e "and(a,b):if(a,b,a)"';
  const varName = (s) => String(s).replace(/[^A-Za-z0-9]/g, '_').toUpperCase();

  /* == small pieces shared by the studies == */

  // Write a line of text to a file. {{NAME}} becomes the batch variable %NAME%.
  B.echoTo = (file, text, first) => (first ? '>' : '>>') + q(file, true) +
    (text ? ' echo ' + U.echoText(text).replace(/\{\{(\w+)\}\}/g, '%$1%') : ' echo.');
  // Read the first line of a file into a batch variable.
  B.setFrom = (name, file) => 'set /p ' + name + '=<' + q(file, true);
  // %NAME% batch variables inside text written with echoTo.
  B.vars = (x) => String(x).replace(/%(\w+)%/g, '{{$1}}');
  // Radiance matrix header for a file the batch file writes itself.
  B.mtxHeader = function (file, rows, cols, comps) {
    return [B.echoTo(file, '#?RADIANCE', true), B.echoTo(file, 'NROWS=' + B.vars(rows)), B.echoTo(file, 'NCOLS=' + B.vars(cols)),
      B.echoTo(file, 'NCOMP=' + (comps || 1)), B.echoTo(file, 'FORMAT=ascii'), B.echoTo(file, '')];
  };
  // Count the lines of a file (or of a command) into a batch variable.
  B.countLines = (name, file, filter) => 'for /f %%A in (\'' + (filter ? filter + ' ' + q(file, true) + ' ^| find /c /v ""'
    : 'type ' + q(file, true) + ' ^| find /c /v ""') + '\') do set "' + name + '=%%A"';

  // Location variables read from a .wea header when the batch file runs:
  // latitude, longitude (degrees west) and time zone (degrees west).
  B.weaLocVars = (wea, pfx) => ['latitude:LAT', 'longitude:LON', 'time_zone:MER'].map((x) => {
    const [key, v] = x.split(':');
    return 'for /f "tokens=2" %%A in (\'findstr /b "' + key + '" ' + q(wea, true) + '\') do set "' + pfx + '_' + v + '=%%A"';
  });
  B.weaHeaderLines = (loc, file) => [
    B.echoTo(file, 'place ' + (String(loc.name || 'site').replace(/[^\w.-]+/g, '_') || 'site'), true),
    B.echoTo(file, 'latitude ' + U.fmt(loc.lat)), B.echoTo(file, 'longitude ' + U.fmt(-loc.lon)),
    B.echoTo(file, 'time_zone ' + U.fmt(-15 * loc.tz)), B.echoTo(file, 'site_elevation ' + U.fmt(loc.elev || 0)),
    B.echoTo(file, 'weather_data_file_units 1')];
  // sun.cal site settings, from a Location or from wea header variables.
  B.sunCalSite = (loc, pfx) => (loc
    ? 'RLAT=' + U.fmt(loc.lat) + '*DEG;RLON=' + U.fmt(-loc.lon) + '*DEG;RSM=' + U.fmt(-15 * loc.tz) + '*DEG'
    : 'RLAT=%' + pfx + '_LAT%*DEG;RLON=%' + pfx + '_LON%*DEG;RSM=%' + pfx + '_MER%*DEG');

  // rcalc condition for an analysis period on month, day and hour expressions.
  // Dates and hours may wrap around (December to February, 22 to 4 h).
  B.periodCond = function (p, m, d, h) {
    if (!p) return '';
    const parts = [];
    const s = B.CUM[p.sm - 1] + p.sd;
    const e = B.CUM[p.em - 1] + p.ed;
    if (!(s === 1 && e === 365)) {
      const jd = '(' + d + '+select(' + m + ',' + B.CUM.join(',') + '))';
      parts.push((s <= e ? 'and(' : 'max(') + jd + '-' + (s - 0.5) + ',' + (e + 0.5) + '-' + jd + ')');
    }
    if (!(p.sh === 0 && p.eh === 23)) {
      const hh = 'floor(' + h + ')';
      parts.push((p.sh <= p.eh ? 'and(' : 'max(') + hh + '-' + (p.sh - 0.5) + ',' + (p.eh + 0.5) + '-' + hh + ')');
    }
    return parts.length === 2 ? 'and(' + parts[0] + ',' + parts[1] + ')' : (parts[0] || '');
  };
  // Month from a day of the year (no leap day), as an rcalc expression.
  B.monthExpr = function (jd) {
    let e = '1';
    for (let m = 2; m <= 12; m += 1) e = 'if(' + jd + '-' + (B.CUM[m - 1] + 0.5) + ',' + m + ',' + e + ')';
    return e;
  };
  // rcalc condition that keeps records whose (zero based) number is in a list of hours.
  B.hoursCond = function (hours, v) {
    const runs = [];
    hours.forEach((h) => {
      const last = runs[runs.length - 1];
      if (last && h === last[1] + 1) last[1] = h; else runs.push([h, h]);
    });
    const V = /^\w+$/.test(v) ? v : '(' + v + ')';
    const one = (r) => 'and(' + V + '-' + (r[0] - 0.5) + ',' + (r[1] + 0.5) + '-' + V + ')';
    return runs.length === 1 ? one(runs[0]) : 'max(' + runs.map(one).join(',') + ')';
  };

  // epw2wea, then (optionally) a copy keeping only the data lines that pass cond,
  // with expressions for the five output columns.
  B.weaFilter = function (full, out, cond, cols, extra) {
    const needAnd = /and\(/.test(cond || '') && String(extra || '').indexOf('and(a,b)') < 0;
    return [
      'findstr /b /v /r "[0-9]" ' + q(full) + ' > ' + q(out),
      join(['findstr /b /r "[0-9]" ' + q(full) + ' | rcalc', extra || '', needAnd ? AND : '',
        cond ? '-e "cond=' + cond + '"' : '', '-e "' + (cols || '$1=$1;$2=$2;$3=$3;$4=$4;$5=$5') + '"', '>>', q(out)])];
  };

  B.sunLines = (mf, cal, file) => [
    'echo void light solar 0 0 3 1e6 1e6 1e6 > ' + file,
    'cnt ' + (144 * mf * mf + 1) + ' | rcalc -e MF:' + mf + ' -f ' + (cal || 'reinsrc.cal') +
      ' -e Rbin=recno -o "solar source sun 0 0 4 ${Dx} ${Dy} ${Dz} 0.533" >> ' + file];

  const withAb = (p, ab) => Object.assign({}, p, { values: Object.assign({}, p.values, { ab }) });
  const sceneInfo = (scene, label) => (scene ? [(label || 'Scene') + ': ' + (scene.prebuilt ? scene.oct : scene.files.join(', '))] : []);
  const octreeCmd = (scene, oct) => B.octree(scene, [], oct, scene.freeze).cmds[0] || ('copy /y ' + q(scene.oct) + ' ' + oct);
  const qName = (qk) => (qk === 'rgb' ? 'RGB irradiance' : B.QTY[qk].label.toLowerCase());
  const rxBlock = (rx) => B.rxBlock(rx);

  /* == annual methods == */

  B.METHODS = {
    dds: { label: 'Two-phase DDS (daylight coefficients plus direct sun)', short: 'DDS' },
    two: { label: 'Two-phase (daylight coefficients)', short: 'two-phase' },
    three: { label: 'Three-phase (V T D S)', short: 'three-phase' },
    four: { label: 'Four-phase (V T F D S)', short: 'four-phase' },
    five: { label: 'Five-phase (three-phase plus direct sun)', short: 'five-phase' },
    six: { label: 'Six-phase (four-phase plus direct sun)', short: 'six-phase' },
    direct: { label: 'Direct (one rtrace run per daylight hour)', short: 'direct' }
  };
  const MALIAS = { dds: 'dds', '2dds': 'dds', 'two-phase dds': 'dds', 2: 'two', two: 'two', '2ph': 'two', 'two-phase': 'two', dc: 'two',
    'daylight coefficient': 'two', 3: 'three', three: 'three', '3ph': 'three', 'three-phase': 'three', 4: 'four', four: 'four', '4ph': 'four',
    'four-phase': 'four', 5: 'five', five: 'five', '5ph': 'five', 'five-phase': 'five', 6: 'six', six: 'six', '6ph': 'six', 'six-phase': 'six',
    direct: 'direct', rtrace: 'direct', 'brute force': 'direct', 1: 'direct' };
  B.methodKey = (v) => (v === undefined || v === null || v === '' ? 'dds' : MALIAS[String(v).trim().toLowerCase()] || null);

  B.annualMethod = function (c) {
    if (c.method === 'two') return twoPhase(c);
    if (c.method === 'direct') return directAnnual(c);
    if (['three', 'four', 'five', 'six'].indexOf(c.method) >= 0) return phases(c);
    return B.annual(c);
  };

  function annualStart(c, name) {
    const qk = c.quantity || 'illuminance';
    const s = B.script({ name: 'Annual ' + qName(qk) + ' (' + name + ')' });
    s.title = 'Radiance ' + name + ' annual ' + qName(qk) + ' batch, part ' + c.part + (c.params && c.params.label ? ', ' + c.params.label : '');
    s.info = ['Weather file: ' + c.weather.path].concat(sceneInfo(c.scene), ['Sensor points: ' + c.grid.path]);
    s.start = name + ' annual RUN (part ' + c.part + ')';
    s.end = 'Done ' + name + ' part ' + c.part;
    return { s, qk, Q: B.QTY[qk] };
  }

  function twoPhase(c) {
    const { s, qk, Q } = annualStart(c, 'Two-phase');
    const P = c.part;
    const rx = c.receiver;
    const wea = '2ph_weather_' + P + '.wea';
    const smx = '2ph_sky_' + P + '.smx';
    const oct = '2ph_model_' + P + '.oct';
    const dc = '2ph_dc_part' + P + '.mtx';
    const out = '2ph_annual_part' + P + '.ill';
    const y = B.countToken(c.grid, s.setup);
    if (rx.write) s.blocks.push(rxBlock(rx));
    s.blocks.push({ rem: 'Weather file and sky matrix (sun spread over the nearest patches)', cmds: [
      'epw2wea ' + q(c.weather.path) + ' ' + wea, 'gendaymtx -m ' + rx.mf + ' ' + wea + ' > ' + smx] });
    s.blocks.push({ rem: 'Daylight coefficients', cmds: [octreeCmd(c.scene, oct),
      join(['rfluxmtx', Q.irr ? '-I+' : '', '-y', y, B.opts(c.params, 'rfluxmtx'), c.procs > 1 ? '-n ' + c.procs : '',
        '-', q(rx.file), '-i', oct, '<', q(c.grid.path), '>', dc]),
      'dctimestep ' + dc + ' ' + smx + ' | ' + join(['rmtxop -fa -t', Q.mtx || '', '-']) + ' > ' + out] });
    s.outputs = [out];
    s.result = { type: 'annual', file: out, direct: null, quantity: qk, unit: Q.unit, grid: c.grid, weather: c.weather.path, method: 'two' };
    return s;
  }

  // Three-, four-, five- and six-phase methods, for one or more window groups.
  function phases(c) {
    const n = { three: 3, four: 4, five: 5, six: 6 }[c.method];
    const F = n === 4 || n === 6;
    const direct = n >= 5;
    const tag = n + 'ph';
    const { s, qk, Q } = annualStart(c, n + '-phase');
    const P = c.part;
    const s1 = '_' + P;
    const s2 = '_part' + P;
    const rx = c.receiver;
    const mf = c.sunMF;
    const I = Q.irr ? '-I+' : '';
    const conv = join(['rmtxop -fa -t', Q.mtx || '', '-']);
    const np = c.procs > 1 ? '-n ' + c.procs : '';
    const y = B.countToken(c.grid, s.setup);
    const pts = q(c.grid.path);
    const par = B.opts(c.params, 'rfluxmtx');
    const dpar = B.opts(c.dparams, 'rfluxmtx');
    const wea = tag + '_weather' + s1 + '.wea';
    const smx = tag + '_sky' + s1 + '.smx';
    const smxd = tag + '_skyd' + s1 + '.smx';
    const smxs = tag + '_sunM' + mf + s1 + '.smx';
    const room = tag + '_room' + s1 + '.oct';
    const final = tag + '_annual' + s2 + '.ill';
    s.info.push('Window groups: ' + c.apertures.map((a) => a.name + ' (' + a.bsdf + ')').join(', '));
    if (direct) s.info.push('Black scene: ' + (c.black.prebuilt ? c.black.oct : c.black.files.join(', ')));

    if (rx.write) s.blocks.push(rxBlock(rx));
    B.preBlocks(c.apertures).forEach((b) => s.blocks.push(b));
    const sky = ['epw2wea ' + q(c.weather.path) + ' ' + wea, 'gendaymtx -m ' + rx.mf + ' ' + wea + ' > ' + smx];
    if (direct) sky.push('gendaymtx -m ' + rx.mf + ' -d ' + wea + ' > ' + smxd, 'gendaymtx -5 0.533 -d -m ' + mf + ' ' + wea + ' > ' + smxs);
    s.blocks.push({ rem: 'Weather file and sky matrices', cmds: sky });
    s.blocks.push({ rem: 'Room octree' + (F ? ' with the exterior shading' : '') + ', without the glazing (the glazing is the aperture)', cmds: [octreeCmd(c.scene, room)] });

    const totals = [];
    const single = c.apertures.length === 1 && !direct;
    c.apertures.forEach((ap) => {
      const g = ap.name;
      const V = tag + '_V_' + g + s2 + '.mtx';
      let D = tag + '_D_' + g + s1 + '.dmx';
      const cmds = [join(['rfluxmtx', I, '-y', y, par, np, '-', q(ap.receiver), '-i', room, '<', pts, '>', V])];
      if (F) {
        const Fm = tag + '_F_' + g + s1 + '.fmx';
        const DF = tag + '_DF_' + g + s1 + '.dmx';
        D = tag + '_FD_' + g + s1 + '.dmx';
        cmds.push(join(['rfluxmtx', dpar, np, q(ap.receiver), q(ap.facade), '-i', room, '>', Fm]),
          join(['rfluxmtx', dpar, np, q(ap.facade), q(rx.file), '-i', room, '>', DF]),
          'dctimestep ' + Fm + ' ' + DF + ' > ' + D);
      } else {
        cmds.push(join(['rfluxmtx', dpar, np, q(ap.receiver), q(rx.file), '-i', room, '>', D]));
      }
      const out = single ? final : tag + '_' + g + s2 + '.ill';
      cmds.push('dctimestep ' + V + ' ' + q(ap.bsdf) + ' ' + D + ' ' + smx + ' | ' + conv + ' > ' + out);
      totals.push(out);
      s.blocks.push({ rem: 'Window group ' + g + ': view (V), ' + (F ? 'facade (F), ' : '') + 'daylight (D) and BSDF (T) matrices', cmds });
    });

    let directs = [];
    let cdsIll = null;
    if (direct) {
      const black = tag + '_black' + s1 + '.oct';
      s.blocks.push({ rem: 'Black room octree for the direct-only matrices', cmds: [octreeCmd(c.black, black)] });
      const parD = B.opts(withAb(c.params, 1), 'rfluxmtx');
      const fparD = B.opts(withAb(c.dparams, 1), 'rfluxmtx');
      const dparD = B.opts(withAb(c.dparams, 0), 'rfluxmtx');
      directs = c.apertures.map((ap) => {
        const g = ap.name;
        const Vd = tag + '_Vd_' + g + s2 + '.mtx';
        let Dd = tag + '_Dd_' + g + s1 + '.dmx';
        const cmds = [join(['rfluxmtx', I, '-y', y, parD, np, '-', q(ap.receiver), '-i', black, '<', pts, '>', Vd])];
        if (F) {
          const Fd = tag + '_Fd_' + g + s1 + '.fmx';
          const DFd = tag + '_DFd_' + g + s1 + '.dmx';
          Dd = tag + '_FDd_' + g + s1 + '.dmx';
          cmds.push(join(['rfluxmtx', fparD, np, q(ap.receiver), q(ap.facade), '-i', black, '>', Fd]),
            join(['rfluxmtx', dparD, np, q(ap.facade), q(rx.file), '-i', black, '>', DFd]),
            'dctimestep ' + Fd + ' ' + DFd + ' > ' + Dd);
        } else {
          cmds.push(join(['rfluxmtx', dparD, np, q(ap.receiver), q(rx.file), '-i', black, '>', Dd]));
        }
        const out = tag + '_direct_' + g + s2 + '.ill';
        cmds.push('dctimestep ' + Vd + ' ' + q(ap.bsdf) + ' ' + Dd + ' ' + smxd + ' | ' + conv + ' > ' + out);
        s.blocks.push({ rem: 'Window group ' + g + ': direct-only matrices (black room, -ab 1 and -ab 0, sun-only sky)', cmds });
        return out;
      });
      const suns = tag + '_suns' + s1 + '.rad';
      const coct = tag + '_cds' + s1 + '.oct';
      const cds = tag + '_cds' + s2 + '.mtx';
      cdsIll = tag + '_cds' + s2 + '.ill';
      const bsdfFiles = c.apertures.map((a) => q(a.bsdfRad)).join(' ');
      const blackFiles = c.black.prebuilt ? null : c.black.files.map((f) => q(f)).join(' ');
      s.blocks.push({ rem: 'Direct sun coefficients (' + (144 * mf * mf + 1) + ' suns) through the BSDF windows', cmds: B.sunLines(mf, c.sunCal, suns).concat([
        blackFiles ? join(['oconv -f', blackFiles, bsdfFiles, suns, '>', coct]) : join(['oconv -i', q(c.black.oct), bsdfFiles, suns, '>', coct]),
        join(['rcontrib', I, B.opts(c.sunParams, 'rcontrib'), '-y', y, np,
          '-fa -e MF:' + mf + ' -f reinhart.cal -b rbin -bn Nrbins -m solar', coct, '<', pts, '>', cds]),
        'dctimestep ' + cds + ' ' + smxs + ' | ' + conv + ' > ' + cdsIll]) });
    }
    if (direct) {
      s.blocks.push({ rem: 'Final result: ' + (F ? 'four' : 'three') + '-phase total minus direct-only plus direct sun', cmds: [
        'rmtxop ' + totals.join(' + ') + ' + ' + directs.map((f) => '-s -1 ' + f).join(' + ') + ' + ' + cdsIll + ' > ' + final] });
    } else if (!single) {
      s.blocks.push({ rem: 'Final result: sum of the window groups', cmds: ['rmtxop ' + totals.join(' + ') + ' > ' + final] });
    }
    s.outputs = [final];
    s.result = { type: 'annual', file: final, direct: cdsIll, quantity: qk, unit: Q.unit, grid: c.grid, weather: c.weather.path, method: c.method };
    return s;
  }

  // Direct annual: gendaylit and rtrace for every daylight hour of the weather
  // file. Each hour adds one row to the result (night hours add zeros), so the
  // file has the same layout as the matrix methods: one row per hour.
  function directAnnual(c) {
    const { s, qk, Q } = annualStart(c, 'Direct');
    const P = c.part;
    const pfx = 'VR_DIR' + P;
    const wea = 'dir_weather_' + P + '.wea';
    const hrs = 'dir_hours_' + P + '.txt';
    const zero = 'dir_zero_part' + P + '.txt';
    const scn = 'dir_scene_' + P + '.oct';
    const sky = 'dir_sky_' + P + '.rad';
    const hoct = 'dir_hour_' + P + '.oct';
    const out = 'dir_annual_part' + P + '.ill';
    const label = ':vr_dir_' + P + '_hour';
    const comps = Q.coef ? 1 : 3;
    const y = B.countToken(c.grid, s.setup);
    s.blocks.push({ rem: 'Weather file, its location and one line per hour (with a daylight flag)', cmds: [
      'epw2wea ' + q(c.weather.path) + ' ' + wea].concat(B.weaLocVars(wea, pfx), [
      'findstr /b /r "[0-9]" ' + wea + ' | rcalc -e "$1=$1;$2=$2;$3=$3;$4=$4;$5=$5;$6=if($4+$5-0.5,1,0)" > ' + hrs,
      B.countLines(pfx + '_H', hrs),
      'cnt ' + y + ' | rcalc -e "' + (comps === 1 ? '$1=0' : '$1=0;$2=0;$3=0') + '" | rcollate -h -fa' + comps + ' -oc ' + y + ' > ' + zero]) });
    s.blocks.push({ rem: 'Scene octree (the sky is added each hour with oconv -i)', cmds: [octreeCmd(c.scene, scn)] });
    s.blocks.push({ rem: 'Result header, then one run per hour', cmds: B.mtxHeader(out, '%' + pfx + '_H%', y, comps).concat([
      'for /f "tokens=1-6" %%a in (' + hrs + ') do call ' + label + ' %%a %%b %%c %%d %%e %%f']) });
    const dome = B.domeLines(sky);
    s.subs = [label,
      'if "%6"=="0" (type ' + zero + ' >> ' + out + ' & goto :eof)',
      'gendaylit %1 %2 %3 -a %' + pfx + '_LAT% -o %' + pfx + '_LON% -m %' + pfx + '_MER% -W %4 %5 > ' + sky]
      .concat(dome, ['oconv -i ' + scn + ' ' + sky + ' > ' + hoct,
        join(['rtrace', Q.irr ? '-I' : '', '-h', B.opts(c.params, 'rtrace'), Q.out || '', c.procs > 1 ? '-n ' + c.procs : '', hoct, '<', q(c.grid.path)]) +
          B.pipeConv(Q.coef) + ' | rcollate -h -fa' + comps + ' -oc ' + y + ' >> ' + out,
        'goto :eof']);
    s.outputs = [out];
    s.result = { type: 'annual', file: out, direct: null, quantity: qk, unit: Q.unit, grid: c.grid, weather: c.weather.path, method: 'direct' };
    return s;
  }

  /* == cumulative radiation == */

  // Average sky over the period (gendaymtx -A, solar radiance -O1) times the
  // daylight coefficients, then scaled by the number of hours.
  B.radiation = function (c) {
    const pre = c.prefix || 'rad';
    const v = 'VR_' + varName(pre) + '_H';
    const rx = c.receiver;
    const s = B.script({ name: 'Cumulative radiation' });
    s.title = 'Radiance cumulative radiation batch (' + c.unit + ')' + (c.params && c.params.label ? ', ' + c.params.label : '');
    s.info = ['Weather file: ' + c.weather.path].concat(sceneInfo(c.scene), ['Sensor points: ' + c.grid.path,
      'Period: ' + (c.period ? VR.kinds.period.text(c.period) : 'whole year')]);
    s.start = 'Cumulative radiation RUN';
    s.end = 'Done. Output: ' + c.out;
    const full = pre + '_full.wea';
    const wea = c.period ? pre + '.wea' : full;
    const smx = pre + '_avg.smx';
    const oct = pre + '_model.oct';
    const dc = pre + '_dc.mtx';
    const y = B.countToken(c.grid, s.setup);
    if (rx.write) s.blocks.push(rxBlock(rx));
    const cond = B.periodCond(c.period, '$1', '$2', '$3');
    s.blocks.push({ rem: 'Weather file' + (c.period ? ' for the period' : '') + ', average solar sky and hour count', cmds: ['epw2wea ' + q(c.weather.path) + ' ' + full]
      .concat(c.period ? B.weaFilter(full, wea, cond) : [], [
        'gendaymtx -m ' + rx.mf + ' -A -O1 ' + wea + ' > ' + smx,
        B.countLines(v, wea, 'findstr /b /r "[0-9]"')]) });
    const scale = c.unit === 'W/m2' ? '' : ' | rcalc -e "$1=$1*%' + v + '%' + (c.unit === 'kWh/m2' ? '/1000' : '') + '"';
    s.blocks.push({ rem: 'Daylight coefficients and ' + (c.unit === 'W/m2' ? 'average irradiance' : 'cumulative radiation') + ' in ' + c.unit, cmds: [
      octreeCmd(c.scene, oct),
      join(['rfluxmtx -I+ -y', y, B.opts(c.params, 'rfluxmtx'), c.procs > 1 ? '-n ' + c.procs : '', '-', q(rx.file), '-i', oct, '<', q(c.grid.path), '>', dc]),
      'dctimestep ' + dc + ' ' + smx + ' | rmtxop -fa -c 0.265 0.67 0.065 - | getinfo -' + scale + ' > ' + q(c.out)] });
    s.outputs = [c.out];
    s.result = { type: 'grid', file: c.out, quantity: 'radiation', unit: c.unit, grid: c.grid, columns: 1 };
    return s;
  };

  /* == direct sun hours == */

  // Suns from gendaymtx -D for every time step with the sun up (above MinAlt),
  // rcontrib -V+ for their contributions at the sensors, and rcomb to count
  // the visible ones. Without weather, time steps are generated with sun.cal.
  B.sunHours = function (c) {
    const pre = c.prefix || 'sh';
    const pfx = 'VR_' + varName(pre);
    const s = B.script({ name: 'Direct sun hours' });
    const stepH = c.step / 60;
    s.title = 'Radiance direct sun hours batch' + (c.check === 'en17037' ? ', EN 17037 sunlight exposure' : '');
    s.info = sceneInfo(c.scene).concat(['Sensor points: ' + c.grid.path,
      'Period: ' + (c.period ? VR.kinds.period.text(c.period) : 'whole year') + ', time step ' + c.step + ' min',
      c.weather ? 'Sun hours with direct normal irradiance of at least 120 W/m2 (weather file)' : 'Potential sun hours (clear sky geometry)']);
    if (c.minAlt > 0) s.info.push('Suns lower than ' + c.minAlt + ' degrees are ignored');
    s.start = 'Direct sun hours RUN';
    s.end = 'Done. Output: ' + c.out;
    const full = pre + '_full.wea';
    const wea = pre + '.wea';
    const suns = pre + '_suns.rad';
    const mods = pre + '_suns.mod';
    const oct = pre + '_model.oct';
    const vis = pre + '_vis.mtx';
    const ones = pre + '_ones.mtx';
    const y = B.countToken(c.grid, s.setup);
    const minAlt = c.minAlt > 0 ? '-' + U.fmt(c.minAlt) : '';
    const cmds = [];
    const loc = c.epw ? null : c.loc;
    if (c.epw) cmds.push('epw2wea ' + q(c.epw) + ' ' + full);
    if (!loc) cmds.push.apply(cmds, B.weaLocVars(full, pfx));
    const site = '-f sun.cal ' + AND + ' -e "' + B.sunCalSite(loc, pfx) + '"';
    if (c.weather) {
      const p = B.periodCond(c.period, '$1', '$2', '$3');
      const cond = 'and(' + (p ? 'and(' + p + ',$4-119.5)' : '$4-119.5') + ',SALT' + minAlt + ')';
      cmds.push.apply(cmds, B.weaFilter(full, wea, cond, '$1=$1;$2=$2;$3=$3;$4=15;$5=10', site + ' -e "MONTH=$1;DAY=$2;TIME=$3"'));
    } else {
      if (loc) cmds.push.apply(cmds, B.weaHeaderLines(loc, wea));
      else cmds.push('findstr /b /v /r "[0-9]" ' + full + ' > ' + wea);
      const k = Math.round(1440 / c.step);
      const p = B.periodCond(c.period, 'MONTH', 'DAY', 'TIME');
      cmds.push(join(['cnt 365', k, '| rcalc', site,
        '-e "jd=$1+1;MONTH=' + B.monthExpr('jd') + ';DAY=jd-select(MONTH,' + B.CUM.join(',') + ');TIME=($2+0.5)*' + U.fmt(stepH) + '"',
        '-e "cond=' + (p ? 'and(' + p + ',SALT' + minAlt + ')' : 'SALT' + minAlt) + '"',
        '-e "$1=MONTH;$2=DAY;$3=TIME;$4=15;$5=10"', '>>', wea]));
    }
    s.blocks.push({ rem: (c.weather ? 'Weather file' : 'Time steps every ' + c.step + ' min') + ' with the sun up' + (c.period ? ' in the period' : ''), cmds });
    const sceneSuns = c.scene.prebuilt ? join(['oconv -i', q(c.scene.oct), suns, '>', oct])
      : join(['oconv', c.scene.files.map((f) => q(f)).join(' '), suns, '>', oct]);
    s.blocks.push({ rem: 'One light source per time step (gendaymtx -D), the octree with them, and a vector of ' + U.fmt(stepH) + ' h per sun', cmds: [
      'gendaymtx -n -D ' + suns + ' -M ' + mods + ' ' + wea, sceneSuns, B.countLines(pfx + '_NSUN', mods)]
      .concat(B.mtxHeader(ones, '%' + pfx + '_NSUN%', 1, 1), ['cnt %' + pfx + '_NSUN% | rcalc -e "$1=' + U.fmt(stepH) + '" >> ' + ones]) });
    s.blocks.push({ rem: 'Sun visibility at the sensors, then hours per sensor', cmds: [
      join(['rcontrib -I+ -V+ -ab 0 -dc 1 -dt 0 -dj 0 -faa -y', y, c.procs > 1 ? '-n ' + c.procs : '', '-M', mods, oct, '<', q(c.grid.path), '>', vis]),
      'rcomb -c 1 0 0 -e "co=if(ci(1),1,0)" ' + vis + ' -m ' + ones + ' -fa | getinfo - > ' + q(c.out)] });
    if (c.check === 'en17037') {
      const lv = pre + '_en17037.txt';
      const sum = pre + '_en17037_summary.txt';
      const t = (f) => pre + '_' + f + '.tmp';
      s.blocks.push({ rem: 'EN 17037 sunlight exposure: 1.5 h minimum, 3 h medium, 4 h high (column 2: 0 none, 1, 2, 3)', cmds: [
        'rcalc -e "$1=$1;$2=if($1-3.99999,3,if($1-2.99999,2,if($1-1.49999,1,0)))" ' + q(c.out) + ' > ' + lv,
        'rcalc -e "$1=if($2-0.5,1,0)" ' + lv + ' | total > ' + t('min'), B.setFrom(pfx + '_MIN', t('min')),
        'rcalc -e "$1=if($2-1.5,1,0)" ' + lv + ' | total > ' + t('med'), B.setFrom(pfx + '_MED', t('med')),
        'rcalc -e "$1=if($2-2.5,1,0)" ' + lv + ' | total > ' + t('high'), B.setFrom(pfx + '_HIGH', t('high')),
        'total -u ' + q(c.out) + ' > ' + t('max'), B.setFrom(pfx + '_MAX', t('max')),
        B.echoTo(sum, 'EN 17037 sunlight exposure, ' + (c.period ? VR.kinds.period.text(c.period) : 'whole year'), true),
        B.echoTo(sum, 'Sensors: ' + B.vars(y) + ', longest sunlight duration {{' + pfx + '_MAX}} h'),
        B.echoTo(sum, 'Minimum level (1.5 h): {{' + pfx + '_MIN}} sensors'),
        B.echoTo(sum, 'Medium level (3 h): {{' + pfx + '_MED}} sensors'),
        B.echoTo(sum, 'High level (4 h): {{' + pfx + '_HIGH}} sensors'),
        'type ' + sum, 'del ' + pre + '_*.tmp'] });
    }
    s.outputs = [c.out];
    s.result = { type: 'grid', file: c.out, quantity: 'sun hours', unit: 'h', grid: c.grid, columns: 1 };
    return s;
  };

  /* == annual glare (dcglare) == */

  B.annualGlare = function (c) {
    const pre = c.prefix || 'glare';
    const rx = c.receiver;
    const s = B.script({ name: 'Annual glare' });
    s.title = 'Radiance annual glare batch (dcglare)' + (c.limit > 0 ? ', glare autonomy below DGP ' + c.limit : '');
    s.info = ['Weather file: ' + c.weather.path].concat(sceneInfo(c.scene), ['Views: ' + c.views.path + ' (x y z dx dy dz per line)']);
    s.start = 'Annual glare RUN';
    s.end = 'Done annual glare';
    const wea = pre + '.wea';
    const smx = pre + '.smx';
    const oct = pre + '_model.oct';
    const dc1 = pre + '_dc_direct.mtx';
    const dct = pre + '_dc_total.mtx';
    const y = B.countToken(c.views, s.setup);
    const np = c.procs > 1 ? '-n ' + c.procs : '';
    const vopt = join(['-vf', q(c.views.path), c.up ? '-vu ' + c.up.map(U.fmt).join(' ') : '', c.threshold ? '-b ' + U.fmt(c.threshold) : '']);
    if (rx.write) s.blocks.push(rxBlock(rx));
    s.blocks.push({ rem: 'Weather file and sky matrix', cmds: ['epw2wea ' + q(c.weather.path) + ' ' + wea, 'gendaymtx -m ' + rx.mf + ' ' + wea + ' > ' + smx] });
    s.blocks.push({ rem: 'Daylight coefficients at the eye: direct view of the sky (-ab 1) and total', cmds: [octreeCmd(c.scene, oct),
      join(['rfluxmtx -I+ -y', y, B.opts(c.directParams, 'rfluxmtx'), np, '-', q(rx.file), '-i', oct, '<', q(c.views.path), '>', dc1]),
      join(['rfluxmtx -I+ -y', y, B.opts(c.params, 'rfluxmtx'), np, '-', q(rx.file), '-i', oct, '<', q(c.views.path), '>', dct])] });
    const outs = [];
    if (c.hourly) {
      const dgp = pre + '_dgp.txt';
      outs.push(dgp);
      s.blocks.push({ rem: 'Hourly daylight glare probability (one row per view, one column per hour)', cmds: [
        join(['dcglare', vopt, dc1, dct, smx, '>', dgp])] });
    }
    if (c.limit > 0) {
      const ga = pre + '_ga.txt';
      outs.push(ga);
      const sched = B.scheduleCsv(c.schedule, pre + '_occ.csv');
      s.blocks.push({ rem: 'Glare autonomy: share of occupied hours with DGP below ' + c.limit, cmds: sched.concat([
        join(['dcglare', vopt, '-sf', pre + '_occ.csv', '-l', U.fmt(c.limit), dc1, dct, smx, '>', ga]),
        'getinfo - < ' + ga] ) });
    }
    s.outputs = outs;
    s.result = { type: 'glare', files: outs, grid: c.views };
    return s;
  };

  /* == schedules (occupancy) == */

  // One value per line (8760 lines): occupied 1, unoccupied 0.
  B.scheduleCsv = function (sc, file) {
    if (sc && sc.file) {
      return ['findstr /v /b "#" ' + q(sc.file) + ' | rcalc -t, -e "$1=if(in(in(0)),1,0)" > ' + q(file)];
    }
    const a = sc ? sc.start : 8;
    const b = sc ? sc.end : 18;
    return ['cnt 8760 | rcalc -e "h=$1-floor($1/24)*24" -e "$1=' + (a <= b
      ? 'if(h-' + (a - 0.5) + ',if(' + (b - 0.5) + '-h,1,0),0)'
      : 'if(h-' + (a - 0.5) + ',1,if(' + (b - 0.5) + '-h,1,0))') + '" > ' + q(file)];
  };

  /* == annual images (image-based two-phase) == */

  B.annualImages = function (c) {
    const pre = c.prefix || 'aimg';
    const pfx = 'VR_' + varName(pre);
    const rx = c.receiver;
    const s = B.script({ name: 'Annual images' });
    const view = B.viewText(c.view);
    s.title = 'Radiance annual images batch (image-based daylight coefficients), ' + c.hours.length + ' hours';
    s.info = ['Weather file: ' + c.weather.path].concat(sceneInfo(c.scene), ['View: ' + view,
      'Hours: ' + c.hours.slice(0, 12).join(', ') + (c.hours.length > 12 ? ' ...' : '')]);
    s.start = 'Annual images RUN';
    s.end = 'Done. Images in ' + pre + '_img';
    const full = pre + '_full.wea';
    const wea = pre + '.wea';
    const smx = pre + '.smx';
    const oct = pre + '_model.oct';
    const dcdir = pre + '_dc';
    const imgdir = pre + '_img';
    const res = c.res;
    const map = pre + '_hours.txt';
    if (rx.write) s.blocks.push(rxBlock(rx));
    s.blocks.push({ rem: 'Weather file for the chosen hours and their sky matrix', cmds: ['epw2wea ' + q(c.weather.path) + ' ' + full]
      .concat(B.weaFilter(full, wea, B.hoursCond(c.hours, 'recno-1')), ['gendaymtx -m ' + rx.mf + ' ' + wea + ' > ' + smx]) });
    const mapLines = [B.echoTo(map, 'Image number and hour of the year', true)].concat(c.hours.map((h, i) => {
      const d = B.hourDate(h);
      return B.echoTo(map, String(i).padStart(4, '0') + ' hour ' + h + ' (' + d.month + '/' + d.day + ' ' + U.fmt(d.hour) + ' h)');
    }));
    s.blocks.push({ rem: 'Image name to hour list', cmds: mapLines });
    s.blocks.push({ rem: 'One daylight coefficient image per sky patch (' + (144 * rx.mf * rx.mf + 1) + ' images)', cmds: [
      octreeCmd(c.scene, oct),
      'if not exist ' + dcdir + ' mkdir ' + dcdir,
      'if not exist ' + imgdir + ' mkdir ' + imgdir,
      'for /f "delims=" %%A in (\'vwrays -d -x ' + res + ' -y ' + res + ' ' + view + '\') do set "' + pfx + '_DIM=%%A"',
      join(['vwrays -fa -x', res, '-y', res, '-pj 0.7 -c', c.samples, view, '| rfluxmtx -fac %' + pfx + '_DIM% -c', c.samples,
        B.opts(c.params, 'rfluxmtx'), c.procs > 1 ? '-n ' + c.procs : '', '-o', dcdir + '\\%%03d.hdr', '-', q(rx.file), '-i', oct])] });
    s.blocks.push({ rem: 'Combine with the sky matrix: one image per hour', cmds: [
      'dctimestep -o ' + imgdir + '\\' + pre + '_%%04d.hdr ' + dcdir + '\\%%03d.hdr ' + smx] });
    s.outputs = [imgdir + '\\' + pre + '_*.hdr'];
    s.result = { type: 'image', pattern: imgdir + '\\' + pre + '_*.hdr', quantity: 'luminance', unit: 'cd/m2', view, fisheye: c.view.type === 'h' || c.view.type === 'a', images: c.hours.length };
    return s;
  };

  /* == animation (rpict -S with a list of views) == */

  const lerp = (a, b, t) => a + (b - a) * t;
  B.viewPath = function (views, frames) {
    if (views.length === 1) return [B.viewText(views[0])];
    const out = [];
    for (let i = 0; i < frames; i += 1) {
      const u = frames === 1 ? 0 : (i / (frames - 1)) * (views.length - 1);
      const k = Math.min(views.length - 2, Math.floor(u));
      const t = u - k;
      const a = views[k];
      const b = views[k + 1];
      const v = { type: a.type, vp: a.vp.map((x, j) => lerp(x, b.vp[j], t)), vd: a.vd.map((x, j) => lerp(x, b.vd[j], t)),
        vu: a.vu.map((x, j) => lerp(x, b.vu[j], t)), vh: lerp(a.vh, b.vh, t), vv: lerp(a.vv, b.vv, t) };
      out.push(B.viewText(v));
    }
    return out;
  };

  B.animation = function (c) {
    const pre = c.prefix || 'frame';
    const dir = c.dir || 'frames';
    const s = B.script({ name: 'Animation' });
    const lines = B.viewPath(c.views, c.frames);
    s.title = 'Radiance animation batch, ' + lines.length + ' frames';
    const sky = B.skyOf(c.sky);
    const lights = c.lights || [];
    s.info = sceneInfo(c.scene).concat(sky ? ['Sky file: "' + sky.file + '"'] : [], ['Frames: ' + lines.length + ' views from ' + c.views.length + ' key views']);
    s.start = 'Animation RUN (' + lines.length + ' frames)';
    s.end = 'Done. Frames in ' + dir;
    const vf = pre + '_views.vf';
    const oct = pre + '_model.oct';
    const amb = c.amb || (pre + '.amb');
    const img = c.image;
    const d = Math.max(1, Math.round(img.down || 1));
    (c.pre || []).forEach((b) => s.blocks.push(b));
    if (sky && sky.cmds.length) s.blocks.push(B.skyBlock(sky, 'Sky'));
    const o = B.octree(c.scene, (sky ? [sky.file] : []).concat(lights), oct, c.scene.freeze);
    if (o.cmds.length) s.blocks.push({ rem: 'Octree', cmds: o.cmds });
    s.blocks.push({ rem: 'One view per frame (rpict -S reads lines that start with a program name)', cmds: lines.map((l, i) => B.echoTo(vf, 'rpict ' + l, i === 0)) });
    const pm = c.params && c.params.pmap;
    if (pm) s.blocks.push(B.pmapBlock(pm, o.oct, 0));
    s.blocks.push({ rem: 'Render every frame (rpict -S), sharing one ambient cache', cmds: [
      'if not exist ' + dir + ' mkdir ' + dir,
      join(['rpict -S 1 -o', dir + '\\' + pre + '_%%04d.unf', img.report > 0 ? '-t ' + img.report : '', '-x', img.x, '-y', img.y,
        '-af', q(amb), B.opts(c.params, 'rpict'), B.pmapOpts(pm), q(o.oct), '<', vf])] });
    s.blocks.push({ rem: 'Filter each frame' + (d > 1 ? ' to 1/' + d + ' size' : '') + ' with a fixed exposure, then remove the raw frames', cmds: [
      'for %%F in (' + dir + '\\' + pre + '_*.unf) do (pfilt -1 ' + (d > 1 ? '-r 0.6 -x /' + d + ' -y /' + d + ' ' : '') + '"%%F" > "' + dir + '\\%%~nF.hdr")',
      'del ' + dir + '\\' + pre + '_*.unf'] });
    s.outputs = [dir + '\\' + pre + '_*.hdr'];
    s.result = { type: 'image', pattern: dir + '\\' + pre + '_*.hdr', quantity: 'luminance', unit: 'cd/m2', images: lines.length };
    return s;
  };

  /* == lighting scenes (one run per luminaire group, combined with dimming levels) == */

  B.lightScenes = function (c) {
    const pre = c.prefix || 'scene';
    const Q = B.QTY[c.quantity || 'illuminance'];
    const s = B.script({ name: 'Lighting scenes' });
    s.title = 'Radiance lighting scenes batch, ' + c.groups.length + ' luminaire groups, ' + c.scenes.length + ' scenes';
    s.info = sceneInfo(c.scene).concat(['Sensor points: ' + c.grid.path],
      c.groups.map((g, i) => 'Group ' + (i + 1) + ': ' + g.files.join(', ')),
      c.scenes.map((sc) => 'Scene ' + sc.name + ': ' + sc.levels.map(U.fmt).join(' ')));
    s.start = 'Lighting scenes RUN';
    s.end = 'Done lighting scenes';
    B.preBlocks(c.groups).forEach((b) => s.blocks.push(b));
    const files = c.groups.map((g, i) => {
      const oct = pre + '_g' + (i + 1) + '.oct';
      const out = pre + '_g' + (i + 1) + '.txt';
      const o = B.octree(c.scene, g.files, oct, false);
      s.blocks.push({ rem: 'Group ' + (i + 1) + ' at full output', cmds: o.cmds.concat([
        join(['rtrace', Q.irr ? '-I' : '', '-h', B.opts(c.params, 'rtrace'), c.procs > 1 ? '-n ' + c.procs : '', q(o.oct), '<', q(c.grid.path), '>', out])]) });
      return out;
    });
    const w = Q.coef || [1, 1, 1].map((x) => x / 3);
    const outs = c.scenes.map((sc) => {
      const terms = [];
      sc.levels.forEach((lv, g) => {
        if (!lv) return;
        const b = 3 * g;
        terms.push(U.fmt(lv) + '*(' + w.map((k, j) => U.fmt(k) + '*$' + (b + j + 1)).join('+') + ')');
      });
      const out = pre + '_' + sc.name + '.txt';
      s.blocks.push({ rem: 'Scene ' + sc.name + ' (' + sc.levels.map(U.fmt).join(' ') + ')', cmds: [
        'rlam ' + files.join(' ') + ' | rcalc -e "$1=' + (terms.join('+') || '0') + '" > ' + q(out)] });
      return out;
    });
    s.outputs = outs;
    s.result = { type: 'grid', files: outs, file: outs[0], quantity: c.quantity || 'illuminance', unit: Q.unit, grid: c.grid, columns: 1 };
    return s;
  };

  /* == LEED v4.1 EQ Daylight option 2 (illuminance at 9 am and 3 pm) == */

  B.leedIlluminance = function (c) {
    const pre = c.prefix || 'leed';
    const pfx = 'VR_' + varName(pre);
    const s = B.script({ name: 'LEED v4.1 daylight option 2' });
    s.title = 'Radiance LEED v4.1 EQ Daylight option 2 batch (illuminance at 9 am and 3 pm)';
    s.info = sceneInfo(c.scene).concat(['Sensor points: ' + c.grid.path, 'Date: ' + c.month + '/' + c.day + ', clear sky with sun',
      c.glareControl ? 'Pass: at least 300 lux at both times (automatic glare control)' : 'Pass: 300 to 3000 lux at both times']);
    s.start = 'LEED option 2 RUN';
    s.end = 'Done LEED option 2';
    const runs = [9, 15].map((h, i) => {
      const sky = c.skies[i] || B.gensky({ month: c.month, day: c.day, hour: h, type: '+s', loc: c.loc, file: pre + '_sky_' + h + '.rad' });
      const oct = pre + '_' + h + '.oct';
      const out = pre + '_' + (h === 9 ? '9am' : '3pm') + '.txt';
      const o = B.octree(c.scene, [sky.file], oct, false);
      s.blocks.push(B.skyBlock(sky, 'Clear sky at ' + (h === 9 ? '9 am' : '3 pm')));
      s.blocks.push({ rem: 'Illuminance at ' + (h === 9 ? '9 am' : '3 pm'), cmds: o.cmds.concat([
        join(['rtrace -I -h', B.opts(c.params, 'rtrace'), c.procs > 1 ? '-n ' + c.procs : '', q(o.oct), '<', q(c.grid.path)]) +
          B.pipeConv(B.LUX) + ' > ' + out]) });
      return out;
    });
    const ok = (v) => (c.glareControl ? v + '-299.999' : 'and(' + v + '-299.999,3000.001-' + v + ')');
    const sum = pre + '_summary.txt';
    const t = pre + '_pass.tmp';
    const tp = pre + '_points.tmp';
    s.blocks.push({ rem: 'Share of sensors that pass at both times, and points (55% 1, 75% 2, 90% 3)', cmds: [
      'rlam ' + runs.join(' ') + ' | rcalc ' + AND + ' -e "$1=if(and(' + ok('$1') + ',' + ok('$2') + '),1,0)" > ' + pre + '_pass.txt',
      'total -m ' + pre + '_pass.txt | rcalc -e "$1=$1*100" > ' + t, B.setFrom(pfx + '_PASS', t),
      'rcalc -n -e "p=%' + pfx + '_PASS%" -e "$1=if(p-89.9999,3,if(p-74.9999,2,if(p-54.9999,1,0)))" > ' + tp, B.setFrom(pfx + '_PTS', tp),
      B.echoTo(sum, 'LEED v4.1 EQ Daylight option 2, ' + c.month + '/' + c.day + ' at 9 am and 3 pm', true),
      B.echoTo(sum, 'Sensors passing at both times: {{' + pfx + '_PASS}} percent'),
      B.echoTo(sum, 'Points (new construction table): {{' + pfx + '_PTS}}'),
      'type ' + sum, 'del ' + t + ' ' + tp] });
    s.outputs = runs.concat([pre + '_pass.txt', sum]);
    s.result = { type: 'grid', file: pre + '_pass.txt', quantity: 'pass', unit: '', grid: c.grid, columns: 1 };
    return s;
  };
})(typeof window !== 'undefined' ? window.VR : globalThis.VR);
