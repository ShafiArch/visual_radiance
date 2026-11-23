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

  const inScene = { name: 'Scene', nick: 'Scene', access: 'list', optional: false, desc: 'Scene component, or a panel listing the scene files.' };
  const inGrid = { name: 'Grid', nick: 'Grid', optional: false, desc: 'Sensor Grid component, or a points file name.' };
  const inParams = { name: 'Parameters', nick: 'Par', desc: 'Radiance Parameters. Medium preset when nothing is connected.' };
  const inProcs = { name: 'Processes', nick: 'Proc', desc: 'Parallel processes (-n), optional.', hint: hint.int(1, 32, 4) };
  const inAmb = { name: 'Ambient file', nick: 'Amb', desc: 'Ambient cache file (-af), optional.', hint: hint.panel('amb.cache') };

  /* == annual illuminance == */

  W({
    type: 'Rad.Annual', name: 'Annual Illuminance', nick: 'Annual', group: 'Daylight', icon: 'annual',
    desc: 'Hourly illuminance for a year: daylight coefficients with rfluxmtx, a sky matrix from gendaymtx, and accurate direct sun from sun coefficients (Reinhart MF 6 by default). Result = total minus direct-only plus direct sun.',
    keywords: 'annual illuminance daylight coefficients dds two phase rfluxmtx gendaymtx dctimestep climate based',
    help: 'The black scene uses the same geometry with black materials, so its run gives the direct part only. The sun list is generated with cnt and rcalc for every Reinhart patch (144 x MF x MF + 1 suns).',
    inputs: [
      { name: 'Weather', nick: 'EPW', optional: false, desc: 'Weather File component, or an EPW file name.' },
      Object.assign({}, inScene, { desc: 'Scene with normal materials (for example envelope.mat and envelope.rad).' }),
      { name: 'Black scene', nick: 'Black', access: 'list', optional: false, desc: 'The same scene with black materials (for example envelope.blk and envelope.rad).', hint: hint.panel('envelope.blk\nenvelope.rad') },
      { name: 'Receiver', nick: 'Rx', desc: 'Sky Receiver component, or a receiver file name. When empty, the batch file writes skyglow.rad (MF 1).' },
      inGrid,
      { name: 'Parameters', nick: 'Par', desc: 'Radiance Parameters for both rfluxmtx runs. When empty: -ab 3 -ad 2048 -lw 0.0004.' },
      { name: 'Sun parameters', nick: 'SunPar', desc: 'Parameters for the direct sun run (rcontrib). When empty: -ab 0 -ad 64 -dc 1 -dt 0 -dj 0 and the -lw above.' },
      { name: 'Sun density', nick: 'SunMF', def: 6, desc: 'Reinhart subdivision for the suns and the sun-only sky matrix.', hint: hint.int(1, 6, 6) },
      { name: 'Part', nick: 'Part', def: 0, desc: 'Part number, for grids split into parts that run in parallel. Used in all file names.', hint: hint.int(0, 16, 0) },
      { name: 'Processes', nick: 'Proc', def: 4, desc: 'Parallel processes (-n).', hint: hint.int(1, 32, 4) }
    ],
    outputs: scriptOut,
    menu: [{ label: 'Sun source file', key: 'sunCal', options: [
      { label: 'reinsrc.cal (Radiance 5.x installs)', value: 'reinsrc.cal' },
      { label: 'rskysrc.cal (newer Radiance)', value: 'rskysrc.cal' }] }],
    init: () => ({ sunCal: 'reinsrc.cal' }),
    solve(ctx) {
      const weather = C.weather(ctx.raw(0));
      if (!weather) ctx.fail('Weather needs a Weather File component or an EPW file name');
      const scene = sceneIn(ctx, 1);
      const black = sceneIn(ctx, 2);
      let receiver;
      if (ctx.has(3)) {
        receiver = C.receiver(ctx.raw(3));
        if (!receiver) ctx.fail('Receiver needs a Sky Receiver component or a file name');
        if (typeof ctx.raw(3) === 'string') ctx.remark('A receiver given by name is assumed to be Tregenza (MF 1)');
      } else {
        receiver = { kind: 'receiver', file: 'skyglow.rad', mf: 1, write: true, up: '+Y' };
      }
      const grid = gridIn(ctx, 4);
      const params = paramsIn(ctx, 5, { kind: 'params', values: { ab: 3, ad: 2048, lw: 0.0004 }, raw: '', label: '', preset: 'none' });
      const lw = params.values.lw !== undefined ? params.values.lw : 0.001;
      const sunParams = paramsIn(ctx, 6, { kind: 'params', values: { ab: 0, ad: 64, lw, dc: 1, dt: 0, dj: 0 }, raw: '', label: '', preset: 'none' });
      const sunMF = posInt(ctx, 7, 'Sun density');
      const part = posInt(ctx, 8, 'Part', 0);
      const procs = posInt(ctx, 9, 'Processes');
      const ad = params.values.ad;
      if (ad > 0 && lw > 1 / ad) ctx.warn('-lw ' + lw + ' is above 1/-ad (' + (1 / ad).toPrecision(2) + '); rfluxmtx results may be noisy');
      if (sunParams.values.ab > 1) ctx.remark('Direct sun coefficients are usually computed with -ab 0');
      if (scene.prebuilt || black.prebuilt) ctx.remark('Prebuilt octrees are copied, and the sun octree adds the suns with oconv -i');
      const s = B.annual({ weather, scene, black, receiver, grid, params, sunParams, sunMF, part, procs, sunCal: ctx.state.sunCal });
      return result(s);
    }
  });

  /* == point-in-time illuminance and electric lighting == */

  function pitSolve(ctx, electric) {
    const scene = sceneIn(ctx, 0);
    const sky = electric ? null : skyIn(ctx, 1);
    const lights = electric ? T.strList(ctx.list(1)) : [];
    if (electric && !lights.length) ctx.fail('Connect the luminaire files');
    const grid = gridIn(ctx, 2);
    const params = paramsIn(ctx, 3, medium());
    const s = B.pit({ electric, scene, sky, lights, grid, params, out: ctx.str(4) || 'raw.txt', lux: !!ctx.bool(5),
      procs: ctx.has(6) ? posInt(ctx, 6, 'Processes') : 0, amb: ctx.str(7) || '' });
    if (!electric && params.values.ab === 0) ctx.remark('-ab 0 leaves out all interreflected daylight');
    return result(s);
  }

  W({
    type: 'Rad.PIT', name: 'Point-in-Time Illuminance', nick: 'PIT', group: 'Daylight', icon: 'pit',
    desc: 'Illuminance at sensor points under one sky: oconv the scene with the sky, then rtrace -I. With Lux on, rcalc converts RGB irradiance to lux.',
    keywords: 'point in time illuminance rtrace sensor grid daylight sky',
    inputs: [
      inScene,
      { name: 'Sky', nick: 'Sky', optional: false, desc: 'Sky component (gensky, gendaylit) or a sky file name.', hint: hint.panel('sky.rad') },
      inGrid, inParams,
      { name: 'Output', nick: 'Out', def: 'raw.txt', desc: 'Result file name.', hint: hint.panel('raw.txt') },
      { name: 'Lux', nick: 'Lux', def: false, desc: 'Convert to illuminance in lux with rcalc (179 x (0.265 R + 0.670 G + 0.065 B)).', hint: hint.toggle(true) },
      inProcs, inAmb
    ],
    outputs: scriptOut,
    solve: (ctx) => pitSolve(ctx, false)
  });

  W({
    type: 'Rad.Electric', name: 'Electric Illuminance', nick: 'Elec', group: 'Electric', icon: 'electric',
    desc: 'Illuminance from luminaires only (no sky): oconv the scene with the luminaire files, then rtrace -I at the sensor points.',
    keywords: 'electric lighting luminaires illuminance rtrace ies',
    inputs: [
      inScene,
      { name: 'Luminaires', nick: 'Lum', access: 'list', optional: false, desc: 'Luminaire files (for example from ies2rad), one per line.', hint: hint.panel('luminaires.rad') },
      inGrid, inParams,
      { name: 'Output', nick: 'Out', def: 'raw.txt', desc: 'Result file name.', hint: hint.panel('raw.txt') },
      { name: 'Lux', nick: 'Lux', def: false, desc: 'Convert to illuminance in lux with rcalc.', hint: hint.toggle(true) },
      inProcs, inAmb
    ],
    outputs: scriptOut,
    solve: (ctx) => pitSolve(ctx, true)
  });

  /* == point-in-time render == */

  W({
    type: 'Rad.Render', name: 'Point-in-Time Render', nick: 'Render', group: 'Image', icon: 'render',
    desc: 'A luminance image with rpict: octree with sky and luminaires, an optional low resolution warm-up that fills the ambient cache, the main render, then pcompos, pfilt and the view written into the HDR header.',
    keywords: 'render image rpict hdr luminance view fisheye picture',
    help: 'When Warm-up parameters are empty the warm-up uses the main parameters, like the overture pass of rad. The tag (often the hour of the year) is added to every file name.',
    inputs: [
      inScene,
      { name: 'Sky', nick: 'Sky', desc: 'Sky component or sky file name (optional for electric-only renders).', hint: hint.panel('sky.rad') },
      { name: 'Luminaires', nick: 'Lum', access: 'list', desc: 'Luminaire files (optional).', hint: hint.panel('luminaires.rad') },
      { name: 'View', nick: 'View', optional: false, desc: 'View component.' },
      { name: 'Image', nick: 'Img', desc: 'Image Settings component, or just a resolution. Default 1024 px with a 64 px warm-up and /2 downsampling.' },
      { name: 'Parameters', nick: 'Par', desc: 'Radiance Parameters for the main render. Medium preset when nothing is connected.' },
      { name: 'Warm-up parameters', nick: 'WarmPar', desc: 'Parameters for the warm-up pass (optional).' },
      { name: 'Tag', nick: 'Tag', desc: 'Added to file names, usually the hour of the year (for example 4118).', hint: hint.panel('4118') },
      { name: 'Ambient file', nick: 'Amb', desc: 'Ambient cache shared by both passes. Default render_<tag>.amb.', hint: hint.panel('IMG.amb') }
    ],
    outputs: scriptOut,
    solve(ctx) {
      const scene = sceneIn(ctx, 0);
      const sky = skyIn(ctx, 1);
      const lights = T.strList(ctx.list(2));
      if (!sky && !lights.length) ctx.warn('No sky and no luminaires: the image will be dark');
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
      const s = B.render({ scene, sky, lights, view, image, params, warmParams, tag: ctx.str(7) || '', amb: ctx.str(8) || '' });
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
})(window.VR);
