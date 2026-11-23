/* Visual Radiance: workflow components. Each one turns its inputs into a script
   (the commands of one Radiance workflow) for the Batch Writer. */
(function (VR) {
  'use strict';
  const T = VR.types;
  const R = VR.rad;
  const B = VR.build;
  const C = VR.coerce;
  const hint = VR.hint;

  const W = (spec) => VR.defineComponent(Object.assign({ tab: 'Workflows' }, spec));
  const medium = () => ({ kind: 'params', values: Object.assign({}, R.PRESETS.medium.values), raw: '', label: 'Medium', preset: 'medium' });

  function sceneIn(ctx, i) {
    const s = C.scene(ctx.list(i));
    if (!s) ctx.fail(ctx.spec.inputs[i].name + ' needs a Scene component or a panel of file names');
    return s;
  }
  function gridIn(ctx, i) {
    const g = C.grid(ctx.raw(i));
    if (!g) ctx.fail('Grid needs a Sensor Grid component or a points file name');
    return g;
  }
  function paramsIn(ctx, i, fallback) {
    if (!ctx.has(i)) return fallback;
    const p = C.params(ctx.raw(i));
    if (!p) ctx.fail(ctx.spec.inputs[i].name + ' needs a Radiance Parameters component or an option string');
    return p;
  }
  function skyIn(ctx, i) {
    if (!ctx.has(i)) return null;
    const s = C.sky(ctx.raw(i));
    if (!s) ctx.fail('Sky needs a sky component or a sky file name');
    return s;
  }
  function posInt(ctx, i, label, min) {
    if (!ctx.has(i) && ctx.def(i) === undefined) return 0;
    const n = ctx.int(i);
    if (n < (min === undefined ? 1 : min)) ctx.fail(label + ' must be ' + (min === undefined ? 1 : min) + ' or more');
    return n;
  }
  const scriptOut = [
    { name: 'Script', nick: 'Scr', desc: 'Workflow script; connect it to a Batch Writer' },
    { name: 'Result', nick: 'Res', desc: 'Name of the result file' }
  ];
  const result = (s) => [s, s.outputs.length === 1 ? s.outputs[0] : s.outputs];
  const missing = (ctx, i) => ctx.fail('Input parameter ' + ctx.spec.inputs[i].name + ' failed to collect data', 'warning');
  function qtyIn(ctx, i, fallback, allowed) {
    const k = B.qtyKey(ctx.raw(i), fallback);
    if (!k || (allowed && allowed.indexOf(k) < 0)) {
      ctx.fail('Quantity must be one of: ' + (allowed || Object.keys(B.QTY)).map((x) => B.QTY[x].label.toLowerCase()).join(', '));
    }
    return k;
  }
  const inQty = (def, keys, index, desc) => ({ name: 'Quantity', nick: 'Qty', def, desc, hint: hint.list(B.qtyItems(keys), index) });
  function apertureList(ctx, i) {
    const items = ctx.list(i);
    if (items.some((a) => !(a && a.kind === 'aperture'))) ctx.fail('Window groups needs Window Group components');
    const names = new Set();
    items.forEach((a) => { if (names.has(a.name)) ctx.fail('Two window groups are named ' + a.name + '; give each a unique name'); names.add(a.name); });
    return items;
  }
  function weatherIn(ctx, i) {
    const w = C.weather(ctx.raw(i));
    if (!w) ctx.fail('Weather needs a Weather File component or an EPW file name');
    return w;
  }
  function receiverIn(ctx, i) {
    if (!ctx.has(i)) return { kind: 'receiver', file: 'skyglow.rad', mf: 1, write: true, up: '+Y' };
    const r = C.receiver(ctx.raw(i));
    if (!r) ctx.fail('Receiver needs a Sky Receiver component or a file name');
    if (typeof ctx.raw(i) === 'string') ctx.remark('A receiver given by name is assumed to be Tregenza (MF 1)');
    return r;
  }
  function periodIn(ctx, i) {
    if (!ctx.has(i)) return null;
    const p = C.period(ctx.raw(i));
    if (!p) ctx.fail('Period needs an Analysis Period component');
    return p;
  }
  const PARAMS = (values, raw) => ({ kind: 'params', values, raw: raw || '', label: '', preset: 'none' });
  const stem = (f) => (VR.util.basename(f).replace(/\.\w+$/, '').replace(/[^\w-]/g, '_') || 'out');

  const inScene = { name: 'Scene', nick: 'Scene', access: 'list', optional: false, desc: 'Scene component, or a panel listing the scene files.' };
  const inGrid = { name: 'Grid', nick: 'Grid', optional: false, desc: 'Sensor Grid component, or a points file name.' };
  const inParams = { name: 'Parameters', nick: 'Par', desc: 'Radiance Parameters. Medium preset when nothing is connected.' };
  const inProcs = { name: 'Processes', nick: 'Proc', desc: 'Parallel processes (-n), optional.', hint: hint.int(1, 32, 4) };
  const inAmb = { name: 'Ambient file', nick: 'Amb', desc: 'Ambient cache file (-af), optional.', hint: hint.panel('amb.cache') };

  /* == annual illuminance == */

  const ANNUAL_QTY = ['illuminance', 'irradiance', 'luminance', 'radiance', 'melanopic', 'rgb'];
  const METHOD_ITEMS = ['dds', 'two', 'three', 'four', 'five', 'six', 'direct'].map((k) => ({ label: B.METHODS[k].label, value: k }));
  W({
    type: 'Rad.Annual', name: 'Annual Illuminance', nick: 'Annual', group: 'Daylight', icon: 'annual',
    desc: 'Hourly results for a year with the method you pick: two-phase DDS (default: daylight coefficients plus accurate direct sun), two-phase, three-, four-, five- or six-phase with window groups and BSDFs, or direct (rtrace each hour). Results have one row per hour and one column per sensor.',
    keywords: 'annual illuminance daylight coefficients dds two phase three phase five phase six phase four phase bsdf rfluxmtx gendaymtx dctimestep climate based method',
    help: 'DDS, five- and six-phase need the black scene (same geometry, black materials; for five- and six-phase include the exterior shading with its real materials). Three- to six-phase need Window Group components, and the scene without the glazing. The sun list for the direct sun runs is made with cnt and rcalc for every Reinhart patch (144 x MF x MF + 1 suns).',
    inputs: [
      { name: 'Weather', nick: 'EPW', optional: false, desc: 'Weather File component, or an EPW file name.' },
      Object.assign({}, inScene, { desc: 'Scene with normal materials. For three- to six-phase, leave out the glazing.' }),
      { name: 'Black scene', nick: 'Black', access: 'list', desc: 'The same scene with black materials, for DDS, five- and six-phase.', hint: hint.panel('envelope.blk\nenvelope.rad') },
      { name: 'Receiver', nick: 'Rx', desc: 'Sky Receiver component, or a receiver file name. When empty, the batch file writes skyglow.rad (MF 1).' },
      inGrid,
      { name: 'Parameters', nick: 'Par', desc: 'Radiance Parameters for the daylight coefficient or view matrix runs. When empty: -ab 3 -ad 2048 -lw 0.0004.' },
      { name: 'Sun parameters', nick: 'SunPar', desc: 'Parameters for the direct sun run (rcontrib). When empty: -ab 0 -ad 64 -dc 1 -dt 0 -dj 0 (DDS) or -ab 1 -ad 256 -lw 0.001 (five- and six-phase).' },
      { name: 'Sun density', nick: 'SunMF', def: 6, desc: 'Reinhart subdivision for the suns and the sun-only sky matrix.', hint: hint.int(1, 6, 6) },
      { name: 'Part', nick: 'Part', def: 0, desc: 'Part number, for grids split into parts that run in parallel. Used in all file names.', hint: hint.int(0, 16, 0) },
      { name: 'Processes', nick: 'Proc', def: 4, desc: 'Parallel processes (-n).', hint: hint.int(1, 32, 4) },
      inQty('illuminance', ANNUAL_QTY, 0, 'Illuminance (lux) by default; also irradiance, luminance or radiance (sensor directions as view rays), melanopic EDI or raw RGB.'),
      { name: 'Method', nick: 'Method', def: 'dds', desc: 'dds, two, three, four, five, six or direct.', hint: hint.list(METHOD_ITEMS, 0) },
      { name: 'Window groups', nick: 'Ap', access: 'list', desc: 'Window Group components, for the three- to six-phase methods.' },
      { name: 'Daylight parameters', nick: 'DPar', desc: 'Parameters for the daylight (D) and facade (F) matrices. When empty: -ab 4 -ad 1000 -lw 0.001 -c 1000.' }
    ],
    outputs: scriptOut,
    menu: [{ label: 'Sun source file', key: 'sunCal', options: [
      { label: 'reinsrc.cal (Radiance 5.x installs)', value: 'reinsrc.cal' },
      { label: 'rskysrc.cal (newer Radiance)', value: 'rskysrc.cal' }] }],
    init: () => ({ sunCal: 'reinsrc.cal' }),
    solve(ctx) {
      const method = B.methodKey(ctx.str(11));
      if (!method) ctx.fail('Method must be dds, two, three, four, five, six or direct');
      const quantity = qtyIn(ctx, 10, 'illuminance', ANNUAL_QTY);
      const weather = weatherIn(ctx, 0);
      const scene = sceneIn(ctx, 1);
      const needBlack = ['dds', 'five', 'six'].indexOf(method) >= 0;
      if (needBlack && !ctx.has(2)) missing(ctx, 2);
      const black = needBlack ? sceneIn(ctx, 2) : null;
      if (!needBlack && ctx.has(2)) ctx.remark('The ' + B.METHODS[method].short + ' method does not use the black scene');
      const receiver = receiverIn(ctx, 3);
      const grid = gridIn(ctx, 4);
      const params = paramsIn(ctx, 5, PARAMS({ ab: 3, ad: 2048, lw: 0.0004 }));
      const lw = params.values.lw !== undefined ? params.values.lw : 0.001;
      const sunDefault = method === 'dds' ? { ab: 0, ad: 64, lw, dc: 1, dt: 0, dj: 0 } : { ab: 1, ad: 256, lw: 0.001, dc: 1, dt: 0, dj: 0 };
      const sunParams = paramsIn(ctx, 6, PARAMS(sunDefault));
      const sunMF = posInt(ctx, 7, 'Sun density');
      const part = posInt(ctx, 8, 'Part', 0);
      const procs = posInt(ctx, 9, 'Processes');
      const phases = ['three', 'four', 'five', 'six'].indexOf(method) >= 0;
      let apertures = [];
      if (phases) {
        if (!ctx.has(12)) missing(ctx, 12);
        apertures = apertureList(ctx, 12);
        if ((method === 'four' || method === 'six') && apertures.some((a) => !a.facade)) ctx.fail('Four- and six-phase need a facade aperture (F) in every window group');
      } else if (ctx.has(12)) ctx.remark('Window groups are used by the three- to six-phase methods only');
      const dparams = paramsIn(ctx, 13, PARAMS({ ab: 4, ad: 1000, lw: 0.001 }, '-c 1000'));
      const ad = params.values.ad;
      if (method !== 'direct' && ad > 0 && lw > 1 / ad) ctx.warn('-lw ' + lw + ' is above 1/-ad (' + (1 / ad).toPrecision(2) + '); rfluxmtx results may be noisy');
      if (method === 'dds' && sunParams.values.ab > 1) ctx.remark('Direct sun coefficients are usually computed with -ab 0');
      if (method === 'direct') ctx.remark('Direct runs gendaylit, oconv and rtrace for every daylight hour (about 4400 runs): accurate but slow');
      if (method === 'two') ctx.remark('Two-phase spreads the sun over sky patches; DDS or five-phase are more accurate for direct sun');
      if ((scene.prebuilt || (black && black.prebuilt)) && method !== 'direct') ctx.remark('Prebuilt octrees are copied, and the sun octree adds the suns with oconv -i');
      if (quantity === 'luminance' || quantity === 'radiance') ctx.remark('Luminance uses each sensor direction as a view ray (no -I+)');
      const s = B.annualMethod({ method, weather, scene, black, receiver, grid, params, sunParams, dparams, sunMF, part, procs,
        quantity, apertures, sunCal: ctx.state.sunCal });
      s.deps = [];
      return result(s);
    }
  });

  /* == point-in-time illuminance and electric lighting == */

  const PIT_QTY = ['rgb', 'illuminance', 'irradiance', 'luminance', 'radiance', 'df', 'skyview', 'melanopic'];
  const ELEC_QTY = ['rgb', 'illuminance', 'irradiance', 'luminance', 'radiance', 'melanopic'];
  function pitSolve(ctx, electric) {
    const scene = sceneIn(ctx, 0);
    const qk = qtyIn(ctx, 5, 'rgb', electric ? ELEC_QTY : PIT_QTY);
    const Q = B.QTY[qk];
    const sky = electric ? null : skyIn(ctx, 1);
    if (!electric && !sky && !Q.sky) missing(ctx, 1);
    if (!electric && sky && Q.sky) ctx.remark(Q.label + ' uses its own standard sky, so the connected sky is not used');
    const lights = electric ? C.lights(ctx.list(1)) : { files: [], pre: [], objects: [] };
    if (electric && !lights.files.length) ctx.fail('Connect the luminaire files');
    const grid = gridIn(ctx, 2);
    let params = paramsIn(ctx, 3, medium());
    if (qk === 'skyview') {
      params = Object.assign({}, params, { values: Object.assign({}, params.values, { ab: 1, aa: 0 }) });
      ctx.remark('Sky view uses -ab 1 and -aa 0, so only the directly visible sky counts');
    }
    const out = ctx.str(4) || 'raw.txt';
    const s = B.pit({ electric, scene, sky, lights: lights.files, grid, params, out, quantity: qk,
      procs: ctx.has(6) ? posInt(ctx, 6, 'Processes') : 0, amb: ctx.str(7) || '', pre: B.preBlocks([scene, lights.objects]) });
    if (!electric && params.values.ab === 0) ctx.remark('-ab 0 leaves out all interreflected daylight');
    if (qk === 'df') ctx.remark('Daylight factor in percent: illuminance under a CIE overcast sky of 10,000 lux, divided by 100');
    if (qk === 'melanopic') ctx.remark('Melanopic EDI needs Radiance 6 (rtrace -pM)');
    return result(s);
  }

  W({
    type: 'Rad.PIT', name: 'Point-in-Time Illuminance', nick: 'PIT', group: 'Daylight', icon: 'pit',
    desc: 'Values at sensor points under one sky with rtrace: raw RGB irradiance (as before), illuminance, irradiance, luminance or radiance, daylight factor (its own CIE overcast sky), sky view (a uniform sky, direct view only) or melanopic EDI.',
    keywords: 'point in time illuminance irradiance luminance daylight factor df sky view svf melanopic rtrace sensor grid daylight sky',
    inputs: [
      inScene,
      { name: 'Sky', nick: 'Sky', desc: 'Sky component (gensky, gendaylit) or a sky file name. Not needed for daylight factor and sky view.', hint: hint.panel('sky.rad') },
      inGrid, inParams,
      { name: 'Output', nick: 'Out', def: 'raw.txt', desc: 'Result file name.', hint: hint.panel('raw.txt') },
      inQty(undefined, PIT_QTY, 1, 'What to compute. RGB (raw) when nothing is connected; True and False from a toggle mean illuminance and raw.'),
      inProcs, inAmb
    ],
    outputs: scriptOut,
    solve: (ctx) => pitSolve(ctx, false)
  });

  W({
    type: 'Rad.Electric', name: 'Electric Illuminance', nick: 'Elec', group: 'Electric', icon: 'electric',
    desc: 'Values from luminaires only (no sky): oconv the scene with the luminaire files or IES Luminaire components, then rtrace at the sensor points.',
    keywords: 'electric lighting luminaires illuminance rtrace ies',
    inputs: [
      inScene,
      { name: 'Luminaires', nick: 'Lum', access: 'list', optional: false, desc: 'IES Luminaire components or luminaire files (for example from ies2rad), one per line.', hint: hint.panel('luminaires.rad') },
      inGrid, inParams,
      { name: 'Output', nick: 'Out', def: 'raw.txt', desc: 'Result file name.', hint: hint.panel('raw.txt') },
      inQty(undefined, ELEC_QTY, 1, 'What to compute. RGB (raw) when nothing is connected.'),
      inProcs, inAmb
    ],
    outputs: scriptOut,
    solve: (ctx) => pitSolve(ctx, true)
  });

  /* == point-in-time render == */

  const RENDER_QTY = ['luminance', 'illuminance', 'irradiance', 'df'];
  W({
    type: 'Rad.Render', name: 'Point-in-Time Render', nick: 'Render', group: 'Image', icon: 'render',
    desc: 'An image with rpict: octree with sky and luminaires, an optional low resolution warm-up that fills the ambient cache, the main render, then pcompos, pfilt and the view written into the HDR header. Luminance by default; illuminance, irradiance or daylight factor images use rpict -i. Layers adds rtpict image layers (depth, normals, material ids).',
    keywords: 'render image rpict hdr luminance illuminance daylight factor view fisheye picture layers rtpict depth normal',
    help: 'When Warm-up parameters are empty the warm-up uses the main parameters, like the overture pass of rad. The tag (often the hour of the year) is added to every file name. rtpict is a script that needs Perl on Windows.',
    inputs: [
      inScene,
      { name: 'Sky', nick: 'Sky', desc: 'Sky component or sky file name (optional for electric-only renders and daylight factor).', hint: hint.panel('sky.rad') },
      { name: 'Luminaires', nick: 'Lum', access: 'list', desc: 'IES Luminaire components or luminaire files (optional).', hint: hint.panel('luminaires.rad') },
      { name: 'View', nick: 'View', optional: false, desc: 'View component.' },
      { name: 'Image', nick: 'Img', desc: 'Image Settings component, or just a resolution. Default 1024 px with a 64 px warm-up and /2 downsampling.' },
      { name: 'Parameters', nick: 'Par', desc: 'Radiance Parameters for the main render. Medium preset when nothing is connected.' },
      { name: 'Warm-up parameters', nick: 'WarmPar', desc: 'Parameters for the warm-up pass (optional).' },
      { name: 'Tag', nick: 'Tag', desc: 'Added to file names, usually the hour of the year (for example 4118).', hint: hint.panel('4118') },
      { name: 'Ambient file', nick: 'Amb', desc: 'Ambient cache shared by both passes. Default render_<tag>.amb.', hint: hint.panel('IMG.amb') },
      inQty('luminance', RENDER_QTY, 0, 'Luminance by default; illuminance, irradiance or daylight factor images (rpict -i).'),
      { name: 'Layers', nick: 'Lay', desc: 'rtpict layer types, for example vlnm: v value, r reflected, x unreflected, l effective depth, L first surface depth, n normal, s surface id, m modifier id, M material id.', hint: hint.panel('vlnm') },
      { name: 'Processes', nick: 'Proc', desc: 'Processes for rtpict and mkpmap (-n), optional.', hint: hint.int(1, 32, 4) }
    ],
    outputs: scriptOut,
    solve(ctx) {
      const scene = sceneIn(ctx, 0);
      const quantity = qtyIn(ctx, 9, 'luminance', RENDER_QTY);
      const sky = skyIn(ctx, 1);
      const lights = C.lights(ctx.list(2));
      if (!sky && !lights.files.length && quantity !== 'df') ctx.warn('No sky and no luminaires: the image will be dark');
      if (sky && quantity === 'df') ctx.remark('Daylight factor uses its own CIE overcast sky, so the connected sky is not used');
      const view = C.view(ctx.raw(3));
      if (!view) ctx.fail('View needs a View component');
      let image = { kind: 'image', x: 1024, y: 1024, warm: 64, down: 2, report: 10 };
      if (ctx.has(4)) {
        image = C.image(ctx.raw(4));
        if (!image) ctx.fail('Image needs an Image Settings component or a resolution');
      }
      const params = paramsIn(ctx, 5, medium());
      const warmParams = paramsIn(ctx, 6, null);
      if (params.values.dj > 0 && params.values.ps > 1) ctx.remark('Radiance suggests -ps 1 when -dj is above 0');
      const layers = ctx.has(10) ? String(ctx.str(10)).replace(/[^vrxlLRXnNsmM]/g, '') : '';
      if (ctx.has(10) && !layers) ctx.fail('Layers takes letters from v r x l L R X n N s m M');
      const s = B.render({ scene, sky: quantity === 'df' ? null : sky, lights: lights.files, view, image, params, warmParams, tag: ctx.str(7) || '',
        amb: ctx.str(8) || '', quantity, layers, procs: ctx.has(11) ? posInt(ctx, 11, 'Processes') : 0, pre: B.preBlocks([scene, lights.objects]) });
      return result(s);
    }
  });

  /* == spectral == */

  const defSpectral = () => ({ kind: 'spectral', cs: 20, cw: [380, 780], mode: 'co' });
  function spectralIn(ctx, i) {
    if (!ctx.has(i)) return defSpectral();
    const sp = C.spectral(ctx.raw(i));
    if (!sp) ctx.fail('Spectral needs a Spectral Settings component');
    return sp;
  }

  W({
    type: 'Rad.SpecPIT', name: 'Spectral Point-in-Time', nick: 'SpecPIT', group: 'Spectral', icon: 'specpit',
    desc: 'Spectral irradiance at sensor points with rtrace -cs/-cw (Radiance 6). Use spectral materials and a spectral sky (for example from genssky), or an octree you already built.',
    keywords: 'spectral point in time rtrace hyperspectral melanopic',
    inputs: [
      inScene,
      { name: 'Sky', nick: 'Sky', desc: 'Spectral sky component or file name (optional when the scene or octree has it).', hint: hint.panel('spectralsky.rad') },
      inGrid, inParams,
      { name: 'Spectral', nick: 'Spec', desc: 'Spectral Settings. 20 bands, 380 to 780 nm, all bands written when nothing is connected.' },
      { name: 'Output', nick: 'Out', def: 'spectral.res', desc: 'Result file name.', hint: hint.panel('spectral.res') },
      inAmb,
      { name: 'Error log', nick: 'Log', desc: 'File for errors and progress (-e), optional.', hint: hint.panel('error.log') },
      inProcs
    ],
    outputs: scriptOut,
    solve(ctx) {
      const scene = sceneIn(ctx, 0);
      const sky = skyIn(ctx, 1);
      const s = B.spectralPit({ scene, sky, grid: gridIn(ctx, 2), params: paramsIn(ctx, 3, medium()), spectral: spectralIn(ctx, 4),
        out: ctx.str(5) || 'spectral.res', amb: ctx.str(6) || '', log: ctx.str(7) || '', procs: ctx.has(8) ? posInt(ctx, 8, 'Processes') : 0 });
      return result(s);
    }
  });

  W({
    type: 'Rad.SpecAnnual', name: 'Spectral Annual', nick: 'SpecAnn', group: 'Spectral', icon: 'specannual',
    desc: 'Spectral runs for a list of hours of the year. Each hour gets a genssky sky, an octree and a result file (prefix_HOUR.res). When the EPW was loaded in the Weather File component, each sky uses that hour\'s cloud cover and illuminance, and night hours are skipped.',
    keywords: 'spectral annual hours genssky rtrace melanopic circadian',
    inputs: [
      Object.assign({}, inScene, { desc: 'Spectral materials and geometry, without a sky.' }),
      { name: 'Weather', nick: 'EPW', optional: false, desc: 'Weather File component (double-click it to load the EPW for location and hourly data).' },
      { name: 'Location', nick: 'Loc', desc: 'Location, when the weather file was not loaded (optional).' },
      { name: 'Hours', nick: 'Hrs', access: 'list', optional: false, desc: 'Hours of the year from 0 to 8759, as numbers or text such as "4110-4120, 4500".', hint: hint.panel('4118') },
      inGrid, inParams,
      { name: 'Spectral', nick: 'Spec', desc: 'Spectral Settings. 20 bands, 380 to 780 nm when nothing is connected.' },
      { name: 'Prefix', nick: 'Pre', def: 'spec', desc: 'Prefix for sky, octree and result files.', hint: hint.panel('spec') },
      { name: 'Threads', nick: 'Thr', desc: 'genssky precomputation threads (-n), optional.', hint: hint.int(1, 16, 8) },
      inProcs
    ],
    outputs: [scriptOut[0], { name: 'Results', nick: 'Res', desc: 'Result file names' }],
    solve(ctx) {
      const scene = sceneIn(ctx, 0);
      const weather = C.weather(ctx.raw(1));
      if (!weather) ctx.fail('Weather needs a Weather File component');
      let loc = weather.location;
      if (ctx.has(2)) loc = C.location(ctx.raw(2));
      if (!loc) ctx.fail('No location: double-click the Weather File component to load the EPW, or connect a Location component');
      const parsed = B.parseHours(ctx.list(3).map(T.str));
      if (parsed.bad.length) ctx.warn('Ignored: ' + parsed.bad.slice(0, 6).join(', ') + (parsed.bad.length > 6 ? ' ...' : ''));
      if (!parsed.hours.length) ctx.fail('Hours needs at least one hour between 0 and 8759');
      if (!weather.hourly) ctx.remark('No hourly EPW data loaded, so every hour uses a clear sky');
      const pre = (ctx.str(7) || 'spec').replace(/[^\w.-]/g, '_');
      const s = B.spectralAnnual({ scene, loc, hours: parsed.hours, hourly: weather.hourly, grid: gridIn(ctx, 4),
        params: paramsIn(ctx, 5, medium()), spectral: spectralIn(ctx, 6), prefix: pre,
        threads: ctx.has(8) ? posInt(ctx, 8, 'Threads') : 0, procs: ctx.has(9) ? posInt(ctx, 9, 'Processes') : 0 });
      if (s.skipped.length) ctx.remark(s.skipped.length + ' night hours skipped');
      if (!s.outputs.length) ctx.fail('All hours are at night in this weather file', 'warning');
      return [s, s.outputs];
    }
  });

  /* == solar: cumulative radiation and direct sun hours == */

  W({
    type: 'Rad.Radiation', name: 'Cumulative Radiation', nick: 'Radiation', group: 'Solar', icon: 'radiation',
    desc: 'Solar radiation on sensor points over a period: an average solar sky from gendaymtx -A -O1, daylight coefficients from rfluxmtx, then the total in kWh/m2 (or Wh/m2, or the average irradiance in W/m2).',
    keywords: 'cumulative radiation solar irradiation kwh insolation gendaymtx average sky facade roof pv',
    inputs: [
      { name: 'Weather', nick: 'EPW', optional: false, desc: 'Weather File component, or an EPW file name.' },
      Object.assign({}, inScene, { desc: 'Scene files (with the surroundings).' }),
      { name: 'Receiver', nick: 'Rx', desc: 'Sky Receiver component. When empty, the batch file writes skyglow.rad (MF 1).' },
      Object.assign({}, inGrid, { desc: 'Sensor Grid component: points on the surfaces, directions along their normals.' }),
      { name: 'Parameters', nick: 'Par', desc: 'Radiance Parameters for rfluxmtx. When empty: -ab 2 -ad 2048 -lw 0.0005.' },
      { name: 'Period', nick: 'Per', desc: 'Analysis Period (whole year when empty).' },
      { name: 'Unit', nick: 'Unit', def: 'kWh/m2', desc: 'kWh/m2 or Wh/m2 for the total, W/m2 for the average irradiance.', hint: hint.list([{ label: 'kWh/m2 (total)', value: 'kWh/m2' }, { label: 'Wh/m2 (total)', value: 'Wh/m2' }, { label: 'W/m2 (average)', value: 'W/m2' }]) },
      { name: 'Output', nick: 'Out', def: 'radiation.txt', desc: 'Result file name.', hint: hint.panel('radiation.txt') },
      inProcs
    ],
    outputs: scriptOut,
    solve(ctx) {
      const unit = String(ctx.str(6) || 'kWh/m2').replace(/\s/g, '');
      const u = { 'kwh/m2': 'kWh/m2', 'wh/m2': 'Wh/m2', 'w/m2': 'W/m2' }[unit.toLowerCase()];
      if (!u) ctx.fail('Unit must be kWh/m2, Wh/m2 or W/m2');
      const s = B.radiation({ weather: weatherIn(ctx, 0), scene: sceneIn(ctx, 1), receiver: receiverIn(ctx, 2), grid: gridIn(ctx, 3),
        params: paramsIn(ctx, 4, PARAMS({ ab: 2, ad: 2048, lw: 0.0005 })), period: periodIn(ctx, 5), unit: u,
        out: ctx.str(7) || 'radiation.txt', procs: ctx.has(8) ? posInt(ctx, 8, 'Processes') : 0, prefix: stem(ctx.str(7) || 'radiation.txt') });
      return result(s);
    }
  });

  W({
    type: 'Rad.SunHours', name: 'Direct Sun Hours', nick: 'SunHrs', group: 'Solar', icon: 'sunhours',
    desc: 'Hours of direct sun at each sensor: one sun per time step with the sun up (gendaymtx -D), rcontrib for what each sensor sees, and rcomb to add up the hours. Potential sun from the site location, or only the hours with direct normal irradiance of 120 W/m2 or more. Optional EN 17037 sunlight exposure check.',
    keywords: 'direct sun hours sunlight exposure en 17037 shadow solar access rights to light sunpath',
    help: 'EN 17037 asks for 1.5 h (minimum), 3 h (medium) or 4 h (high) of possible sunlight on one day between 1 February and 21 March, at a point in the middle of the window on the inner surface, ignoring very low sun (set MinAlt for your latitude). Use a time step of 10 minutes or less for the check.',
    inputs: [
      { name: 'Site', nick: 'Site', optional: false, desc: 'Weather File (for its location, or its direct irradiance) or Location component.' },
      inScene, inGrid,
      { name: 'Period', nick: 'Per', desc: 'Analysis Period (whole year when empty).' },
      { name: 'Time step', nick: 'Step', def: 60, desc: 'Minutes between suns: 60, 30, 15, 10 or 5.', hint: hint.list([60, 30, 15, 10, 5].map((m) => ({ label: m + ' min', value: m }))) },
      { name: 'Minimum altitude', nick: 'MinAlt', def: 0, desc: 'Ignore suns lower than this, in degrees.', hint: hint.slider(0, 30, 1, 0) },
      { name: 'Weather', nick: 'Wx', def: false, desc: 'Count only hours with at least 120 W/m2 direct normal irradiance in the EPW (hourly).', hint: hint.toggle(true) },
      { name: 'Check', nick: 'Check', def: 'none', desc: 'none or en17037 (sunlight exposure levels).', hint: hint.list([{ label: 'Hours only', value: 'none' }, { label: 'EN 17037 sunlight exposure', value: 'en17037' }], 1) },
      { name: 'Output', nick: 'Out', def: 'sunhours.txt', desc: 'Result file name.', hint: hint.panel('sunhours.txt') },
      inProcs
    ],
    outputs: scriptOut,
    solve(ctx) {
      const site = ctx.raw(0);
      let epw = null;
      let loc = null;
      if (site && site.kind === 'location') loc = site;
      else {
        const w = C.weather(site);
        if (!w) ctx.fail('Site needs a Weather File or Location component');
        epw = w.path;
      }
      const wx = !!ctx.bool(6);
      if (wx && !epw) ctx.fail('Weather needs an EPW file in Site');
      const step = ctx.int(4);
      if ([60, 30, 20, 15, 12, 10, 6, 5, 4, 3, 2, 1].indexOf(step) < 0) ctx.fail('Time step must divide an hour: 60, 30, 15, 10, 5 or 1 minutes');
      if (wx && step !== 60) ctx.remark('Weather data is hourly, so the time step is 60 minutes');
      const check = String(ctx.str(7) || 'none').toLowerCase().replace(/[^a-z0-9]/g, '');
      if (['none', 'en17037'].indexOf(check) < 0) ctx.fail('Check must be none or en17037');
      const period = periodIn(ctx, 3);
      if (check === 'en17037') {
        const oneDay = period && period.sm === period.em && period.sd === period.ed;
        const doy = period ? B.CUM[period.sm - 1] + period.sd : 0;
        if (!oneDay || doy < 32 || doy > 80) ctx.remark('EN 17037 uses one day between 1 February and 21 March');
        if (step > 15) ctx.remark('Use a time step of 10 or 15 minutes for EN 17037 (1.5 h steps)');
        if (wx) ctx.warn('EN 17037 counts possible sunlight (cloudless), so turn Weather off');
      }
      const s = B.sunHours({ epw, loc, scene: sceneIn(ctx, 1), grid: gridIn(ctx, 2), period, step: wx ? 60 : step,
        minAlt: ctx.num(5), weather: wx, check, out: ctx.str(8) || 'sunhours.txt', procs: ctx.has(9) ? posInt(ctx, 9, 'Processes') : 0, prefix: stem(ctx.str(8) || 'sunhours.txt') });
      return result(s);
    }
  });

  /* == glare == */

  W({
    type: 'Rad.AnnualGlare', name: 'Annual Glare', nick: 'AGlare', group: 'Glare', icon: 'annualglare',
    desc: 'Daylight glare probability for every hour and glare autonomy with dcglare (imageless): daylight coefficients at each view for the direct view of the sky (-ab 1) and in total, then dcglare with the sky matrix and an occupancy schedule.',
    keywords: 'annual glare dcglare dgp glare autonomy imageless daylight glare probability',
    help: 'Views are a points file with x y z dx dy dz per line (the view position and direction), the same format as a sensor grid. Glare autonomy is the share of occupied hours with DGP below the limit (0.4 by default).',
    inputs: [
      { name: 'Weather', nick: 'EPW', optional: false, desc: 'Weather File component, or an EPW file name.' },
      inScene,
      { name: 'Receiver', nick: 'Rx', desc: 'Sky Receiver component. When empty, the batch file writes skyglow.rad (MF 1).' },
      { name: 'Views', nick: 'Views', optional: false, desc: 'Sensor Grid component or file name with one view per line (x y z dx dy dz).', hint: hint.panel('views.pts') },
      { name: 'Parameters', nick: 'Par', desc: 'Parameters for the total coefficients. When empty: -ab 8 -ad 50000 -lw 2e-5 -lr -10.' },
      { name: 'Direct parameters', nick: 'DirPar', desc: 'Parameters for the direct view coefficients (-ab 1 is kept). When empty: -ad 50000 -lw 2e-5.' },
      { name: 'Up', nick: 'Up', def: '0 0 1', desc: 'View up vector (-vu).', hint: hint.panel('0 0 1') },
      { name: 'Occupancy', nick: 'Occ', desc: 'Occupancy Schedule for glare autonomy. Default 8 to 18 h.' },
      { name: 'DGP limit', nick: 'Limit', def: 0.4, desc: 'Glare autonomy limit (-l); 0 skips glare autonomy.', hint: hint.slider(0, 1, 2, 0.4) },
      { name: 'Threshold', nick: 'Thr', def: 2000, desc: 'Glare source threshold in cd/m2 (-b).', hint: hint.int(500, 5000, 2000) },
      { name: 'Hourly DGP', nick: 'Hourly', def: true, desc: 'Also write the hourly DGP of every view.', hint: hint.toggle(true) },
      { name: 'Prefix', nick: 'Pre', def: 'glare', desc: 'Prefix of the files.', hint: hint.panel('glare') },
      inProcs
    ],
    outputs: scriptOut,
    solve(ctx) {
      const views = C.grid(ctx.raw(3));
      if (!views) ctx.fail('Views needs a Sensor Grid component or a file name');
      const up = T.vec3(ctx.raw(6));
      if (!up) ctx.fail('Up needs three numbers');
      let schedule = null;
      if (ctx.has(7)) { schedule = C.schedule(ctx.raw(7)); if (!schedule) ctx.fail('Occupancy needs an Occupancy Schedule'); }
      const limit = ctx.num(8);
      const hourly = !!ctx.bool(10);
      if (!(limit > 0) && !hourly) ctx.fail('Turn on Hourly DGP or set a DGP limit');
      const dir = paramsIn(ctx, 5, PARAMS({ ad: 50000, lw: 2e-5 }));
      const s = B.annualGlare({ weather: weatherIn(ctx, 0), scene: sceneIn(ctx, 1), receiver: receiverIn(ctx, 2), views,
        params: paramsIn(ctx, 4, PARAMS({ ab: 8, ad: 50000, lw: 2e-5, lr: -10 })),
        directParams: Object.assign({}, dir, { values: Object.assign({}, dir.values, { ab: 1 }) }),
        up: up[0] === 0 && up[1] === 0 && up[2] === 1 ? null : up, schedule, limit: limit > 0 ? limit : 0, threshold: ctx.num(9), hourly,
        prefix: String(ctx.str(11) || 'glare').replace(/[^\w.-]/g, '_'), procs: ctx.has(12) ? posInt(ctx, 12, 'Processes') : 0 });
      return result(s);
    }
  });

  /* == images over time == */

  W({
    type: 'Rad.AnnualImages', name: 'Annual Images', nick: 'AImg', group: 'Image', icon: 'annualimages',
    desc: 'Luminance images for chosen hours of the year with image-based daylight coefficients: one rfluxmtx image per sky patch (vwrays into rfluxmtx), then dctimestep with the sky matrix of those hours. Fast once the coefficient images exist.',
    keywords: 'annual images image based daylight coefficients dctimestep vwrays rfluxmtx hdr luminance hours',
    help: 'With a fisheye view, connect the result to Glare to get DGP for each hour. Images are numbered in hour order; the batch file writes a list of image numbers and hours.',
    inputs: [
      { name: 'Weather', nick: 'EPW', optional: false, desc: 'Weather File component, or an EPW file name.' },
      inScene,
      { name: 'Receiver', nick: 'Rx', desc: 'Sky Receiver component. When empty, the batch file writes skyglow.rad (MF 1).' },
      { name: 'View', nick: 'View', optional: false, desc: 'View component.' },
      { name: 'Resolution', nick: 'Res', def: 400, desc: 'Image size in pixels.', hint: hint.int(100, 2048, 400) },
      { name: 'Parameters', nick: 'Par', desc: 'Parameters for rfluxmtx. When empty: -ab 4 -ad 1000 -lw 1e-4.' },
      { name: 'Hours', nick: 'Hrs', access: 'list', optional: false, desc: 'Hours of the year (0 to 8759), as numbers or ranges such as "4110-4120", or the Hours output of an Analysis Period.', hint: hint.panel('4118') },
      { name: 'Samples', nick: 'N', def: 9, desc: 'Rays per pixel (vwrays -c and rfluxmtx -c).', hint: hint.int(1, 64, 9) },
      { name: 'Prefix', nick: 'Pre', def: 'aimg', desc: 'Prefix of files and folders.', hint: hint.panel('aimg') },
      inProcs
    ],
    outputs: scriptOut,
    solve(ctx) {
      const view = C.view(ctx.raw(3));
      if (!view || typeof view === 'string') ctx.fail('View needs a View component');
      const parsed = B.parseHours(ctx.list(6).map(T.str));
      if (parsed.bad.length) ctx.warn('Ignored: ' + parsed.bad.slice(0, 6).join(', '));
      if (!parsed.hours.length) ctx.fail('Hours needs at least one hour between 0 and 8759');
      if (parsed.hours.length > 200) ctx.warn(parsed.hours.length + ' hours make as many images');
      const s = B.annualImages({ weather: weatherIn(ctx, 0), scene: sceneIn(ctx, 1), receiver: receiverIn(ctx, 2), view, res: ctx.int(4),
        params: paramsIn(ctx, 5, PARAMS({ ab: 4, ad: 1000, lw: 1e-4 })), hours: parsed.hours, samples: Math.max(1, ctx.int(7)),
        prefix: String(ctx.str(8) || 'aimg').replace(/[^\w-]/g, '_'), procs: ctx.has(9) ? posInt(ctx, 9, 'Processes') : 0 });
      return result(s);
    }
  });

  W({
    type: 'Rad.Animation', name: 'Animation', nick: 'Anim', group: 'Image', icon: 'animation',
    desc: 'A walkthrough: views interpolated between key views, rendered with rpict -S into numbered frames that share one ambient cache, then filtered with a fixed exposure. Join the frames with a video tool afterwards.',
    keywords: 'animation walkthrough frames rpict sequence camera path video',
    inputs: [
      inScene,
      { name: 'Sky', nick: 'Sky', desc: 'Sky component or file (optional).', hint: hint.panel('sky.rad') },
      { name: 'Luminaires', nick: 'Lum', access: 'list', desc: 'IES Luminaire components or luminaire files (optional).' },
      { name: 'Key views', nick: 'Views', access: 'list', optional: false, desc: 'Two or more View components, in order.' },
      { name: 'Frames', nick: 'Frames', def: 48, desc: 'Number of frames along the path.', hint: hint.int(2, 600, 48) },
      { name: 'Image', nick: 'Img', desc: 'Image Settings (the warm-up is not used). Default 1024 px, /2 downsampling.' },
      Object.assign({}, inParams),
      { name: 'Prefix', nick: 'Pre', def: 'frame', desc: 'Frame name prefix.', hint: hint.panel('frame') },
      { name: 'Folder', nick: 'Dir', def: 'frames', desc: 'Folder for the frames.', hint: hint.panel('frames') },
      inAmb
    ],
    outputs: scriptOut,
    solve(ctx) {
      const views = ctx.list(3).map((v) => C.view(v));
      if (views.some((v) => !v || typeof v === 'string')) ctx.fail('Key views needs View components');
      if (views.some((v) => v.type !== views[0].type)) ctx.fail('All key views need the same view type');
      if (views.length < 2) ctx.warn('One key view gives a still frame; connect two or more');
      let image = { kind: 'image', x: 1024, y: 1024, warm: 0, down: 2, report: 0 };
      if (ctx.has(5)) { image = C.image(ctx.raw(5)); if (!image) ctx.fail('Image needs an Image Settings component'); }
      const lights = C.lights(ctx.list(2));
      const scene = sceneIn(ctx, 0);
      const s = B.animation({ scene, sky: skyIn(ctx, 1), lights: lights.files, views, frames: Math.max(2, ctx.int(4)), image,
        params: paramsIn(ctx, 6, medium()), prefix: String(ctx.str(7) || 'frame').replace(/[^\w-]/g, '_'),
        dir: String(ctx.str(8) || 'frames').replace(/[^\w\\/:.-]/g, '_'), amb: ctx.str(9) || '', pre: B.preBlocks([scene, lights.objects]) });
      return result(s);
    }
  });

  /* == electric lighting scenes == */

  W({
    type: 'Rad.Scenes', name: 'Lighting Scenes', nick: 'Scenes', group: 'Electric', icon: 'scenes',
    desc: 'Several lighting scenes from one run per luminaire group: each group is traced at full output, then rlam and rcalc add the groups with each scene\'s dimming levels (light adds up linearly).',
    keywords: 'lighting scenes dimming groups controls electric illuminance scenario',
    inputs: [
      inScene,
      { name: 'Groups', nick: 'Grp', access: 'list', optional: false, desc: 'One item per luminaire group: IES Luminaire components, or luminaire files (one per line).' },
      { name: 'Levels', nick: 'Lvl', access: 'list', optional: false, desc: 'One line per scene with a dimming level per group, for example "1 0.5 0".', hint: hint.panel('1 1 1\n1 0.5 0\n0.3 0.3 0.3') },
      { name: 'Names', nick: 'Names', access: 'list', desc: 'Scene names, one per line (default scene1, scene2...).', hint: hint.panel('full\nmeeting\nnight') },
      inGrid, inParams,
      inQty('illuminance', ['illuminance', 'irradiance'], 0, 'Illuminance (lux) or irradiance (W/m2).'),
      { name: 'Prefix', nick: 'Pre', def: 'scene', desc: 'Prefix of the files.', hint: hint.panel('scene') },
      inProcs
    ],
    outputs: scriptOut,
    solve(ctx) {
      const groups = [];
      ctx.list(1).forEach((v) => {
        if (v && v.kind === 'lum') groups.push(v);
        else T.strList([v]).forEach((f) => groups.push({ kind: 'lum', files: [f], pre: [] }));
      });
      if (!groups.length) ctx.fail('Groups needs luminaire groups');
      const lines = T.strList(ctx.list(2).map(T.str));
      const names = T.strList(ctx.list(3).map(T.str)).map((n) => n.replace(/[^\w-]/g, '_'));
      const scenes = lines.map((l, i) => {
        const lv = l.split(/[\s,]+/).filter(Boolean).map(Number);
        if (lv.some((x) => !isFinite(x) || x < 0)) ctx.fail('Levels need numbers of 0 or more: "' + l + '"');
        if (lv.length !== groups.length) ctx.fail('Scene ' + (i + 1) + ' has ' + lv.length + ' levels for ' + groups.length + ' groups');
        return { name: names[i] || 'scene' + (i + 1), levels: lv };
      });
      const quantity = qtyIn(ctx, 6, 'illuminance', ['illuminance', 'irradiance']);
      const s = B.lightScenes({ scene: sceneIn(ctx, 0), groups, scenes, grid: gridIn(ctx, 4), params: paramsIn(ctx, 5, medium()), quantity,
        prefix: String(ctx.str(7) || 'scene').replace(/[^\w-]/g, '_'), procs: ctx.has(8) ? posInt(ctx, 8, 'Processes') : 0 });
      return result(s);
    }
  });

  /* == LEED option 2 == */

  W({
    type: 'Rad.LEED', name: 'LEED Illuminance', nick: 'LEED', group: 'Compliance', icon: 'leed',
    desc: 'LEED v4.1 EQ Daylight option 2: illuminance at 9 am and 3 pm on a clear-sky day near an equinox, and the share of sensors between 300 and 3000 lux at both times (points at 55, 75 and 90 percent).',
    keywords: 'leed v4.1 option 2 illuminance 9am 3pm equinox clear sky compliance credit',
    help: 'By default the skies are CIE clear skies with sun (gensky +s) for the date. LEED also accepts the clearest days near the equinoxes from TMY data: connect your own skies to 9 am sky and 3 pm sky for that. With automatic glare control, only the 300 lux minimum counts.',
    inputs: [
      { name: 'Location', nick: 'Loc', desc: 'Location, or a Weather File with its EPW loaded (not needed when both skies are connected).' },
      inScene, inGrid, inParams,
      { name: 'Month', nick: 'M', def: 9, desc: 'Month of the clear-sky day.', hint: hint.int(1, 12, 9) },
      { name: 'Day', nick: 'D', def: 21, desc: 'Day of the month.', hint: hint.int(1, 31, 21) },
      { name: 'Glare control', nick: 'Glare', def: false, desc: 'Spaces with automatic glare control: only the 300 lux minimum counts.', hint: hint.toggle(true) },
      { name: '9 am sky', nick: 'Sky9', desc: 'Your own sky for 9 am (optional).' },
      { name: '3 pm sky', nick: 'Sky15', desc: 'Your own sky for 3 pm (optional).' },
      { name: 'Prefix', nick: 'Pre', def: 'leed', desc: 'Prefix of the files.', hint: hint.panel('leed') },
      inProcs
    ],
    outputs: scriptOut,
    solve(ctx) {
      const skies = [skyIn(ctx, 7), skyIn(ctx, 8)];
      let loc = null;
      if (!skies[0] || !skies[1]) loc = C.needLocation(ctx, 0);
      const month = ctx.int(4);
      const day = ctx.int(5);
      if (month < 1 || month > 12 || day < 1 || day > B.MONTH_DAYS[month - 1]) ctx.fail('Month and Day must form a valid date');
      const s = B.leedIlluminance({ loc, scene: sceneIn(ctx, 1), grid: gridIn(ctx, 2), params: paramsIn(ctx, 3, medium()), month, day,
        glareControl: !!ctx.bool(6), skies, prefix: String(ctx.str(9) || 'leed').replace(/[^\w-]/g, '_'), procs: ctx.has(10) ? posInt(ctx, 10, 'Processes') : 0 });
      return result(s);
    }
  });
})(window.VR);
