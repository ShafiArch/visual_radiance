/* Visual Radiance: menus, dialogs, tooltips and toasts. */
(function (VR) {
  'use strict';
  const U = VR.util;
  const T = VR.types;
  const UI = VR.ui = {};
  const el = U.el;

  /* == context menus == */

  let openMenus = [];
  UI.closeMenus = function () {
    openMenus.forEach((m) => m.remove());
    openMenus = [];
  };
  UI.menuOpen = () => openMenus.length > 0;

  // items: { label, action, checked, disabled, sep, header, note, sub: [items], shortcut }
  UI.menu = function (items, x, y, parent) {
    if (!parent) UI.closeMenus();
    const m = el('div', 'ctx-menu');
    m.setAttribute('role', 'menu');
    items.forEach((it) => {
      if (!it) return;
      if (it.sep) { m.appendChild(el('div', 'ctx-sep')); return; }
      if (it.header) { m.appendChild(el('div', 'ctx-head', it.header)); return; }
      if (it.note) { m.appendChild(el('div', 'ctx-note', it.note)); return; }
      const b = el('button', 'ctx-item' + (it.checked ? ' checked' : '') + (it.sub ? ' has-sub' : ''));
      b.type = 'button';
      b.setAttribute('role', it.checked !== undefined ? 'menuitemcheckbox' : 'menuitem');
      if (it.checked !== undefined) b.setAttribute('aria-checked', String(!!it.checked));
      b.appendChild(el('span', 'ctx-check', it.checked ? '✓' : ''));
      b.appendChild(el('span', 'ctx-label', it.label));
      if (it.shortcut) b.appendChild(el('span', 'ctx-key', it.shortcut));
      if (it.sub) b.appendChild(el('span', 'ctx-arrow', '›'));
      if (it.disabled) b.disabled = true;
      if (it.sub) {
        const openSub = () => {
          const idx = openMenus.indexOf(m);
          openMenus.slice(idx + 1).forEach((s) => s.remove());
          openMenus = openMenus.slice(0, idx + 1);
          const r = b.getBoundingClientRect();
          UI.menu(it.sub, r.right - 2, r.top - 4, m);
        };
        b.addEventListener('pointerenter', openSub);
        b.addEventListener('click', openSub);
      } else {
        b.addEventListener('pointerenter', () => {
          const idx = openMenus.indexOf(m);
          openMenus.slice(idx + 1).forEach((s) => s.remove());
          openMenus = openMenus.slice(0, idx + 1);
        });
        b.addEventListener('click', (e) => {
          e.stopPropagation();
          UI.closeMenus();
          if (it.action) it.action();
        });
      }
      m.appendChild(b);
    });
    document.body.appendChild(m);
    const r = m.getBoundingClientRect();
    const vx = Math.min(x, window.innerWidth - r.width - 6);
    const vy = Math.min(y, window.innerHeight - r.height - 6);
    m.style.left = Math.max(4, vx) + 'px';
    m.style.top = Math.max(4, vy) + 'px';
    openMenus.push(m);
    const first = m.querySelector('.ctx-item:not([disabled])');
    if (first && !parent) first.focus({ preventScroll: true });
    return m;
  };

  document.addEventListener('pointerdown', (e) => {
    if (openMenus.length && !e.target.closest('.ctx-menu')) UI.closeMenus();
  }, true);
  document.addEventListener('keydown', (e) => {
    if (!openMenus.length) return;
    if (e.key === 'Escape') { UI.closeMenus(); e.stopPropagation(); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const m = openMenus[openMenus.length - 1];
      const items = Array.from(m.querySelectorAll('.ctx-item:not([disabled])'));
      const i = items.indexOf(document.activeElement);
      const next = items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length];
      if (next) next.focus();
      e.preventDefault();
    }
  }, true);

  /* == tooltips == */

  let tipEl = null;
  let tipTimer = null;
  UI.tipLater = function (fn, x, y) {
    clearTimeout(tipTimer);
    tipTimer = setTimeout(() => {
      const content = fn();
      if (content) UI.tip(content, x, y);
    }, 380);
  };
  UI.tip = function (content, x, y) {
    UI.hideTip();
    tipEl = el('div', 'tip');
    if (typeof content === 'string') tipEl.textContent = content;
    else tipEl.appendChild(content);
    document.body.appendChild(tipEl);
    const r = tipEl.getBoundingClientRect();
    tipEl.style.left = Math.max(6, Math.min(x + 14, window.innerWidth - r.width - 8)) + 'px';
    tipEl.style.top = Math.max(6, Math.min(y + 18, window.innerHeight - r.height - 8)) + 'px';
  };
  UI.hideTip = function () {
    clearTimeout(tipTimer);
    if (tipEl) { tipEl.remove(); tipEl = null; }
  };

  /* == toasts == */

  UI.toast = function (text, kind) {
    let box = document.querySelector('.toasts');
    if (!box) { box = el('div', 'toasts'); box.setAttribute('role', 'status'); document.body.appendChild(box); }
    const t = el('div', 'toast' + (kind ? ' ' + kind : ''), text);
    box.appendChild(t);
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 400); }, kind === 'error' ? 6000 : 3200);
  };

  /* == modal dialogs == */

  UI.modal = function (o) {
    const back = el('div', 'modal-back');
    const box = el('div', 'modal');
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.appendChild(el('h2', 'modal-title', o.title));
    const body = el('div', 'modal-body');
    if (o.body) body.appendChild(o.body);
    box.appendChild(body);
    const bar = el('div', 'modal-bar');
    const close = () => { back.remove(); document.removeEventListener('keydown', onKey, true); };
    (o.buttons || [{ label: 'Close', primary: true }]).forEach((bt) => {
      const b = el('button', 'btn' + (bt.primary ? ' primary' : ''), bt.label);
      b.type = 'button';
      b.addEventListener('click', () => {
        if (bt.action && bt.action() === false) return;
        close();
      });
      bar.appendChild(b);
    });
    box.appendChild(bar);
    back.appendChild(box);
    const onKey = (e) => {
      if (e.key === 'Escape') { close(); if (o.onCancel) o.onCancel(); e.stopPropagation(); }
      if (e.key === 'Enter' && !e.shiftKey && e.target.tagName !== 'TEXTAREA' && o.enter) {
        e.preventDefault();
        if (o.enter() !== false) close();
      }
    };
    document.addEventListener('keydown', onKey, true);
    back.addEventListener('pointerdown', (e) => { if (e.target === back) { close(); if (o.onCancel) o.onCancel(); } });
    document.body.appendChild(back);
    const f = box.querySelector('input, textarea, select, button.primary');
    if (f) setTimeout(() => { f.focus(); if (f.select) f.select(); }, 0);
    return { close, box };
  };

  function field(label, input, hint) {
    const w = el('label', 'field');
    w.appendChild(el('span', 'field-label', label));
    w.appendChild(input);
    if (hint) w.appendChild(el('span', 'field-hint', hint));
    return w;
  }
  UI.field = field;
  function input(value, type) {
    const i = el('input', 'inp');
    i.type = type || 'text';
    i.value = value === undefined || value === null ? '' : value;
    i.spellcheck = false;
    return i;
  }
  UI.input = input;

  UI.prompt = function (title, label, value, multiline) {
    return new Promise((resolve) => {
      const inp = multiline ? el('textarea', 'inp area') : input(value);
      if (multiline) { inp.value = value || ''; inp.rows = 6; inp.spellcheck = false; }
      let done = false;
      const ok = () => { done = true; resolve(inp.value); };
      UI.modal({ title, body: field(label, inp), enter: multiline ? null : ok, onCancel: () => { if (!done) resolve(null); },
        buttons: [{ label: 'Cancel', action: () => { done = true; resolve(null); } }, { label: 'OK', primary: true, action: ok }] });
    });
  };

  UI.confirm = function (title, text, okLabel) {
    return new Promise((resolve) => {
      let done = false;
      UI.modal({ title, body: el('p', 'modal-text', text), onCancel: () => { if (!done) resolve(false); },
        buttons: [{ label: 'Cancel', action: () => { done = true; resolve(false); } },
          { label: okLabel || 'OK', primary: true, action: () => { done = true; resolve(true); } }] });
    });
  };

  /* == editors for parameter widgets == */

  UI.sliderEditor = function (n, onApply) {
    const st = n.state;
    const name = input(n.nick);
    const mode = el('select', 'inp');
    [['R', 'Floating point numbers (R)'], ['N', 'Integer numbers (N)'], ['E', 'Even numbers (E)'], ['O', 'Odd numbers (O)']].forEach(([v, l]) => {
      const o = el('option', null, l);
      o.value = v;
      if ((st.mode || 'R') === v) o.selected = true;
      mode.appendChild(o);
    });
    const dec = input(st.decimals, 'number');
    dec.min = 0; dec.max = 8;
    const min = input(st.min, 'number');
    const max = input(st.max, 'number');
    const val = input(VR.sliderValue(st), 'number');
    [min, max, val].forEach((i) => { i.step = 'any'; });
    const body = el('div', 'form');
    body.append(field('Name', name), field('Rounding', mode), field('Digits', dec, 'Decimal places for floating point numbers'),
      el('div', 'form-row'));
    const row = body.lastChild;
    row.append(field('Min', min), field('Value', val), field('Max', max));
    const apply = () => {
      const a = Number(min.value);
      const b = Number(max.value);
      const v = Number(val.value);
      if (!isFinite(a) || !isFinite(b) || !isFinite(v) || a >= b) { UI.toast('Min must be lower than Max, and all three must be numbers', 'error'); return false; }
      onApply({ nick: name.value.trim() || n.nick, state: { mode: mode.value, decimals: U.clamp(Number(dec.value) | 0, 0, 8), min: a, max: b, value: U.clamp(v, a, b) } });
      return true;
    };
    UI.modal({ title: 'Slider settings', body, enter: apply, buttons: [{ label: 'Cancel' }, { label: 'Apply', primary: true, action: apply }] });
  };

  UI.mdEditor = function (n, onApply) {
    const st = n.state;
    const name = input(n.nick);
    const xs = [input(st.xmin, 'number'), input(st.x, 'number'), input(st.xmax, 'number')];
    const ys = [input(st.ymin, 'number'), input(st.y, 'number'), input(st.ymax, 'number')];
    const dec = input(st.decimals, 'number');
    const size = input(st.size || 150, 'number');
    xs.concat(ys).forEach((i) => { i.step = 'any'; });
    const body = el('div', 'form');
    const rx = el('div', 'form-row');
    rx.append(field('X min', xs[0]), field('X value', xs[1]), field('X max', xs[2]));
    const ry = el('div', 'form-row');
    ry.append(field('Y min', ys[0]), field('Y value', ys[1]), field('Y max', ys[2]));
    const r3 = el('div', 'form-row');
    r3.append(field('Digits', dec), field('Size (px)', size));
    body.append(field('Name', name), rx, ry, r3);
    const apply = () => {
      const v = xs.concat(ys).map((i) => Number(i.value));
      if (v.some((x) => !isFinite(x)) || v[0] >= v[2] || v[3] >= v[5]) { UI.toast('Each min must be lower than its max', 'error'); return false; }
      onApply({ nick: name.value.trim() || n.nick, state: { xmin: v[0], x: U.clamp(v[1], v[0], v[2]), xmax: v[2], ymin: v[3], y: U.clamp(v[4], v[3], v[5]), ymax: v[5],
        decimals: U.clamp(Number(dec.value) | 0, 0, 8), size: U.clamp(Number(size.value) || 150, 80, 400) } });
      return true;
    };
    UI.modal({ title: 'MD slider settings', body, enter: apply, buttons: [{ label: 'Cancel' }, { label: 'Apply', primary: true, action: apply }] });
  };

  UI.listEditor = function (n, onApply) {
    const name = input(n.nick);
    const area = el('textarea', 'inp area mono');
    area.rows = 8;
    area.spellcheck = false;
    area.value = VR.listItemsText(n.state.items || []);
    const body = el('div', 'form');
    body.append(field('Name', name), field('Items', area, 'One item per line, written as  label = value . Text values go in quotes; numbers stay numbers.'));
    const apply = () => {
      const items = VR.parseListItems(area.value);
      if (!items.length) { UI.toast('Add at least one item', 'error'); return false; }
      onApply({ nick: name.value.trim() || n.nick, state: { items, index: Math.min(n.state.index | 0, items.length - 1) } });
      return true;
    };
    UI.modal({ title: 'Value list items', body, buttons: [{ label: 'Cancel' }, { label: 'Apply', primary: true, action: apply }] });
  };

  /* == help == */

  UI.help = function (type) {
    const spec = VR.components[type];
    if (!spec) return;
    const body = el('div', 'help');
    const head = el('div', 'help-head');
    head.innerHTML = VR.icon(spec.icon, 30);
    head.appendChild(el('div', 'help-name', spec.name + '  (' + spec.nick + ')'));
    body.appendChild(head);
    body.appendChild(el('p', null, spec.desc));
    if (spec.help) body.appendChild(el('p', 'help-more', spec.help));
    const io = (title, list) => {
      if (!list.length) return;
      body.appendChild(el('h3', null, title));
      const dl = el('dl', 'help-io');
      list.forEach((p) => {
        const nm = p.nick && p.nick !== p.name ? p.nick + '  ' + p.name : p.name;
        dl.appendChild(el('dt', null, nm + (title === 'Inputs' && p.optional !== false ? ' (optional)' : '')));
        let d = p.desc || '';
        if (p.def !== undefined) d += ' Default: ' + T.str(p.def).replace(/\n/g, ' ') + '.';
        dl.appendChild(el('dd', null, d));
      });
      body.appendChild(dl);
    };
    io('Inputs', spec.inputs);
    io('Outputs', spec.outputs);
    const cmds = (spec.keywords || '').split(' ').filter((k) => ['rtrace', 'rpict', 'rfluxmtx', 'rcontrib', 'gendaymtx', 'dctimestep', 'gensky', 'gendaylit', 'genssky', 'oconv', 'pfilt'].indexOf(k) >= 0);
    if (cmds.length) {
      const p = el('p', 'help-links');
      p.appendChild(document.createTextNode('Radiance manual: '));
      cmds.forEach((c, i) => {
        const a = el('a', null, c);
        a.href = VR.rad.man(c);
        a.target = '_blank';
        a.rel = 'noopener';
        p.appendChild(a);
        if (i < cmds.length - 1) p.appendChild(document.createTextNode(', '));
      });
      body.appendChild(p);
    }
    UI.modal({ title: 'Component help', body });
  };

  UI.shortcuts = function () {
    const rows = [
      ['Double-click canvas', 'Search and add a component (type a number for a slider, or "text for a panel)'],
      ['Drag from a grip', 'Connect; Shift adds a wire, Ctrl removes one'],
      ['Right-drag or middle-drag', 'Pan the canvas'],
      ['Mouse wheel', 'Zoom at the pointer'],
      ['Drag on empty canvas', 'Window select (left to right inside, right to left crossing); Shift adds, Ctrl removes'],
      ['Alt + drag', 'Duplicate and move the selection'],
      ['Space', 'Radial menu'],
      ['Right-click an input', 'Add a slider, panel, toggle or list already set up for it'],
      ['Ctrl+Z / Ctrl+Y', 'Undo / redo'],
      ['Ctrl+C / Ctrl+V / Ctrl+D', 'Copy / paste / duplicate'],
      ['Ctrl+G / Ctrl+Shift+G', 'Group / ungroup'],
      ['Ctrl+E', 'Enable or disable the selection'],
      ['Delete', 'Delete the selection'],
      ['F', 'Zoom to fit everything'],
      ['Arrow keys', 'Nudge a selected slider; with nothing to nudge they pan'],
      ['Ctrl+S / Ctrl+O', 'Save / open a definition'],
      ['Ctrl+Shift+E', 'Export all .bat files']
    ];
    const t = el('table', 'keys');
    rows.forEach(([k, v]) => {
      const tr = el('tr');
      tr.appendChild(el('th', null, k));
      tr.appendChild(el('td', null, v));
      t.appendChild(tr);
    });
    UI.modal({ title: 'Mouse and keyboard', body: t });
  };

  UI.about = function () {
    const b = el('div', 'help');
    b.appendChild(el('p', null, 'Visual Radiance is a node editor in the style of Grasshopper for composing Radiance simulations. It writes Windows batch files: save one into your project folder and run it.'));
    b.appendChild(el('p', null, 'Workflows: annual illuminance (daylight coefficients with direct sun), point-in-time illuminance, electric lighting, point-in-time renders, spectral point-in-time and spectral annual runs.'));
    const p = el('p', 'help-links');
    [['Radiance', 'https://www.radiance-online.org/'], ['Radiance manual pages', 'https://floyd.lbl.gov/radiance/man_html/'],
      ['Rendering options notes', 'https://floyd.lbl.gov/radiance/refer/Notes/rpict_options.html']].forEach(([t, h], i) => {
      const a = el('a', null, t);
      a.href = h;
      a.target = '_blank';
      a.rel = 'noopener';
      p.appendChild(a);
      if (i < 2) p.appendChild(document.createTextNode(', '));
    });
    b.appendChild(p);
    b.appendChild(el('p', 'help-more', 'Made by Shafiul Islam.'));
    UI.modal({ title: 'About Visual Radiance', body: b });
  };
})(window.VR);
