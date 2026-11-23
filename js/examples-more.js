/* Visual Radiance: examples for the quantities, solar studies, metrics, image
   post-processing, glare, matrix methods, electric lighting and the advanced
   workflows. They have no reference batch files; tests/check-workflows.js solves
   each one and checks the batch text. */
(function (VR) {
  'use strict';
  const Def = VR.Def;
  const B = VR.build;
  const add = (o) => VR.examples.push(o);
  const presets = () => [
    { label: 'None', value: 'none' }, { label: 'Low', value: 'low' },
    { label: 'Medium', value: 'medium' }, { label: 'High', value: 'high' }];
  const EPW = 'USA_WA_Seattle-Tacoma.Intl.AP.727930_TMYx.2004-2018.epw';
  const SEATTLE = { file: EPW, header: { name: 'Seattle-Tacoma Intl AP, WA, USA', lat: 47.4638, lon: -122.3143, tz: -8, elev: 131 }, hourly: null };

  // Common pieces: each returns the node id.
  const weather = (b, x, y) => {
    const id = b.node('Rad.Weather', x, y, SEATTLE);
    b.feed(id, [['EPW', b.panel(EPW, 380, 44, 'Weather file')]]);
    return id;
  };
  const scene = (b, x, y, files, nick, label) => {
    const id = b.node('Rad.Scene', x, y, {}, nick);
    b.feed(id, [['Files', b.panel(files, 0, 0, label || 'Scene files')]]);
    return id;
  };
  const grid = (b, x, y, pts, label) => {
    const id = b.node('Rad.Grid', x, y);
    b.feed(id, [['Pts', b.panel(pts, 0, 44, label || 'Points')]]);
    return id;
  };
  const params = (b, x, y, preset, extra, nick) => {
    const id = b.node('Rad.Params', x, y, {}, nick);
    b.feed(id, [['Preset', b.list('Preset', presets(), preset, 150)]].concat(extra || []));
    return id;
  };
  const writer = (b, x, y, scripts, name, pw, ph) => {
    const id = b.node('Bat.Writer', x, y);
    scripts.forEach((s) => b.wire(s, 0, id, 'Scr'));
    b.feed(id, [['Name', b.panel(name, 0, 44, 'File name')]], 40);
    const view = b.node('Panel', x + 250, y - 60, { text: '', w: pw || 760, h: ph || 420 }, 'Batch file');
    b.wire(id, 0, view, 0);
    return id;
  };
  const qtyList = (b, keys, index) => ['Qty', b.list('Quantity', B.qtyItems(keys), index, 190)];

  /* == daylight factor and sky view == */
  add({
    id: 'dfsky', name: 'Daylight factor and sky view',
    desc: 'Point-in-Time with Quantity set to daylight factor (its own 10,000 lux CIE overcast sky) and to sky view (uniform sky, direct view only), plus grid statistics of the daylight factor.',
    build() {
      const b = new Def('Daylight factor and sky view');
      b.note('Daylight factor and sky view at sensor points, with statistics', 40, 0, 22);
      const scn = scene(b, 470, 60, 'envelope.mat\nenvelope.rad');
      const grd = grid(b, 470, 160, '0.pts');
      const par = params(b, 470, 240, 2, [['ab', b.slider('ab', 5, 0, 12, 0)], ['ad', b.slider('ad', 4096, 0, 8192, 0)]]);
      const df = b.node('Rad.PIT', 1000, 60, {}, 'DF');
      b.wire(scn, 0, df, 'Scene').wire(grd, 0, df, 'Grid').wire(par, 0, df, 'Par');
      b.feed(df, [['Out', b.panel('df.txt', 0, 44, 'Result')], qtyList(b, ['illuminance', 'df', 'skyview'], 1)], 40);
      const sv = b.node('Rad.PIT', 1000, 300, {}, 'SkyView');
      b.wire(scn, 0, sv, 'Scene').wire(grd, 0, sv, 'Grid').wire(par, 0, sv, 'Par');
      b.feed(sv, [['Out', b.panel('skyview.txt', 0, 44, 'Result')], qtyList(b, ['illuminance', 'df', 'skyview'], 2)], 40);
      const st = b.node('Post.Stats', 1340, 60, {}, 'DF stats');
      b.wire(df, 0, st, 'Res');
      b.feed(st, [['Thr', b.panel('1\n2\n5', 90, 0, 'DF targets')], ['Pre', b.panel('df_stats', 0, 44, 'Prefix')]], 40);
      writer(b, 1700, 200, [st, sv], 'daylight_factor_sky_view.bat');
      return b.doc;
    }
  });

  /* == cumulative radiation == */
  add({
    id: 'radiation', name: 'Cumulative radiation (summer)',
    desc: 'Solar radiation in kWh/m2 on facade sensors from June to August: an average solar sky (gendaymtx -A -O1), daylight coefficients and the number of hours in the period.',
    build() {
      const b = new Def('Cumulative radiation (summer)');
      b.note('Cumulative radiation on a facade, June to August', 40, 0, 22);
      const epw = weather(b, 470, 60);
      const scn = scene(b, 470, 140, 'context.mat\ncontext.rad\nbuilding.rad');
      const grd = grid(b, 470, 250, 'facade.pts', 'Facade points');
      const per = b.node('Rad.Period', 470, 330);
      b.feed(per, [['SM', b.slider('Start month', 6, 1, 12, 0, 190)], ['EM', b.slider('End month', 8, 1, 12, 0, 190)]], 46);
      const rad = b.node('Rad.Radiation', 1000, 160);
      b.wire(epw, 0, rad, 'EPW').wire(scn, 0, rad, 'Scene').wire(grd, 0, rad, 'Grid').wire(per, 0, rad, 'Per');
      b.feed(rad, [['Unit', b.list('Unit', [{ label: 'kWh/m2 (total)', value: 'kWh/m2' }, { label: 'W/m2 (average)', value: 'W/m2' }], 0, 190)],
        ['Out', b.panel('radiation_summer.txt', 0, 44, 'Result')], ['Proc', b.slider('Processes', 8, 1, 32, 0, 190)]], 40);
      const st = b.node('Post.Stats', 1340, 160);
      b.wire(rad, 0, st, 'Res');
      b.feed(st, [['Thr', b.panel('300', 60, 44, 'kWh/m2')], ['Pre', b.panel('radiation_stats', 0, 44, 'Prefix')]], 40);
      writer(b, 1700, 160, [st], 'cumulative_radiation.bat');
      return b.doc;
    }
  });

  /* == direct sun hours and EN 17037 sunlight exposure == */
  add({
    id: 'sunhours', name: 'Direct sun hours and EN 17037 sunlight',
    desc: 'Top: possible sun hours on 21 March every 10 minutes, with the EN 17037 sunlight exposure levels. Bottom: hours with real direct sun (120 W/m2 or more) for the whole year.',
    build() {
      const b = new Def('Direct sun hours and EN 17037 sunlight');
      b.note('Direct sun hours: EN 17037 day check (top) and a year of weather (bottom)', 40, 0, 22);
      const loc = b.node('Rad.Location', 470, 60);
      b.feed(loc, [['Name', b.panel('Seattle', 0, 44)]]);
      const scn = scene(b, 470, 180, 'context.mat\ncontext.rad\nbuilding.rad');
      const grd = grid(b, 470, 290, 'window_points.pts', 'Window points');
      const per = b.node('Rad.Period', 470, 370);
      b.feed(per, [['SM', b.slider('Start month', 3, 1, 12, 0, 190)], ['SD', b.slider('Start day', 21, 1, 31, 0, 190)],
        ['EM', b.slider('End month', 3, 1, 12, 0, 190)], ['ED', b.slider('End day', 21, 1, 31, 0, 190)]], 46);
      const sh = b.node('Rad.SunHours', 1000, 120, {}, 'EN 17037');
      b.wire(loc, 0, sh, 'Site').wire(scn, 0, sh, 'Scene').wire(grd, 0, sh, 'Grid').wire(per, 0, sh, 'Per');
      b.feed(sh, [['Step', b.list('Time step', [60, 30, 15, 10, 5].map((m) => ({ label: m + ' min', value: m })), 3, 150)],
        ['MinAlt', b.slider('Min altitude', 10, 0, 30, 1, 190)],
        ['Check', b.list('Check', [{ label: 'Hours only', value: 'none' }, { label: 'EN 17037 sunlight exposure', value: 'en17037' }], 1, 230)],
        ['Out', b.panel('en17037_sun.txt', 0, 44, 'Result')]], 40);
      const epw = weather(b, 470, 560);
      const yr = b.node('Rad.SunHours', 1000, 520, {}, 'Year');
      b.wire(epw, 0, yr, 'Site').wire(scn, 0, yr, 'Scene').wire(grd, 0, yr, 'Grid');
      b.feed(yr, [['Wx', b.toggle('Weather', true)], ['Out', b.panel('sunhours_year.txt', 0, 44, 'Result')], ['Proc', b.slider('Processes', 8, 1, 32, 0, 190)]], 40);
      writer(b, 1500, 300, [sh, yr], 'direct_sun_hours.bat');
      return b.doc;
    }
  });

  /* == annual metrics with LEED and EN 17037 == */
  add({
    id: 'metrics', name: 'Annual metrics, LEED v4.1 and EN 17037',
    desc: 'A two-phase DDS annual run, then DA, cDA, UDI, sDA and ASE with LEED v4.1 option 1 points, and the EN 17037 daylight provision level from the same result.',
    build() {
      const b = new Def('Annual metrics, LEED v4.1 and EN 17037');
      b.note('Annual illuminance (DDS), then metrics with LEED v4.1 option 1 and EN 17037', 40, 0, 22);
      const epw = weather(b, 470, 60);
      const scn = scene(b, 470, 140, 'envelope.mat\nenvelope.rad');
      const blk = scene(b, 470, 240, 'envelope.blk\nenvelope.rad', 'Black', 'Black files');
      const grd = grid(b, 470, 340, '0.pts');
      const par = params(b, 470, 420, 0, [['ab', b.slider('ab', 4, 0, 12, 0)], ['ad', b.slider('ad', 4096, 0, 8192, 0)], ['lw', b.slider('lw', 0.0002, 0, 0.01, 4)]]);
      const ann = b.node('Rad.Annual', 1000, 140);
      b.wire(epw, 0, ann, 'EPW').wire(scn, 0, ann, 'Scene').wire(blk, 0, ann, 'Black').wire(grd, 0, ann, 'Grid').wire(par, 0, ann, 'Par');
      b.feed(ann, [['Proc', b.slider('Processes', 8, 1, 32, 0, 190)]], 40);
      const occ = b.node('Rad.Schedule', 1180, 60);
      const leed = b.node('Post.Metrics', 1560, 100, {}, 'LEED');
      b.wire(ann, 0, leed, 'Ill').wire(occ, 0, leed, 'Occ');
      b.feed(leed, [['Check', b.list('Check', [{ label: 'Metrics only', value: 'none' }, { label: 'LEED v4.1 option 1', value: 'leed' }, { label: 'EN 17037 daylight provision', value: 'en17037' }], 1, 240)],
        ['Pre', b.panel('leed', 0, 44, 'Prefix')]], 40);
      const en = b.node('Post.Metrics', 1560, 420, {}, 'EN 17037');
      b.wire(ann, 0, en, 'Ill');
      b.feed(en, [['Check', b.list('Check', [{ label: 'Metrics only', value: 'none' }, { label: 'LEED v4.1 option 1', value: 'leed' }, { label: 'EN 17037 daylight provision', value: 'en17037' }], 2, 240)],
        ['Pre', b.panel('en17037', 0, 44, 'Prefix')]], 40);
      writer(b, 1900, 260, [leed, en], 'annual_metrics.bat');
      return b.doc;
    }
  });

  /* == LEED option 2 == */
  add({
    id: 'leed2', name: 'LEED v4.1 option 2 (9 am and 3 pm)',
    desc: 'Illuminance under clear skies at 9 am and 3 pm on 21 September, the share of sensors between 300 and 3000 lux at both times, and the LEED points.',
    build() {
      const b = new Def('LEED v4.1 option 2');
      b.note('LEED v4.1 EQ Daylight option 2: illuminance at 9 am and 3 pm', 40, 0, 22);
      const loc = b.node('Rad.Location', 470, 60);
      b.feed(loc, [['Name', b.panel('Seattle', 0, 44)]]);
      const scn = scene(b, 470, 180, 'envelope.mat\nenvelope.rad');
      const grd = grid(b, 470, 280, '0.pts', 'Regularly occupied area');
      const par = params(b, 470, 360, 2, [['ab', b.slider('ab', 5, 0, 12, 0)]]);
      const leed = b.node('Rad.LEED', 1000, 140);
      b.wire(loc, 0, leed, 'Loc').wire(scn, 0, leed, 'Scene').wire(grd, 0, leed, 'Grid').wire(par, 0, leed, 'Par');
      b.feed(leed, [['M', b.slider('Month', 9, 1, 12, 0, 190)], ['D', b.slider('Day', 21, 1, 31, 0, 190)], ['Glare', b.toggle('Glare control', false)]], 40);
      writer(b, 1360, 160, [leed], 'leed_option2.bat');
      return b.doc;
    }
  });

  /* == rendering, falsecolor, tone mapping and glare == */
  add({
    id: 'imagepost', name: 'Render, falsecolor, export and glare',
    desc: 'A fisheye rendering under a CIE sky, then a falsecolor image with contour bands, a human-vision BMP, and DGP and UGR from evalglare.',
    build() {
      const b = new Def('Render, falsecolor, export and glare');
      b.note('Fisheye render, then falsecolor, tone mapping and glare indices', 40, 0, 22);
      const loc = b.node('Rad.Location', 300, 60);
      const sky = b.node('Rad.Gensky', 700, 40);
      b.wire(loc, 0, sky, 'Loc');
      b.feed(sky, [['M', b.slider('Month', 12, 1, 12, 0, 190)], ['D', b.slider('Day', 21, 1, 31, 0, 190)], ['H', b.slider('Hour', 14, 0, 24, 2, 190)]], 40);
      const view = b.node('Rad.View', 700, 260);
      b.feed(view, [['Type', b.list('View type', [{ label: 'Perspective', value: 'v' }, { label: 'Hemispherical fisheye', value: 'h' }, { label: 'Angular fisheye', value: 'a' }], 1, 210)],
        ['vp', b.panel('3 2 1.2', 0, 44, 'Eye')], ['vd', b.panel('0 1 0', 0, 44, 'Direction')]], 40);
      const scn = scene(b, 700, 420, 'envelope.mat\nenvelope.rad');
      const img = b.node('Rad.Image', 700, 520);
      b.feed(img, [['Res', b.slider('Resolution', 1500, 64, 8192, 0)]], 40);
      const ren = b.node('Rad.Render', 1060, 260);
      b.wire(scn, 0, ren, 'Scene').wire(sky, 0, ren, 'Sky').wire(view, 0, ren, 'View').wire(img, 0, ren, 'Img');
      b.feed(ren, [['Tag', b.panel('dec21_14h', 0, 44, 'Tag')]], 40);
      const fc = b.node('Post.Falsecolor', 1460, 40);
      b.wire(ren, 0, fc, 'Img');
      b.feed(fc, [['Max', b.slider('Scale', 3000, 100, 10000, 0, 190)],
        ['Style', b.list('Style', [{ label: 'Filled', value: 'none' }, { label: 'Contour lines', value: 'lines' }, { label: 'Contour bands', value: 'bands' }], 2, 170)],
        ['Over', b.toggle('Overlay', true)], ['Fmt', b.list('Format', [{ label: 'HDR only', value: 'hdr' }, { label: 'BMP', value: 'bmp' }, { label: 'TIFF', value: 'tif' }], 1, 150)],
        ['Out', b.panel('luminance_fc.hdr', 0, 44, 'Output')]], 40);
      const tm = b.node('Post.ToneMap', 1460, 340);
      b.wire(ren, 0, tm, 'Img');
      b.feed(tm, [['Out', b.panel('luminance_human.bmp', 0, 44, 'Output')]], 40);
      const gl = b.node('Post.Glare', 1460, 480);
      b.wire(ren, 0, gl, 'Img');
      b.feed(gl, [['Out', b.panel('glare_dec21.txt', 0, 44, 'Output')]], 40);
      writer(b, 1820, 260, [fc, tm, gl], 'render_post.bat');
      return b.doc;
    }
  });

  /* == annual glare (dcglare) == */
  add({
    id: 'annualglare', name: 'Annual glare autonomy (dcglare)',
    desc: 'Hourly DGP and glare autonomy below DGP 0.4 for a set of views, from direct and total daylight coefficients and the sky matrix.',
    build() {
      const b = new Def('Annual glare autonomy (dcglare)');
      b.note('Annual glare: hourly DGP and glare autonomy with dcglare', 40, 0, 22);
      const epw = weather(b, 470, 60);
      const scn = scene(b, 470, 140, 'envelope.mat\nenvelope.rad');
      const views = b.node('Rad.Grid', 470, 240, {}, 'Views');
      b.feed(views, [['Pts', b.panel('views.pts', 0, 44, 'Views (x y z dx dy dz)')]]);
      const occ = b.node('Rad.Schedule', 470, 320);
      const ag = b.node('Rad.AnnualGlare', 1000, 120);
      b.wire(epw, 0, ag, 'EPW').wire(scn, 0, ag, 'Scene').wire(views, 0, ag, 'Views').wire(occ, 0, ag, 'Occ');
      b.feed(ag, [['Limit', b.slider('DGP limit', 0.4, 0, 1, 2, 190)], ['Proc', b.slider('Processes', 8, 1, 32, 0, 190)]], 40);
      writer(b, 1360, 140, [ag], 'annual_glare.bat');
      return b.doc;
    }
  });

  /* == matrix methods with BSDFs == */
  add({
    id: 'phases', name: 'Three- to six-phase with BSDFs',
    desc: 'Window group with a BSDF made by genBSDF from blind geometry and a facade aperture around an overhang. Switch Method to three-, four-, five- or six-phase; metrics use the direct sun result of five- and six-phase for ASE.',
    build() {
      const b = new Def('Three- to six-phase with BSDFs');
      b.note('Matrix methods: one window group, a genBSDF blind, and a facade aperture', 40, 0, 22);
      const bsdf = b.node('Rad.BSDF', 470, 60);
      b.feed(bsdf, [['XML', b.panel('blinds45.xml', 0, 44, 'BSDF file')], ['Geo', b.panel('blinds.mat\nblinds45.rad', 0, 0, 'Blind geometry')]]);
      const win = b.node('Rad.Aperture', 470, 230);
      b.wire(bsdf, 0, win, 'BSDF');
      b.feed(win, [['Glz', b.panel('south_glazing.rad', 0, 44, 'Glazing')], ['Name', b.panel('south', 0, 44, 'Group')],
        ['F', b.panel('south_facade.rad', 0, 44, 'Facade aperture')]]);
      const epw = weather(b, 470, 400);
      const scn = scene(b, 470, 480, 'room.mat\nroom.rad\noverhang.rad', 'Room', 'Room, no glazing');
      const blk = scene(b, 470, 590, 'room.blk\nroom.rad\noverhang.rad', 'Black', 'Black room');
      const grd = grid(b, 470, 700, 'workplane.pts');
      const ann = b.node('Rad.Annual', 1000, 300);
      b.wire(epw, 0, ann, 'EPW').wire(scn, 0, ann, 'Scene').wire(blk, 0, ann, 'Black').wire(grd, 0, ann, 'Grid').wire(win, 0, ann, 'Ap');
      b.feed(ann, [['Method', b.list('Method', ['three', 'four', 'five', 'six'].map((k) => ({ label: B.METHODS[k].label, value: k })), 2, 300)],
        ['Proc', b.slider('Processes', 8, 1, 32, 0, 190)]], 40);
      const met = b.node('Post.Metrics', 1380, 300);
      b.wire(ann, 0, met, 'Ill');
      b.feed(met, [['Pre', b.panel('phases', 0, 44, 'Prefix')]], 40);
      writer(b, 1720, 300, [met], 'matrix_methods.bat');
      return b.doc;
    }
  });

  /* == electric lighting: IES, scenes and UGR == */
  add({
    id: 'lighting', name: 'IES luminaires, scenes and UGR',
    desc: 'Two luminaire groups from IES files placed with xform, illuminance from both, three dimming scenes, and a fisheye rendering with UGR from evalglare.',
    build() {
      const b = new Def('IES luminaires, scenes and UGR');
      b.note('Electric lighting: IES import, lighting scenes and UGR', 40, 0, 22);
      const dl = b.node('Rad.IES', 470, 60, {}, 'Downlights');
      b.feed(dl, [['IES', b.panel('downlight.ies', 0, 44, 'IES')], ['Pos', b.panel('1.5 1.5 2.7\n4.5 1.5 2.7\n1.5 4.5 2.7\n4.5 4.5 2.7', 0, 0, 'Positions')]]);
      const ww = b.node('Rad.IES', 470, 250, {}, 'Wallwash');
      b.feed(ww, [['IES', b.panel('wallwasher.ies', 0, 44, 'IES')], ['Pos', b.panel('0.4 1 2.7\n0.4 3 2.7\n0.4 5 2.7', 0, 0, 'Positions')],
        ['Rot', b.slider('Rotation', 90, 0, 360, 0, 190)]]);
      const scn = scene(b, 470, 470, 'office.mat\noffice.rad');
      const grd = grid(b, 470, 570, 'workplane.pts');
      const par = params(b, 470, 650, 2, [['ab', b.slider('ab', 4, 0, 12, 0)]]);
      const el = b.node('Rad.Electric', 1000, 60);
      b.wire(scn, 0, el, 'Scene').wire(dl, 0, el, 'Lum').wire(ww, 0, el, 'Lum').wire(grd, 0, el, 'Grid').wire(par, 0, el, 'Par');
      b.feed(el, [['Out', b.panel('electric_lux.txt', 0, 44, 'Result')], qtyList(b, ['rgb', 'illuminance', 'irradiance'], 1)], 40);
      const sc = b.node('Rad.Scenes', 1000, 300);
      b.wire(scn, 0, sc, 'Scene').wire(dl, 0, sc, 'Grp').wire(ww, 0, sc, 'Grp').wire(grd, 0, sc, 'Grid').wire(par, 0, sc, 'Par');
      b.feed(sc, [['Lvl', b.panel('1 1\n1 0\n0.3 0.5', 80, 0, 'Levels')], ['Names', b.panel('full\ntask\nevening', 0, 0, 'Names')]], 40);
      const view = b.node('Rad.View', 1000, 560);
      b.feed(view, [['Type', b.list('View type', [{ label: 'Perspective', value: 'v' }, { label: 'Hemispherical fisheye', value: 'h' }], 1, 210)],
        ['vp', b.panel('3 0.8 1.2', 0, 44, 'Eye')], ['vd', b.panel('0 1 0', 0, 44, 'Direction')]], 40);
      const ren = b.node('Rad.Render', 1360, 420);
      b.wire(scn, 0, ren, 'Scene').wire(dl, 0, ren, 'Lum').wire(ww, 0, ren, 'Lum').wire(view, 0, ren, 'View');
      b.feed(ren, [['Tag', b.panel('ugr', 0, 44, 'Tag')]], 40);
      const gl = b.node('Post.Glare', 1720, 420);
      b.wire(ren, 0, gl, 'Img');
      b.feed(gl, [['Out', b.panel('ugr.txt', 0, 44, 'Output')]], 40);
      writer(b, 2060, 220, [el, sc, gl], 'electric_lighting.bat');
      return b.doc;
    }
  });

  /* == photon map and mkillum == */
  add({
    id: 'advanced', name: 'Photon map and mkillum',
    desc: 'Top: illuminance with a photon map entering through the window ports. Bottom: a rendering with the windows turned into illum sources by mkillum.',
    build() {
      const b = new Def('Photon map and mkillum');
      b.note('Photon mapping (top) and mkillum secondary sources (bottom)', 40, 0, 22);
      const loc = b.node('Rad.Location', 300, 60);
      const sky = b.node('Rad.Gensky', 700, 40);
      b.wire(loc, 0, sky, 'Loc');
      b.feed(sky, [['H', b.slider('Hour', 10, 0, 24, 2, 190)]], 40);
      const scn = scene(b, 700, 260, 'room.mat\nroom.rad\nwindows.rad');
      const grd = grid(b, 700, 360, 'workplane.pts');
      const pm = b.node('Rad.PhotonMap', 700, 440);
      b.feed(pm, [['Glob', b.panel('2m', 0, 44, 'Global photons')], ['Ports', b.panel('glass_mat', 0, 44, 'Port modifiers')]], 40);
      const pit = b.node('Rad.PIT', 1060, 200, {}, 'PIT pmap');
      b.wire(scn, 0, pit, 'Scene').wire(sky, 0, pit, 'Sky').wire(grd, 0, pit, 'Grid').wire(pm, 0, pit, 'Par');
      b.feed(pit, [['Out', b.panel('pmap_lux.txt', 0, 44, 'Result')], qtyList(b, ['rgb', 'illuminance'], 1)], 40);
      const room = scene(b, 700, 640, 'room.mat\nroom.rad', 'Room', 'Room, no windows');
      const il = b.node('Rad.Illum', 1060, 620);
      b.wire(room, 0, il, 'Scene').wire(sky, 0, il, 'Sky');
      b.feed(il, [['Win', b.panel('windows.rad', 0, 44, 'Windows')]], 40);
      const view = b.node('Rad.View', 1060, 780);
      b.feed(view, [['vp', b.panel('3 1 1.6', 0, 44, 'Eye')], ['vd', b.panel('0 1 0', 0, 44, 'Direction')]], 40);
      const ren = b.node('Rad.Render', 1420, 640);
      b.wire(il, 0, ren, 'Scene').wire(sky, 0, ren, 'Sky').wire(view, 0, ren, 'View');
      b.feed(ren, [['Tag', b.panel('illum', 0, 44, 'Tag')]], 40);
      writer(b, 1760, 300, [pit, ren], 'photonmap_mkillum.bat');
      return b.doc;
    }
  });

  /* == annual images and animation == */
  add({
    id: 'imaging', name: 'Annual images, animation and layers',
    desc: 'Image-based daylight coefficients for a few hours with DGP for each image, a walkthrough between two views exported to BMP frames, and rtpict image layers.',
    build() {
      const b = new Def('Annual images, animation and layers');
      b.note('Annual images (top), animation and image layers (bottom)', 40, 0, 22);
      const epw = weather(b, 470, 60);
      const scn = scene(b, 470, 140, 'envelope.mat\nenvelope.rad');
      const fish = b.node('Rad.View', 470, 240, {}, 'Fisheye');
      b.feed(fish, [['Type', b.list('View type', [{ label: 'Perspective', value: 'v' }, { label: 'Hemispherical fisheye', value: 'h' }], 1, 210)],
        ['vp', b.panel('3 2 1.2', 0, 44, 'Eye')], ['vd', b.panel('0 1 0', 0, 44, 'Direction')]]);
      const per = b.node('Rad.Period', 470, 420);
      b.feed(per, [['SM', b.slider('Start month', 6, 1, 12, 0, 190)], ['SD', b.slider('Start day', 21, 1, 31, 0, 190)],
        ['SH', b.slider('Start hour', 9, 0, 23, 0, 190)], ['EM', b.slider('End month', 6, 1, 12, 0, 190)], ['ED', b.slider('End day', 21, 1, 31, 0, 190)],
        ['EH', b.slider('End hour', 16, 0, 23, 0, 190)]], 46);
      const ai = b.node('Rad.AnnualImages', 1000, 120);
      b.wire(epw, 0, ai, 'EPW').wire(scn, 0, ai, 'Scene').wire(fish, 0, ai, 'View').wire(per, 1, ai, 'Hrs');
      const gl = b.node('Post.Glare', 1360, 60);
      b.wire(ai, 0, gl, 'Img');
      b.feed(gl, [['Out', b.panel('glare_june21.txt', 0, 44, 'Output')]], 40);
      const fc = b.node('Post.Falsecolor', 1360, 240);
      b.wire(ai, 0, fc, 'Img');
      b.feed(fc, [['Out', b.panel('june21_fc.hdr', 0, 44, 'Output')]], 40);
      const v1 = b.node('Rad.View', 470, 700, {}, 'Start');
      b.feed(v1, [['vp', b.panel('1 1 1.6', 0, 44, 'Eye')], ['vd', b.panel('1 1 0', 0, 44, 'Direction')]]);
      const v2 = b.node('Rad.View', 470, 860, {}, 'End');
      b.feed(v2, [['vp', b.panel('5 4 1.6', 0, 44, 'Eye')], ['vd', b.panel('0 1 0', 0, 44, 'Direction')]]);
      const sky = b.node('Rad.Gensky', 470, 1000);
      const loc = b.node('Rad.Location', 160, 1010);
      b.wire(loc, 0, sky, 'Loc');
      const an = b.node('Rad.Animation', 1000, 760);
      b.wire(scn, 0, an, 'Scene').wire(sky, 0, an, 'Sky').wire(v1, 0, an, 'Views').wire(v2, 0, an, 'Views');
      b.feed(an, [['Frames', b.slider('Frames', 72, 2, 600, 0, 190)]], 40);
      const tm = b.node('Post.ToneMap', 1360, 760);
      b.wire(an, 0, tm, 'Img');
      b.feed(tm, [['Out', b.panel('walkthrough.bmp', 0, 44, 'Output')]], 40);
      const ren = b.node('Rad.Render', 1000, 1000, {}, 'Layers');
      b.wire(scn, 0, ren, 'Scene').wire(sky, 0, ren, 'Sky').wire(v2, 0, ren, 'View');
      b.feed(ren, [['Lay', b.panel('vlnm', 0, 44, 'Layers')], ['Proc', b.slider('Processes', 8, 1, 32, 0, 190)]], 40);
      writer(b, 1720, 420, [gl, fc, tm, ren], 'imaging.bat');
      return b.doc;
    }
  });

  /* == spectral PPFD == */
  add({
    id: 'ppfd', name: 'Spectral PAR and PPFD',
    desc: 'Photosynthetic photon flux density at plant level from a spectral rtrace run over 400 to 700 nm (PAR times 4.57), with statistics.',
    build() {
      const b = new Def('Spectral PAR and PPFD');
      b.note('PPFD for plants from a spectral simulation (400 to 700 nm)', 40, 0, 22);
      const scn = scene(b, 470, 60, 'greenhouse_spectral.rad\nglazing1.rad\nenvelope.rad');
      const grd = grid(b, 470, 180, 'canopy.pts', 'Canopy points');
      const sp = b.node('Rad.Spectral', 470, 260);
      b.feed(sp, [['Bands', b.slider('Bands', 15, 3, 24, 0)],
        ['Out', b.list('Output', [{ label: 'All bands (-co+)', value: 'co' }, { label: 'PAR (W/m2)', value: 'PAR' }, { label: 'PPFD (umol/m2/s)', value: 'PPFD' }], 2, 190)]]);
      const sky = b.node('Rad.Genssky', 470, 400);
      const loc = b.node('Rad.Location', 160, 420);
      b.wire(loc, 0, sky, 'Loc');
      const run = b.node('Rad.SpecPIT', 1000, 160);
      b.wire(scn, 0, run, 'Scene').wire(sky, 0, run, 'Sky').wire(grd, 0, run, 'Grid').wire(sp, 0, run, 'Spec');
      b.feed(run, [['Out', b.panel('ppfd.txt', 0, 44, 'Result')]], 40);
      const st = b.node('Post.Stats', 1360, 160);
      b.wire(run, 0, st, 'Res');
      b.feed(st, [['Thr', b.panel('200\n400', 60, 0, 'umol/m2/s')], ['Unit', b.panel('umol/m2/s', 0, 44, 'Unit')], ['Pre', b.panel('ppfd_stats', 0, 44, 'Prefix')]], 40);
      writer(b, 1720, 160, [st], 'spectral_ppfd.bat');
      return b.doc;
    }
  });
})(window.VR);
