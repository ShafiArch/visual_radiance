/* Visual Radiance: the Post tab. Each component turns the results of a workflow
   (connect its Scr output) or existing result files (connect their names) into
   metrics, statistics, false color images, exported pictures or glare indices. */
(function (VR) {
  'use strict';
  const T = VR.types;
  const B = VR.build;
  const C = VR.coerce;
  const hint = VR.hint;

  const P = (spec) => VR.defineComponent(Object.assign({ tab: 'Post' }, spec));
  const out = [{ name: 'Script', nick: 'Scr', desc: 'Post-processing script; connect it to a Batch Writer (its simulation is added first)' },
    { name: 'Result', nick: 'Res', desc: 'Names of the files this step writes' }];
  const result = (s) => [s, s.outputs.length === 1 ? s.outputs[0] : s.outputs];
  const safe = (t, d) => String(t || d).replace(/[^\w.-]/g, '_');

  function inputIn(ctx, i, types, what) {
    const raw = ctx.has(i) ? ctx.list(i) : [];
    const scripts = raw.filter((v) => v && v.kind === 'script');
    const v = scripts.length ? scripts[0] : T.strList(raw);
    if (scripts.length > 1) ctx.warn('Only the first script is used');
    const inp = B.inputOf(v);
    if (!inp) ctx.fail(ctx.spec.inputs[i].name + ' needs a workflow script (Scr) or result file names');
    const MAKES = { grid: 'point-in-time results', annual: 'an annual result', image: 'images', glare: 'glare results', text: 'a text summary' };
    if (inp.script && types && types.indexOf(inp.type) < 0) ctx.fail('This step needs ' + what + '; the connected script makes ' + (MAKES[inp.type] || 'other files'));
    return inp;
  }

  P({
    type: 'Post.Metrics', name: 'Annual Metrics', nick: 'Metrics', group: 'Annual', icon: 'metrics',
    desc: 'Climate-based daylight metrics from an annual illuminance result: daylight autonomy (DA), continuous DA, useful daylight illuminance (UDI), spatial daylight autonomy (sDA) and annual sunlight exposure (ASE), with optional LEED v4.1 option 1 points or the EN 17037 daylight provision level. Uses rcollate, rcomb and total, so it needs Radiance 6.',
    keywords: 'metrics daylight autonomy da cda udi sda ase leed en 17037 climate based lm-83',
    help: 'ASE needs a direct-sun-only result: DDS, five- and six-phase annual runs provide it, or connect a file to Direct. EN 17037 counts the half of the year with the most global horizontal irradiance (the daylight hours), read from the EPW. LEED and IES LM-83 use 8 am to 6 pm.',
    inputs: [
      { name: 'Annual result', nick: 'Ill', access: 'list', optional: false, desc: 'Annual workflow script (Scr), or the name of an annual illuminance file (one row per hour, one column per sensor).' },
      { name: 'Direct sun', nick: 'Dir', desc: 'Direct-sun-only annual file for ASE (optional when the annual script provides it).', hint: hint.panel('annualRs_part0.ill') },
      { name: 'Occupancy', nick: 'Occ', desc: 'Occupancy Schedule, or text such as 8-18. Default 8 to 18 h.' },
      { name: 'DA threshold', nick: 'DA', def: 300, desc: 'Illuminance for DA and sDA, in lux.', hint: hint.int(50, 1000, 300) },
      { name: 'UDI range', nick: 'UDI', def: [100, 3000], desc: 'Lower and upper limits of useful daylight illuminance, in lux.', hint: { widget: 'md', xmin: 0, xmax: 500, ymin: 1000, ymax: 5000, x: 100, y: 3000, dec: 0 } },
      { name: 'sDA hours', nick: 'sDA', def: 50, desc: 'Share of hours (percent) a sensor must reach the DA threshold to count for sDA.', hint: hint.int(1, 100, 50) },
      { name: 'ASE', nick: 'ASE', def: [1000, 250], desc: 'Direct sun illuminance (lux) and hours for ASE.', hint: { widget: 'md', xmin: 100, xmax: 2000, ymin: 0, ymax: 1000, x: 1000, y: 250, dec: 0 } },
      { name: 'Check', nick: 'Check', def: 'none', desc: 'none, leed (LEED v4.1 EQ Daylight option 1) or en17037 (daylight provision).',
        hint: hint.list([{ label: 'Metrics only', value: 'none' }, { label: 'LEED v4.1 option 1', value: 'leed' }, { label: 'EN 17037 daylight provision', value: 'en17037' }], 1) },
      { name: 'Weather', nick: 'EPW', desc: 'EPW file for the EN 17037 daylight hours (taken from the annual script when empty).' },
      { name: 'Prefix', nick: 'Pre', def: 'metrics', desc: 'Prefix of the result files.', hint: hint.panel('metrics') }
    ],
    outputs: out,
    solve(ctx) {
      const input = inputIn(ctx, 0, ['annual'], 'an annual result');
      let direct = ctx.has(1) ? ctx.str(1) : input.direct || null;
      let schedule = null;
      if (ctx.has(2)) {
        schedule = C.schedule(ctx.raw(2));
        if (!schedule) ctx.fail('Occupancy needs an Occupancy Schedule or text such as 8-18');
      }
      const udi = T.pair(ctx.raw(4));
      const ase = T.pair(ctx.raw(6));
      if (!udi || udi[0] >= udi[1]) ctx.fail('UDI range needs a lower and a higher illuminance');
      if (!ase) ctx.fail('ASE needs an illuminance and a number of hours');
      const check = String(ctx.str(7) || 'none').toLowerCase().replace(/[^a-z0-9]/g, '');
      const key = { none: 'none', leed: 'leed', leedv41: 'leed', leed41: 'leed', en17037: 'en17037', en: 'en17037' }[check];
      if (!key) ctx.fail('Check must be none, leed or en17037');
      let epw = null;
      if (key === 'en17037') {
        const w = ctx.has(8) ? C.weather(ctx.raw(8)) : null;
        epw = w ? w.path : input.weather;
        if (!epw) ctx.fail('EN 17037 needs the EPW file (connect it to Weather)');
        if (schedule) ctx.remark('EN 17037 uses the daylight hours, so Occupancy is not used');
      }
      if (!direct && key !== 'en17037') ctx.remark('No direct sun result, so ASE is skipped');
      if (input.quantity && input.quantity !== 'illuminance') ctx.warn('Metrics expect illuminance in lux; this result is ' + input.quantity);
      const da = ctx.num(3);
      const s = B.metrics({ input, direct, schedule, da, udi, sda: ctx.num(5), ase, check: key, epw, prefix: safe(ctx.str(9), 'metrics') });
      return result(s);
    }
  });

  P({
    type: 'Post.Stats', name: 'Grid Statistics', nick: 'Stats', group: 'Grid', icon: 'stats',
    desc: 'Mean, minimum, maximum and uniformity (minimum over mean) of a point-in-time result, and the share of sensors at or above each threshold. Useful for average daylight factor, LEED option 2 style checks or electric lighting uniformity.',
    keywords: 'statistics average mean minimum maximum uniformity percent area threshold daylight factor',
    inputs: [
      { name: 'Result', nick: 'Res', access: 'list', optional: false, desc: 'Point-in-time workflow script (Scr) or a result file name with one value per line.' },
      { name: 'Thresholds', nick: 'Thr', access: 'list', desc: 'Values to count sensors against, one per line (for example 300 and 3000, or 2 for a 2 percent daylight factor).', hint: hint.panel('300\n3000') },
      { name: 'Unit', nick: 'Unit', desc: 'Unit for the summary (taken from the workflow when empty).', hint: hint.panel('lux') },
      { name: 'Prefix', nick: 'Pre', def: 'stats', desc: 'Prefix of the summary file.', hint: hint.panel('stats') }
    ],
    outputs: out,
    solve(ctx) {
      const input = inputIn(ctx, 0, ['grid'], 'a point-in-time result');
      if (input.columns === 3) ctx.warn('This result has three RGB columns; set the workflow Quantity to get one value per sensor');
      const thresholds = T.strList(ctx.list(1)).map(Number);
      if (thresholds.some((x) => !isFinite(x))) ctx.fail('Thresholds need numbers');
      const s = B.gridStats({ input, thresholds, unit: ctx.str(2) || '', prefix: safe(ctx.str(3), 'stats') });
      return result(s);
    }
  });

  const PALETTES = ['def', 'spec', 'tbo', 'hot', 'eco', 'pm3d'];
  P({
    type: 'Post.Falsecolor', name: 'Falsecolor', nick: 'FC', group: 'Image', icon: 'falsecolor',
    desc: 'False color image with a legend (falsecolor), optionally as contour lines or bands over the rendering, and exported to BMP or TIFF. The multiplier and label follow the render quantity (cd/m2, lux, W/m2 or daylight factor) unless you set them.',
    keywords: 'falsecolor false color legend contour bands luminance illuminance daylight factor image',
    inputs: [
      { name: 'Image', nick: 'Img', access: 'list', optional: false, desc: 'Render, Animation or Annual Images script, or HDR file names (a name with * runs a loop).' },
      { name: 'Scale', nick: 'Max', def: 1000, desc: 'Top of the scale, or auto.', hint: hint.int(1, 10000, 1000) },
      { name: 'Steps', nick: 'N', def: 8, desc: 'Number of colors and legend entries (-n).', hint: hint.int(2, 20, 8) },
      { name: 'Multiplier', nick: 'Mult', desc: 'Multiplier (-m): 179 for luminance and illuminance, 1.79 for daylight factor (set from the quantity when empty).', hint: hint.slider(0, 200, 2, 179) },
      { name: 'Label', nick: 'Label', desc: 'Legend label (set from the quantity when empty).', hint: hint.panel('cd/m2') },
      { name: 'Log', nick: 'Log', def: 0, desc: 'Decades below the top for a logarithmic scale (0 is linear).', hint: hint.int(0, 6, 0) },
      { name: 'Style', nick: 'Style', def: 'none', desc: 'none (filled), lines (-cl), bands (-cb) or posterize (-cp).',
        hint: hint.list([{ label: 'Filled', value: 'none' }, { label: 'Contour lines', value: 'lines' }, { label: 'Contour bands', value: 'bands' }, { label: 'Posterize', value: 'posterize' }]) },
      { name: 'Palette', nick: 'Pal', def: 'def', desc: 'def, spec, tbo, hot, eco or pm3d.', hint: hint.list(PALETTES.map((p) => ({ label: p, value: p }))) },
      { name: 'Overlay', nick: 'Over', def: false, desc: 'Draw lines or bands over the rendering (-ip).', hint: hint.toggle(true) },
      { name: 'Format', nick: 'Fmt', def: 'hdr', desc: 'Also write bmp, tif or ppm.', hint: hint.list([{ label: 'HDR only', value: 'hdr' }, { label: 'BMP', value: 'bmp' }, { label: 'TIFF', value: 'tif' }, { label: 'PPM', value: 'ppm' }]) },
      { name: 'Output', nick: 'Out', def: 'falsecolor.hdr', desc: 'Output name (for image sequences, a folder of that name without the extension).', hint: hint.panel('falsecolor.hdr') }
    ],
    outputs: out,
    solve(ctx) {
      const input = inputIn(ctx, 0, ['image'], 'images');
      const mx = String(ctx.str(1) || '1000').trim();
      if (!/^a/i.test(mx) && !(Number(mx) > 0)) ctx.fail('Scale must be a positive number or auto');
      const fmt = String(ctx.str(9) || 'hdr').toLowerCase().replace(/^tiff$/, 'tif');
      if (['hdr', 'bmp', 'tif', 'ppm'].indexOf(fmt) < 0) ctx.fail('Format must be hdr, bmp, tif or ppm');
      const style = String(ctx.str(6) || 'none').toLowerCase();
      const pal = String(ctx.str(7) || 'def').toLowerCase();
      if (PALETTES.indexOf(pal) < 0) ctx.fail('Palette must be one of ' + PALETTES.join(', '));
      if (input.quantity === 'falsecolor' || input.quantity === 'display') ctx.warn('The input is already a display image');
      const overlay = !!ctx.bool(8);
      if (overlay && (style === 'none' || !style)) ctx.remark('Overlay shows the rendering under contour lines or bands; pick a style');
      const s = B.falsecolor({ input, max: /^a/i.test(mx) ? 'a' : mx, div: ctx.int(2), mult: ctx.has(3) ? ctx.num(3) : undefined,
        label: ctx.str(4) || '', log: ctx.int(5), style, pal, overlay, format: fmt, out: safe(ctx.str(10), 'falsecolor.hdr'), extrema: false });
      return result(s);
    }
  });

  P({
    type: 'Post.ToneMap', name: 'Tone Map', nick: 'Tone', group: 'Image', icon: 'tonemap',
    desc: 'Tone maps and exports pictures: pcond human vision response (-h), linear (-l) or none, an exposure in f-stops, then BMP, TIFF, PPM or HDR.',
    keywords: 'tone map pcond human exposure export bmp tiff ppm convert ra_bmp ra_tiff',
    inputs: [
      { name: 'Image', nick: 'Img', access: 'list', optional: false, desc: 'Render, Falsecolor, Animation or Annual Images script, or HDR file names.' },
      { name: 'Mode', nick: 'Mode', def: 'human', desc: 'human (pcond -h), linear (pcond -l), acuity (pcond -a -v) or none.',
        hint: hint.list([{ label: 'Human vision', value: 'human' }, { label: 'Linear', value: 'linear' }, { label: 'Acuity and veil', value: 'acuity' }, { label: 'None (exposure only)', value: 'none' }]) },
      { name: 'Exposure', nick: 'Exp', def: 0, desc: 'Exposure change in f-stops (+1 is twice as bright).', hint: hint.slider(-6, 6, 1, 0) },
      { name: 'Format', nick: 'Fmt', def: 'bmp', desc: 'bmp, tif, ppm or hdr.', hint: hint.list([{ label: 'BMP', value: 'bmp' }, { label: 'TIFF', value: 'tif' }, { label: 'PPM', value: 'ppm' }, { label: 'HDR', value: 'hdr' }]) },
      { name: 'Output', nick: 'Out', def: 'image.bmp', desc: 'Output name (for image sequences, a folder of that name without the extension).', hint: hint.panel('image.bmp') }
    ],
    outputs: out,
    solve(ctx) {
      const input = inputIn(ctx, 0, ['image'], 'images');
      const mode = String(ctx.str(1) || 'human').toLowerCase();
      if (['human', 'linear', 'acuity', 'none'].indexOf(mode) < 0) ctx.fail('Mode must be human, linear, acuity or none');
      const fmt = String(ctx.str(3) || 'bmp').toLowerCase().replace(/^tiff$/, 'tif');
      if (['bmp', 'tif', 'ppm', 'hdr'].indexOf(fmt) < 0) ctx.fail('Format must be bmp, tif, ppm or hdr');
      if (input.quantity === 'falsecolor' && mode !== 'none') ctx.remark('False color images are usually exported with Mode none');
      const s = B.toneMap({ input, mode, exposure: ctx.num(2), format: fmt, out: safe(ctx.str(4), 'image.' + fmt) });
      return result(s);
    }
  });

  P({
    type: 'Post.Glare', name: 'Glare', nick: 'Glare', group: 'Glare', icon: 'glare',
    desc: 'Glare indices from fisheye images with evalglare: DGP, DGI, UGR (for electric lighting), VCP and CGI, with an optional check image showing the glare sources. Image sequences are evaluated one by one into one file.',
    keywords: 'glare evalglare dgp dgi ugr vcp cgi fisheye discomfort',
    help: 'Use a 180 degree fisheye view (-vth or -vta). DGP classes: below 0.35 imperceptible, 0.35 to 0.40 perceptible, 0.40 to 0.45 disturbing, 0.45 and above intolerable.',
    inputs: [
      { name: 'Image', nick: 'Img', access: 'list', optional: false, desc: 'Fisheye Render, Animation or Annual Images script, or HDR file names.' },
      { name: 'Threshold', nick: 'Thr', def: 2000, desc: 'Glare source threshold (-b): cd/m2 above 100, otherwise a factor of the average luminance.', hint: hint.int(100, 5000, 2000) },
      { name: 'Task', nick: 'Task', desc: 'Task area as x y angle (pixels and radians), optional (-T).', hint: hint.panel('512 512 0.5') },
      { name: 'Check image', nick: 'Chk', def: true, desc: 'Write a check image with the glare sources marked (-c).', hint: hint.toggle(true) },
      { name: 'Detailed', nick: 'Det', def: false, desc: 'List each glare source (-d).', hint: hint.toggle(true) },
      { name: 'Output', nick: 'Out', def: 'glare.txt', desc: 'Result file name.', hint: hint.panel('glare.txt') }
    ],
    outputs: out,
    solve(ctx) {
      const input = inputIn(ctx, 0, ['image'], 'fisheye images');
      if (input.script && input.fisheye === false) ctx.warn('evalglare needs a 180 degree fisheye view (-vth or -vta)');
      let task = null;
      if (ctx.has(2)) {
        task = String(ctx.str(2)).split(/[\s,]+/).filter(Boolean).map(Number);
        if (task.length !== 3 || task.some((x) => !isFinite(x))) ctx.fail('Task needs x y angle');
      }
      const thr = ctx.num(1);
      if (!(thr > 0)) ctx.fail('Threshold must be above 0');
      // Images from dctimestep have no VIEW line in their header, so give evalglare the view.
      const view = input.pattern && input.view ? input.view : '';
      const s = B.glare({ input, threshold: thr, task, check: !!ctx.bool(3), detailed: !!ctx.bool(4), view, out: safe(ctx.str(5), 'glare.txt') });
      return result(s);
    }
  });
})(window.VR);
