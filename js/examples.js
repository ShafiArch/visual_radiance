/* Visual Radiance: example definitions. Six of them rebuild the reference batch
   files in /reference; tests/check-reference.js compares the output line by line. */
(function (VR) {
  'use strict';
  const ROW = 18;
  const PAD = 6;

  const compH = (type) => {
    const s = VR.components[type];
    if (!s) return 44;
    return Math.max(Math.max(s.inputs.length, s.outputs.length, 1) * ROW + 2 * PAD, 44);
  };
  const inY = (type, i) => {
    const s = VR.components[type];
    const h = compH(type);
    return PAD + (i + 0.5) * (h - 2 * PAD) / s.inputs.length;
  };

  class Def {
    constructor(name) {
      this.doc = { app: 'Visual Radiance', version: 1, name, view: { x: 30, y: 30, zoom: 0.8 }, nodes: [], wires: [], groups: [] };
      this.count = 0;
    }
    get(id) { return this.doc.nodes.find((n) => n.id === id); }
    node(type, x, y, state, nick) {
      this.count += 1;
      const id = 'x' + this.count;
      this.doc.nodes.push({ id, type, x: Math.round(x), y: Math.round(y), nick: nick || VR.components[type].nick, state: state || {} });
      return id;
    }
    idx(id, name) {
      const n = this.get(id);
      const spec = VR.components[n.type];
      if (typeof name === 'number') return name;
      const i = spec.inputs.findIndex((p) => p.nick === name || p.name === name);
      if (i < 0) throw new Error('No input "' + name + '" on ' + n.type);
      return i;
    }
    wire(from, out, to, input) {
      this.doc.wires.push({ from, out, to, in: this.idx(to, input) });
      return this;
    }
    group(name, ids, color) {
      this.doc.groups.push({ id: 'g' + (this.doc.groups.length + 1), name, color: color || 'blue', members: ids });
    }
    note(text, x, y, size) { return this.node('Scribble', x, y, { text, size: size || 20 }); }

    // feeder factories (sizes are estimates used for layout)
    slider(nick, value, min, max, dec, w) {
      return { type: 'NumberSlider', nick, w: w || 230, h: 24,
        state: { value, min, max, decimals: dec || 0, mode: dec ? 'R' : 'N', w: w || 230 } };
    }
    panel(text, w, h, nick) {
      const rows = String(text).split('\n');
      const hh = h || Math.max(44, 30 + rows.length * 17);
      const need = Math.round(Math.max.apply(null, rows.map((r) => r.length)) * 7.3 + 22);
      const ww = Math.max(w || 0, Math.min(need, 560));
      return { type: 'Panel', nick: nick || 'Panel', w: ww, h: hh, state: { text, w: ww, h: hh, multiline: true } };
    }
    toggle(nick, value) { return { type: 'Toggle', nick, w: Math.round(nick.length * 7 + 80), h: 24, state: { value: !!value } }; }
    button(nick) { return { type: 'Button', nick, w: 120, h: 24, state: {} }; }
    list(nick, items, index, w) {
      const est = Math.round(nick.length * 7 + 16 + Math.max.apply(null, items.map((it) => it.label.length)) * 6.6 + 50);
      return { type: 'ValueList', nick, w: Math.max(w || 0, est), h: 24, state: { items, index: index || 0, mode: 'dropdown' } };
    }
    md(nick, x, y, xmin, xmax, ymin, ymax, dec, size) {
      const s = size || 140;
      return { type: 'MDSlider', nick, w: s + 16, h: s + 50,
        state: { x, y, xmin, xmax, ymin, ymax, decimals: dec || 0, size: s } };
    }

    // Place feeders to the left of a component, next to the inputs they feed.
    feed(target, items, gap) {
      const t = this.get(target);
      let next = -Infinity;
      return items.map(([input, f]) => {
        const i = this.idx(target, input);
        const cy = t.y + inY(t.type, i);
        const y = Math.max(cy - f.h / 2, next);
        const id = this.node(f.type, t.x - (gap || 46) - f.w, y, f.state, f.nick);
        this.wire(id, 0, target, i);
        next = y + f.h + 8;
        return id;
      });
    }
  }

  const presets = () => [
    { label: 'None', value: 'none' }, { label: 'Low', value: 'low' },
    { label: 'Medium', value: 'medium' }, { label: 'High', value: 'high' }];
  const flags = (b, writer, list) => b.feed(writer, list.map(([nick, v]) => [nick, b.toggle(nick, v)]));

  VR.examples = [];
  const add = (o) => VR.examples.push(o);

  /* == quick start == */
  add({
    id: 'quickstart', name: 'Quick start: illuminance under a CIE sky',
    desc: 'A small point-in-time study: gensky sky, scene, sensor grid, medium preset with one override, and a Batch Writer.',
    build() {
      const b = new Def('Quick start');
      b.note('Point-in-time illuminance under a CIE sky', 40, 10, 22);
      const loc = b.node('Rad.Location', 230, 80);
      b.feed(loc, [['Name', b.panel('Seattle', 120, 44)]]);
      const sky = b.node('Rad.Gensky', 720, 60);
      b.wire(loc, 0, sky, 'Loc');
      b.feed(sky, [['M', b.slider('Month', 6, 1, 12, 0, 190)], ['D', b.slider('Day', 21, 1, 31, 0, 190)],
        ['H', b.slider('Hour', 12, 0, 24, 2, 190)],
        ['Type', b.list('Sky type', [{ label: 'Sunny with sun', value: '+s' }, { label: 'Sunny, no sun', value: '-s' },
          { label: 'Intermediate with sun', value: '+i' }, { label: 'Overcast', value: '-c' }], 0, 190)]], 40);
      const scene = b.node('Rad.Scene', 720, 300);
      b.feed(scene, [['Files', b.panel('envelope.mat\nenvelope.rad', 170)]], 40);
      const grid = b.node('Rad.Grid', 720, 400);
      b.feed(grid, [['Pts', b.panel('0.pts', 120, 44)]], 40);
      const par = b.node('Rad.Params', 720, 480);
      b.feed(par, [['Preset', b.list('Preset', presets(), 2, 150)], ['ab', b.slider('ab', 4, 0, 12, 0, 190)]], 40);
      const pit = b.node('Rad.PIT', 1060, 300);
      b.wire(scene, 0, pit, 'Scene').wire(sky, 0, pit, 'Sky').wire(grid, 0, pit, 'Grid').wire(par, 0, pit, 'Par');
      b.feed(pit, [['Out', b.panel('illuminance.txt', 150, 44)], ['Lux', b.toggle('Lux', true)]], 40);
      const bat = b.node('Bat.Writer', 1440, 300);
      b.wire(pit, 0, bat, 'Scr');
      b.feed(bat, [['Name', b.panel('pit_illuminance.bat', 170, 44)]], 40);
      b.feed(bat, [['Pause', b.toggle('Pause', true)]], 40);
      const view = b.node('Panel', 1680, 230, { text: '', w: 620, h: 380 }, 'Batch file');
      b.wire(bat, 0, view, 0);
      return b.doc;
    }
  });

  /* == annual illuminance (reference: Annual_Illuminance_run_part0.bat) == */
  add({
    id: 'annual', name: 'Annual illuminance (part 0)', reference: 'Annual_Illuminance_run_part0.bat',
    expectWarnings: ['-lw 0.001 is above 1/-ad'],
    desc: 'Daylight coefficients with rfluxmtx, gendaymtx sky matrices and direct sun coefficients, as in Annual_Illuminance_run_part0.bat.',
    build() {
      const b = new Def('Annual illuminance (part 0)');
      b.note('Annual illuminance: daylight coefficients plus direct sun', 40, 0, 22);
      const epw = b.node('Rad.Weather', 470, 60);
      b.feed(epw, [['EPW', b.panel('USA_WA_Seattle-Tacoma.Intl.AP.727930_TMYx.2004-2018.epw', 380, 44, 'Weather file')]]);
      const scene = b.node('Rad.Scene', 470, 140);
      b.feed(scene, [['Files', b.panel('envelope.mat\nenvelope.rad', 170, 0, 'Scene files')]]);
      const black = b.node('Rad.Scene', 470, 240, {}, 'Black');
      b.feed(black, [['Files', b.panel('envelope.blk\nenvelope.rad', 170, 0, 'Black files')]]);
      const rx = b.node('Rad.Receiver', 470, 340);
      b.feed(rx, [['MF', b.list('Sky density', [{ label: 'Tregenza 145', value: 1 }, { label: 'Reinhart 577', value: 2 },
        { label: 'Reinhart 2305', value: 4 }, { label: 'Reinhart 5185', value: 6 }], 0, 200)],
      ['File', b.panel('skyglow.rad', 130, 44, 'Receiver')], ['Write', b.toggle('Write', false)]]);
      const grid = b.node('Rad.Grid', 470, 500);
      b.feed(grid, [['Pts', b.panel('0_part0.pts', 130, 44, 'Points')], ['N', b.slider('Sensors', 429, 1, 2000, 0)]]);
      const par = b.node('Rad.Params', 470, 600);
      b.feed(par, [['Preset', b.list('Preset', presets(), 0, 150)], ['ab', b.slider('ab', 3, 0, 12, 0)],
        ['ad', b.slider('ad', 2048, 0, 8192, 0)], ['lw', b.slider('lw', 0.001, 0, 0.01, 4)]]);
      const ann = b.node('Rad.Annual', 900, 220);
      b.wire(epw, 0, ann, 'EPW').wire(scene, 0, ann, 'Scene').wire(black, 0, ann, 'Black').wire(rx, 0, ann, 'Rx')
        .wire(grid, 0, ann, 'Grid').wire(par, 0, ann, 'Par');
      b.feed(ann, [['SunMF', b.slider('Sun density', 6, 1, 6, 0, 200)], ['Part', b.slider('Part', 0, 0, 16, 0, 200)],
        ['Proc', b.slider('Processes', 4, 1, 32, 0, 200)]], 40);
      const bat = b.node('Bat.Writer', 1440, 220);
      b.wire(ann, 0, bat, 'Scr');
      b.feed(bat, [['Name', b.panel('Annual_Illuminance_run_part0.bat', 250, 44, 'File name')]], 40);
      flags(b, bat, [['Here', false], ['REM', false]]);
      const view = b.node('Panel', 1690, 120, { text: '', w: 760, h: 420 }, 'Batch file');
      b.wire(bat, 0, view, 0);
      return b.doc;
    }
  });

  /* == electric illuminance (reference: Electric_Illuminance_run_simulation.bat) == */
  add({
    id: 'electric', name: 'Electric illuminance', reference: 'Electric_Illuminance_run_simulation.bat',
    desc: 'Luminaires only, rtrace -I at sensor points with an ambient cache, as in Electric_Illuminance_run_simulation.bat.',
    build() {
      const b = new Def('Electric illuminance');
      b.note('Electric lighting: luminaires only, rtrace -I', 40, 0, 22);
      const scene = b.node('Rad.Scene', 470, 60);
      b.feed(scene, [['Files', b.panel('envelope.mat\nenvelope.rad', 170, 0, 'Scene files')], ['Oct', b.panel('model.oct', 110, 44, 'Octree')]]);
      const grid = b.node('Rad.Grid', 470, 200);
      b.feed(grid, [['Pts', b.panel('0.pts', 110, 44, 'Points')]]);
      const par = b.node('Rad.Params', 470, 280);
      b.feed(par, [['Preset', b.list('Preset', presets(), 0, 150)], ['ab', b.slider('ab', 1, 0, 12, 0)],
        ['ad', b.slider('ad', 512, 0, 8192, 0)], ['as', b.slider('as', 64, 0, 8192, 0)], ['ar', b.slider('ar', 48, 0, 1024, 0)],
        ['aa', b.slider('aa', 0.18, 0, 0.5, 2)], ['lr', b.slider('lr', 4, 0, 16, 0)], ['lw', b.slider('lw', 0.0003, 0, 0.01, 4)],
        ['dj', b.slider('dj', 0, 0, 1, 2)], ['ds', b.slider('ds', 0, 0, 1, 2)], ['dt', b.slider('dt', 0.15, 0, 1, 2)],
        ['st', b.slider('st', 0.2, 0, 1, 2)], ['aw', b.slider('aw', 0, 0, 1024, 0)]]);
      const el = b.node('Rad.Electric', 900, 180);
      b.wire(scene, 0, el, 'Scene').wire(grid, 0, el, 'Grid').wire(par, 0, el, 'Par');
      b.feed(el, [['Lum', b.panel('luminaries.rad', 140, 44, 'Luminaires')]], 40);
      b.feed(el, [['Proc', b.slider('Processes', 16, 1, 32, 0, 200)], ['Amb', b.panel('amb.cache', 120, 44, 'Ambient file')]], 40);
      const bat = b.node('Bat.Writer', 1440, 180);
      b.wire(el, 0, bat, 'Scr');
      b.feed(bat, [['Name', b.panel('Electric_Illuminance_run_simulation.bat', 270, 44, 'File name')]], 40);
      flags(b, bat, [['Here', false], ['REM', false]]);
      const view = b.node('Panel', 1690, 120, { text: '', w: 700, h: 260 }, 'Batch file');
      b.wire(bat, 0, view, 0);
      return b.doc;
    }
  });

  /* == point-in-time illuminance (reference: Point_In_Time_Illuminance_run_simulation.bat) == */
  add({
    id: 'pit', name: 'Point-in-time illuminance', reference: 'Point_In_Time_Illuminance_run_simulation.bat',
    desc: 'oconv with an existing sky file, then rtrace -I with a Honeybee-style folder layout, as in Point_In_Time_Illuminance_run_simulation.bat.',
    build() {
      const b = new Def('Point-in-time illuminance');
      b.note('Point-in-time illuminance with an existing sky file', 40, 0, 22);
      const scene = b.node('Rad.Scene', 470, 60);
      b.feed(scene, [['Files', b.panel('model\\scene\\envelope.mat\nmodel\\scene\\envelope.rad', 230, 0, 'Scene files')]]);
      const grid = b.node('Rad.Grid', 470, 170);
      b.feed(grid, [['Pts', b.panel('model\\grid\\0.pts', 150, 44, 'Points')]]);
      const par = b.node('Rad.Params', 470, 250);
      b.feed(par, [['Preset', b.list('Preset', presets(), 0, 150)], ['ab', b.slider('ab', 3, 0, 12, 0)],
        ['ad', b.slider('ad', 1024, 0, 8192, 0)], ['ar', b.slider('ar', 64, 0, 1024, 0)],
        ['aa', b.slider('aa', 0.1, 0, 0.5, 2)], ['lr', b.slider('lr', 6, 0, 16, 0)], ['lw', b.slider('lw', 0.0001, 0, 0.01, 4)]]);
      const pit = b.node('Rad.PIT', 900, 160);
      b.wire(scene, 0, pit, 'Scene').wire(grid, 0, pit, 'Grid').wire(par, 0, pit, 'Par');
      b.feed(pit, [['Sky', b.panel('sky.rad', 110, 44, 'Sky file')]], 40);
      const bat = b.node('Bat.Writer', 1440, 160);
      b.wire(pit, 0, bat, 'Scr');
      b.feed(bat, [['Name', b.panel('Point_In_Time_Illuminance_run_simulation.bat', 300, 44, 'File name')]], 40);
      flags(b, bat, [['Here', false], ['REM', false]]);
      const view = b.node('Panel', 1690, 100, { text: '', w: 640, h: 240 }, 'Batch file');
      b.wire(bat, 0, view, 0);
      return b.doc;
    }
  });

  /* == point-in-time render (reference: Point_In_Time_Render_run_rpict_4118.bat) == */
  add({
    id: 'render', name: 'Point-in-time render (hour 4118)', reference: 'Point_In_Time_Render_run_rpict_4118.bat',
    desc: 'Fisheye rpict render with a warm-up pass, pfilt and the view in the header, as in Point_In_Time_Render_run_rpict_4118.bat.',
    build() {
      const b = new Def('Point-in-time render (hour 4118)');
      b.note('Point-in-time render: hemispherical fisheye at hour 4118', 40, 0, 22);
      const pt = b.node('Point', 280, 70, {}, 'Eye');
      b.feed(pt, [['X', b.slider('x', 7.9808, -20, 20, 4, 200)], ['Y', b.slider('y', -0.0192, -20, 20, 4, 200)],
        ['Z', b.slider('z', 3.9359, 0, 10, 4, 200)]], 40);
      const view = b.node('Rad.View', 720, 80);
      b.wire(pt, 0, view, 'vp');
      b.feed(view, [['Type', b.list('View type', [{ label: 'Perspective', value: 'v' }, { label: 'Hemispherical fisheye', value: 'h' },
        { label: 'Angular fisheye', value: 'a' }, { label: 'Parallel', value: 'l' }], 1, 210)],
      ['vd', b.panel('-0.9958 -0.0013 -0.0913', 190, 44, 'Direction')],
      ['Size', b.md('View size', 180, 180, 0, 360, 0, 360, 0, 120)]], 46);
      const scene = b.node('Rad.Scene', 720, 420);
      b.feed(scene, [['Files', b.panel('envelope.mat\nenvelope.rad', 170, 0, 'Scene files')]], 46);
      const img = b.node('Rad.Image', 720, 520);
      b.feed(img, [['Res', b.slider('Resolution', 3840, 64, 8192, 0)]], 46);
      const par = b.node('Rad.Params', 720, 640, {}, 'Main');
      b.feed(par, [['Preset', b.list('Preset', presets(), 0, 150)], ['ab', b.slider('ab', 3, 0, 12, 0)],
        ['ad', b.slider('ad', 512, 0, 8192, 0)], ['as', b.slider('as', 128, 0, 8192, 0)], ['ar', b.slider('ar', 128, 0, 1024, 0)],
        ['aa', b.slider('aa', 0.14, 0, 0.5, 2)], ['lr', b.slider('lr', 6, 0, 16, 0)], ['lw', b.slider('lw', 0.0015, 0, 0.01, 4)],
        ['dj', b.slider('dj', 0.6, 0, 1, 2)], ['ds', b.slider('ds', 0.2, 0, 1, 2)], ['av', b.panel('0 0 0', 80, 44, 'av')],
        ['ps', b.slider('ps', 3, 1, 16, 0)], ['pt', b.slider('pt', 0.12, 0, 1, 2)], ['pj', b.slider('pj', 0.85, 0, 1, 2)],
        ['Name', b.panel('quality 4', 100, 44, 'Label')]], 46);
      const warm = b.node('Rad.Params', 720, 1220, {}, 'Warm');
      b.feed(warm, [['Preset', b.list('Preset', presets(), 0, 150)],
        ['Extra', b.panel('-ps 4 -pt 0.15 -pj 0.8 -dj 0.6 -ds 0.25 -dt 0.4 -dc 0.6 -dr 2 -dp 256 -st 0.25\n-ab 3 -ad 256 -as 64 -ar 80 -aa 0.18 -lr 5 -lw 0.002 -av 0 0 0', 440, 60, 'Warm-up options')]], 46);
      const ren = b.node('Rad.Render', 1180, 420);
      b.wire(scene, 0, ren, 'Scene').wire(view, 0, ren, 'View').wire(img, 0, ren, 'Img').wire(par, 0, ren, 'Par').wire(warm, 0, ren, 'WarmPar');
      b.feed(ren, [['Sky', b.panel('sky_4118.rad', 130, 44, 'Sky file')], ['Lum', b.panel('luminaries.rad', 130, 44, 'Luminaires')]], 46);
      b.feed(ren, [['Tag', b.panel('4118', 80, 44, 'Hour')], ['Amb', b.panel('IMG.amb', 100, 44, 'Ambient file')]], 46);
      const bat = b.node('Bat.Writer', 1760, 420);
      b.wire(ren, 0, bat, 'Scr');
      b.feed(bat, [['Name', b.panel('Point_In_Time_Render_run_rpict_4118.bat', 270, 44, 'File name')],
        ['Dir', b.panel('C:\\kybele_UW_Greenhouse_April04\\point_in_time_render', 330, 44, 'Folder')],
        ['Quiet', b.toggle('Quiet', true)]], 46);
      const out = b.node('Panel', 2010, 300, { text: '', w: 760, h: 480 }, 'Batch file');
      b.wire(bat, 0, out, 0);
      return b.doc;
    }
  });

  /* == spectral point-in-time (reference: Spectral_Point_In_Time_run_pt.bat) == */
  add({
    id: 'specpit', name: 'Spectral point-in-time', reference: 'Spectral_Point_In_Time_run_pt.bat',
    desc: 'Spectral materials and sky, rtrace with 21 bands from 380 to 780 nm and -co+, as in Spectral_Point_In_Time_run_pt.bat.',
    build() {
      const b = new Def('Spectral point-in-time');
      b.note('Spectral point-in-time: 21 bands from 380 to 780 nm', 40, 0, 22);
      const scene = b.node('Rad.Scene', 470, 60);
      b.feed(scene, [['Files', b.panel('aluminum_frames_spectrum.rad\nconcrete_spectrum.rad\nground_spectrum.rad\nglazing1.rad\nenvelope.rad', 220, 0, 'Scene files')],
        ['Oct', b.panel('specmodel.oct', 120, 44, 'Octree')]]);
      const grid = b.node('Rad.Grid', 470, 230);
      b.feed(grid, [['Pts', b.panel('0.pts', 100, 44, 'Points')]]);
      const par = b.node('Rad.Params', 470, 310);
      b.feed(par, [['Preset', b.list('Preset', presets(), 2, 150)]]);
      const sp = b.node('Rad.Spectral', 470, 760);
      b.feed(sp, [['Bands', b.slider('Bands', 21, 3, 24, 0)], ['Range', b.md('Wavelengths', 380, 780, 300, 500, 600, 900, 0, 120)],
        ['Out', b.list('Output', [{ label: 'All bands (-co+)', value: 'co' }, { label: 'Photopic Y', value: 'Y' },
          { label: 'Melanopic M', value: 'M' }, { label: 'Scotopic S', value: 'S' }], 0, 170)]]);
      const run = b.node('Rad.SpecPIT', 900, 260);
      b.wire(scene, 0, run, 'Scene').wire(grid, 0, run, 'Grid').wire(par, 0, run, 'Par').wire(sp, 0, run, 'Spec');
      b.feed(run, [['Sky', b.panel('spectralsky.rad', 130, 44, 'Sky file')]], 40);
      b.feed(run, [['Out', b.panel('specgreenhouse.res', 150, 44, 'Result')], ['Amb', b.panel('model.amb', 110, 44, 'Ambient file')],
        ['Log', b.panel('error.log', 100, 44, 'Error log')]], 40);
      const bat = b.node('Bat.Writer', 1440, 260);
      b.wire(run, 0, bat, 'Scr');
      b.feed(bat, [['Name', b.panel('Spectral_Point_In_Time_run_pt.bat', 240, 44, 'File name')]], 40);
      flags(b, bat, [['Here', false], ['REM', false], ['Echo', false]]);
      const view = b.node('Panel', 1690, 180, { text: '', w: 760, h: 220 }, 'Batch file');
      b.wire(bat, 0, view, 0);
      return b.doc;
    }
  });

  /* == spectral annual (reference: Spectral_Annual_Illuminance_K_runPITspec.bat) == */
  add({
    id: 'specannual', name: 'Spectral annual (hour loop)', reference: 'Spectral_Annual_Illuminance_K_runPITspec.bat',
    desc: 'Top: genssky, oconv and rtrace for each hour in a list. Bottom: one hour on an existing octree, as in Spectral_Annual_Illuminance_K_runPITspec.bat.',
    build() {
      const b = new Def('Spectral annual (hour loop)');
      b.note('Spectral annual: one genssky sky, octree and result per hour', 40, 0, 22);
      const epw = b.node('Rad.Weather', 470, 60, {
        file: 'USA_WA_Seattle-Tacoma.Intl.AP.727930_TMYx.2004-2018.epw',
        header: { name: 'Seattle-Tacoma Intl AP, WA, USA', lat: 47.4638, lon: -122.3143, tz: -8, elev: 131 }, hourly: null });
      b.feed(epw, [['EPW', b.panel('USA_WA_Seattle-Tacoma.Intl.AP.727930_TMYx.2004-2018.epw', 380, 44, 'Weather file')]]);
      const scene = b.node('Rad.Scene', 470, 170);
      b.feed(scene, [['Files', b.panel('aluminum_frames_spectrum.rad\nconcrete_spectrum.rad\nground_spectrum.rad\nglazing1.rad\nenvelope.rad', 220, 0, 'Scene files')]]);
      const grid = b.node('Rad.Grid', 470, 320);
      b.feed(grid, [['Pts', b.panel('0.pts', 100, 44, 'Points')]]);
      const par = b.node('Rad.Params', 470, 400);
      b.feed(par, [['Preset', b.list('Preset', presets(), 2, 150)]]);
      const sp = b.node('Rad.Spectral', 470, 850);
      b.feed(sp, [['Bands', b.slider('Bands', 20, 3, 24, 0)]]);
      const ann = b.node('Rad.SpecAnnual', 900, 160);
      b.wire(scene, 0, ann, 'Scene').wire(epw, 0, ann, 'EPW').wire(grid, 0, ann, 'Grid').wire(par, 0, ann, 'Par').wire(sp, 0, ann, 'Spec');
      b.feed(ann, [['Hrs', b.panel('4112-4120', 110, 44, 'Hours')]], 40);
      b.feed(ann, [['Thr', b.slider('Threads', 8, 1, 16, 0, 190)]], 40);
      const bat = b.node('Bat.Writer', 1760, 160);
      b.wire(ann, 0, bat, 'Scr');
      b.feed(bat, [['Name', b.panel('Spectral_Annual_Illuminance.bat', 250, 44, 'File name')]], 40);
      const view = b.node('Panel', 2010, 60, { text: '', w: 860, h: 400 }, 'Batch file');
      b.wire(bat, 0, view, 0);

      b.note('One hour on an existing octree (the per-hour run)', 860, 600, 18);
      const oct = b.node('Rad.Scene', 860, 660, {}, 'Octree');
      b.feed(oct, [['Oct', b.panel('specmodel.oct', 120, 44, 'Existing octree')]], 40);
      const run = b.node('Rad.SpecPIT', 1220, 640);
      b.wire(oct, 0, run, 'Scene').wire(grid, 0, run, 'Grid').wire(par, 0, run, 'Par').wire(sp, 0, run, 'Spec');
      const k = b.node('Bat.Writer', 1760, 640, {}, 'Bat K');
      b.wire(run, 0, k, 'Scr');
      b.feed(run, [['Out', b.panel('specgreenhouse.res', 150, 44, 'Result')], ['Amb', b.panel('model.amb', 110, 44, 'Ambient file')],
        ['Log', b.panel('error.log', 100, 44, 'Error log')]], 40);
      b.feed(k, [['Name', b.panel('Spectral_Annual_Illuminance_K_runPITspec.bat', 300, 44, 'File name')]], 40);
      flags(b, k, [['Here', false], ['REM', false], ['Echo', false]]);
      const view2 = b.node('Panel', 2010, 600, { text: '', w: 860, h: 200 }, 'Batch file K');
      b.wire(k, 0, view2, 0);
      return b.doc;
    },
    writer: 'Bat K'
  });

  VR.Def = Def;
})(window.VR);
