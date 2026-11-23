/* Visual Radiance: input parameters in the style of Grasshopper's Params tab
   (Number Slider, MD Slider, Boolean Toggle, Button, Value List, Panel, File Path). */
(function (VR) {
  'use strict';
  const U = VR.util;
  const T = VR.types;

  // Value of a Number Slider after rounding: R real, N integer, E even, O odd (as in Grasshopper).
  VR.sliderValue = function (st) {
    let v = U.clamp(Number(st.value), Number(st.min), Number(st.max));
    if (st.mode === 'N') v = Math.round(v);
    else if (st.mode === 'E') v = Math.round(v / 2) * 2;
    else if (st.mode === 'O') v = Math.round((v - 1) / 2) * 2 + 1;
    else v = Number(v.toFixed(U.clamp(st.decimals | 0, 0, 8)));
    return v;
  };
  VR.sliderText = (st) => {
    const v = VR.sliderValue(st);
    return st.mode === 'R' || !st.mode ? v.toFixed(U.clamp(st.decimals | 0, 0, 8)) : String(v);
  };

  VR.mdValue = function (st) {
    const d = U.clamp(st.decimals | 0, 0, 8);
    return [Number(U.clamp(st.x, st.xmin, st.xmax).toFixed(d)), Number(U.clamp(st.y, st.ymin, st.ymax).toFixed(d))];
  };

  // Value List items are written as "label = value", one per line. Numbers stay numbers.
  VR.parseListValue = function (s) {
    const t = String(s).trim();
    if (/^".*"$/.test(t) || /^'.*'$/.test(t)) return t.slice(1, -1);
    if (t !== '' && isFinite(Number(t))) return Number(t);
    if (/^(true|false)$/i.test(t)) return /^true$/i.test(t);
    return t;
  };
  VR.parseListItems = function (text) {
    return String(text).split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
      const i = line.indexOf('=');
      if (i < 0) return { label: line.replace(/^"|"$/g, ''), value: VR.parseListValue(line) };
      return { label: line.slice(0, i).trim().replace(/^"|"$/g, ''), value: VR.parseListValue(line.slice(i + 1)) };
    });
  };
  VR.listItemsText = (items) => items.map((it) => it.label + ' = ' +
    (typeof it.value === 'string' ? '"' + it.value + '"' : String(it.value))).join('\n');

  const P = (spec) => VR.defineComponent(Object.assign({ tab: 'Params' }, spec));

  P({
    type: 'NumberSlider', name: 'Number Slider', nick: 'Slider', group: 'Input', icon: 'slider', widget: 'slider',
    desc: 'A single number. Drag the grip to change it; double-click the name to set the range and rounding.',
    keywords: 'number slider value integer float',
    outputs: [{ name: 'Number', nick: 'N', desc: 'Slider value' }],
    init: () => ({ value: 0.25, min: 0, max: 1, decimals: 3, mode: 'R', w: 230 }),
    solve: (ctx) => [VR.sliderValue(ctx.state)]
  });

  P({
    type: 'MDSlider', name: 'MD Slider', nick: 'MD', group: 'Input', icon: 'md', widget: 'md',
    desc: 'Two numbers from one grip, for pairs such as image resolution, view size or a wavelength range. Double-click the name to set both domains.',
    keywords: 'multi dimensional slider pair point 2d xy',
    outputs: [{ name: 'Point', nick: 'P', desc: 'Pair of values (x, y)' }],
    init: () => ({ x: 0.5, y: 0.5, xmin: 0, xmax: 1, ymin: 0, ymax: 1, decimals: 2, size: 150 }),
    solve: (ctx) => [VR.mdValue(ctx.state)]
  });

  P({
    type: 'Toggle', name: 'Boolean Toggle', nick: 'Toggle', group: 'Input', icon: 'toggle', widget: 'toggle',
    desc: 'True or False. Click the value to switch it.',
    keywords: 'boolean toggle true false switch',
    outputs: [{ name: 'Boolean', nick: 'B', desc: 'Toggle state' }],
    init: () => ({ value: false }),
    solve: (ctx) => [!!ctx.state.value]
  });

  P({
    type: 'Button', name: 'Button', nick: 'Button', group: 'Input', icon: 'button', widget: 'button',
    desc: 'Outputs True while pressed, then returns to False. Use it to trigger a write.',
    keywords: 'button trigger press momentary',
    outputs: [{ name: 'Boolean', nick: 'B', desc: 'True while pressed' }],
    init: () => ({}),
    solve: (ctx) => [!!ctx.runtime().pressed]
  });

  P({
    type: 'ValueList', name: 'Value List', nick: 'List', group: 'Input', icon: 'list', widget: 'list',
    desc: 'Pick one value from a list of "label = value" items. Double-click the name to edit the items.',
    keywords: 'value list dropdown selector choice options',
    outputs: [{ name: 'Value', nick: 'V', desc: 'Selected value' }],
    init: () => ({ items: [{ label: 'One', value: 1 }, { label: 'Two', value: 2 }, { label: 'Three', value: 3 }], index: 0, mode: 'dropdown' }),
    solve: (ctx) => {
      const items = ctx.state.items || [];
      if (!items.length) ctx.fail('The list has no items', 'warning');
      const it = items[U.clamp(ctx.state.index | 0, 0, items.length - 1)];
      return [it.value];
    }
  });

  P({
    type: 'Panel', name: 'Panel', nick: 'Panel', group: 'Text', icon: 'panel', widget: 'panel',
    desc: 'Type text such as a folder path, file names or Radiance options. Connect an output to its left side to read data, like a Grasshopper panel.',
    keywords: 'panel text string note path folder file name viewer',
    inputs: [{ name: 'Input', nick: '', access: 'list', desc: 'Data to display' }],
    outputs: [{ name: 'Output', nick: '', desc: 'Panel text, or the data passing through' }],
    init: () => ({ text: '', w: 200, h: 64, multiline: true }),
    solve: (ctx) => {
      if (ctx.connected(0)) {
        const v = ctx.inputs[0].values;
        return [v.length === 1 ? v[0] : v.length ? v : undefined];
      }
      const t = ctx.state.text || '';
      if (!t.trim()) return [undefined];
      if (ctx.state.multiline === false) return [t.split(/\r?\n/).filter((s) => s.trim() !== '')];
      return [t];
    }
  });

  P({
    type: 'FilePath', name: 'File Path', nick: 'File', group: 'Text', icon: 'file', widget: 'file',
    desc: 'A file name picked from your computer, or typed. Browsers only reveal the name, so the batch file expects the file next to it (or type a full path).',
    keywords: 'file path browse epw rad pts name',
    outputs: [{ name: 'Path', nick: 'P', desc: 'File name or path' }],
    init: () => ({ path: '', w: 220 }),
    solve: (ctx) => [ctx.state.path ? ctx.state.path : undefined]
  });

  P({
    type: 'Scribble', name: 'Scribble', nick: 'Scribble', group: 'Text', icon: 'scribble', widget: 'scribble',
    desc: 'A text note on the canvas. Double-click to edit.',
    keywords: 'scribble note text label comment annotation',
    init: () => ({ text: 'Note', size: 18 }),
    solve: () => []
  });

  P({
    type: 'Point', name: 'Construct Point', nick: 'Pt', group: 'Vector', icon: 'point',
    desc: 'Three numbers as a point or vector, for view position, direction and up.',
    keywords: 'construct point vector xyz coordinate',
    inputs: [
      { name: 'X', nick: 'X', def: 0, desc: 'X coordinate', hint: { widget: 'slider', min: -50, max: 50, dec: 3 } },
      { name: 'Y', nick: 'Y', def: 0, desc: 'Y coordinate', hint: { widget: 'slider', min: -50, max: 50, dec: 3 } },
      { name: 'Z', nick: 'Z', def: 0, desc: 'Z coordinate', hint: { widget: 'slider', min: -50, max: 50, dec: 3 } }
    ],
    outputs: [{ name: 'Point', nick: 'Pt', desc: 'Point as three numbers' }],
    solve: (ctx) => [[ctx.num(0), ctx.num(1), ctx.num(2)]]
  });
})(window.VR);
