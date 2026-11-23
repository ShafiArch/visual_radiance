/* Visual Radiance: menu bar, component tabs and palette, and component search. */
(function (VR) {
  'use strict';
  const U = VR.util;
  const el = U.el;
  const R = VR.ribbon = {};

  const TABS = ['Params', 'Radiance', 'Workflows', 'Output'];
  const SHORT = {
    'Number Slider': 'Number slider', 'MD Slider': 'MD slider', 'Boolean Toggle': 'Toggle', 'Value List': 'Value list',
    'File Path': 'File path', 'Construct Point': 'Point', 'Radiance Parameters': 'Parameters', 'Spectral Settings': 'Spectral',
    'Image Settings': 'Image', 'Radiance Folders': 'Folders', 'Weather File': 'Weather', 'Sensor Grid': 'Sensor grid',
    'Sky Receiver': 'Receiver', 'Annual Illuminance': 'Annual', 'Point-in-Time Illuminance': 'Point in time',
    'Electric Illuminance': 'Electric', 'Point-in-Time Render': 'Render', 'Spectral Point-in-Time': 'Spectral PIT',
    'Spectral Annual': 'Spectral annual', 'Batch Writer': 'Batch writer'
  };

  /* == search used by the double-click popup == */

  const item = (s) => ({ type: s.type, label: s.name, icon: s.icon, sub: s.tab + ', ' + s.group });
  VR.searchComponents = function (query) {
    const q = String(query || '').trim();
    const out = [];
    let m = q.match(/^(-?\d*\.?\d+)\s*<\s*(-?\d*\.?\d+)\s*<\s*(-?\d*\.?\d+)$/);
    if (m) {
      const a = Number(m[1]);
      const v = Number(m[2]);
      const b = Number(m[3]);
      const dec = Math.max.apply(null, [m[1], m[2], m[3]].map((x) => (x.split('.')[1] || '').length));
      if (a < b) out.push({ type: 'NumberSlider', label: 'Slider from ' + a + ' to ' + b, icon: 'slider', sub: 'Value ' + v,
        state: { min: a, max: b, value: U.clamp(v, a, b), decimals: dec, mode: dec ? 'R' : 'N' } });
    } else if (/^-?\d*\.?\d+$/.test(q)) {
      const v = Number(q);
      const dec = (q.split('.')[1] || '').length;
      const span = v === 0 ? 1 : Math.pow(10, Math.ceil(Math.log10(Math.abs(v) * 2 + 1e-9)));
      out.push({ type: 'NumberSlider', label: 'Slider with value ' + q, icon: 'slider', sub: 'Range ' + (v < 0 ? -span : 0) + ' to ' + span,
        state: { min: v < 0 ? -span : 0, max: span, value: v, decimals: dec, mode: dec ? 'R' : 'N' } });
    }
    if (/^["']/.test(q) && q.length > 1) {
      const text = q.slice(1).replace(/["']$/, '');
      out.push({ type: 'Panel', label: 'Panel: ' + text, icon: 'panel', sub: 'A panel with this text',
        state: { text, w: Math.max(120, Math.min(420, Math.ceil(VR.measure(text)) + 40)), h: 44 } });
    }
    const ql = q.toLowerCase();
    if (!ql) return VR.componentList.slice(0, 14).map(item);
    VR.componentList.map((s) => {
      const name = s.name.toLowerCase();
      const nick = s.nick.toLowerCase();
      const keys = (s.keywords || '').toLowerCase().split(' ');
      let sc = 0;
      if (name === ql || nick === ql) sc = 100;
      else if (name.indexOf(ql) === 0 || nick.indexOf(ql) === 0) sc = 60;
      else if (name.indexOf(ql) >= 0) sc = 40;
      else if (keys.some((k) => k.indexOf(ql) === 0)) sc = 25;
      else if ((s.desc || '').toLowerCase().indexOf(ql) >= 0) sc = 5;
      return { s, sc };
    }).filter((x) => x.sc > 0).sort((a, b) => b.sc - a.sc || a.s.name.localeCompare(b.s.name))
      .slice(0, 12).forEach((x) => out.push(item(x.s)));
    return out;
  };

  /* == menu bar == */

  R.build = function (app) {
    const bar = document.getElementById('menubar');
    const menus = {
      File: () => [
        { label: 'New', action: () => app.newDoc() },
        { label: 'Open...', shortcut: 'Ctrl+O', action: () => app.open() },
        { label: 'Save', shortcut: 'Ctrl+S', action: () => app.save() },
        { sep: true },
        { label: 'Examples', sub: VR.examples.map((ex) => ({ label: ex.name, action: () => app.loadExample(ex.id) })) },
        { sep: true },
        { label: 'Export .bat files', shortcut: 'Ctrl+Shift+E', action: () => app.exportBats() }
      ],
      Edit: () => [
        { label: 'Undo', shortcut: 'Ctrl+Z', disabled: !app.history.undoStack.length, action: () => app.undo() },
        { label: 'Redo', shortcut: 'Ctrl+Y', disabled: !app.history.redoStack.length, action: () => app.redo() },
        { sep: true },
        { label: 'Cut', shortcut: 'Ctrl+X', action: () => app.cut() },
        { label: 'Copy', shortcut: 'Ctrl+C', action: () => app.copy() },
        { label: 'Paste', shortcut: 'Ctrl+V', disabled: !app.clip, action: () => app.paste() },
        { label: 'Duplicate', shortcut: 'Ctrl+D', action: () => app.duplicate() },
        { label: 'Delete', shortcut: 'Del', action: () => app.deleteNodes(Array.from(app.view.sel)) },
        { sep: true },
        { label: 'Select all', shortcut: 'Ctrl+A', action: () => app.selectAll() },
        { label: 'Group', shortcut: 'Ctrl+G', action: () => app.group() },
        { label: 'Ungroup', shortcut: 'Ctrl+Shift+G', action: () => app.ungroup() },
        { label: 'Enable or disable', shortcut: 'Ctrl+E', action: () => app.toggleEnabled(Array.from(app.view.sel)) }
      ],
      View: () => [
        { label: 'Zoom to fit', shortcut: 'F', action: () => app.view.zoomExtents() },
        { label: 'Zoom to selection', disabled: !app.view.sel.size, action: () => app.view.zoomExtents(Array.from(app.view.sel)) },
        { label: 'Actual size', shortcut: 'Ctrl+0', action: () => app.zoomTo(1) },
        { label: 'Zoom in', shortcut: 'Ctrl+=', action: () => app.zoomBy(1.25) },
        { label: 'Zoom out', shortcut: 'Ctrl+-', action: () => app.zoomBy(0.8) },
        { sep: true },
        { label: 'Wire display', sub: ['default', 'faint', 'hidden'].map((m) => ({ label: m[0].toUpperCase() + m.slice(1),
          checked: (app.wireMode || 'default') === m, action: () => app.setWireMode(m) })) },
        { label: 'Navigation map', checked: !!app.showMap, action: () => app.toggleMap() }
      ],
      Help: () => [
        { label: 'Mouse and keyboard', action: () => VR.ui.shortcuts() },
        { label: 'Component help', sub: TABS.map((t) => ({ label: t, sub: VR.componentList.filter((s) => s.tab === t)
          .map((s) => ({ label: s.name, action: () => VR.ui.help(s.type) })) })) },
        { label: 'Radiance manual pages', sub: ['oconv', 'rtrace', 'rpict', 'rfluxmtx', 'rcontrib', 'gendaymtx', 'dctimestep', 'rmtxop', 'gensky', 'gendaylit', 'genssky', 'pfilt']
          .map((c) => ({ label: c, action: () => window.open(VR.rad.man(c), '_blank', 'noopener') })) },
        { sep: true },
        { label: 'About Visual Radiance', action: () => VR.ui.about() }
      ]
    };
    Object.keys(menus).forEach((name) => {
      const b = el('button', 'menu-btn', name);
      b.type = 'button';
      b.setAttribute('aria-haspopup', 'menu');
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        const r = b.getBoundingClientRect();
        VR.ui.menu(menus[name](), r.left, r.bottom + 2);
      });
      bar.appendChild(b);
    });

    document.getElementById('doc-name').addEventListener('click', () => {
      VR.ui.prompt('Definition name', 'Name', app.doc.name).then((v) => {
        if (v !== null && v.trim()) { app.doc.name = v.trim(); app.updateTitle(); app.saveSoon(); }
      });
    });
    document.getElementById('btn-examples').addEventListener('click', (e) => {
      const r = e.currentTarget.getBoundingClientRect();
      VR.ui.menu(VR.examples.map((ex) => ({ label: ex.name, action: () => app.loadExample(ex.id) })), r.left, r.bottom + 2);
    });
    document.getElementById('btn-export').addEventListener('click', () => app.exportBats());

    R.buildPalette(app);
  };

  /* == tabs and palette == */

  R.buildPalette = function (app) {
    const tabs = document.getElementById('tabs');
    const pal = document.getElementById('palette');
    let current = localStorage.getItem('visual-radiance.tab') || 'Params';
    const show = (tab) => {
      current = tab;
      try { localStorage.setItem('visual-radiance.tab', tab); } catch (e) { /* private mode */ }
      tabs.querySelectorAll('.tab').forEach((t) => {
        t.classList.toggle('on', t.dataset.tab === tab);
        t.setAttribute('aria-selected', String(t.dataset.tab === tab));
      });
      pal.textContent = '';
      const specs = VR.componentList.filter((s) => s.tab === tab);
      const groups = [];
      specs.forEach((s) => { if (groups.indexOf(s.group) < 0) groups.push(s.group); });
      groups.forEach((g) => {
        const box = el('div', 'pal-group');
        const row = el('div', 'pal-row');
        specs.filter((s) => s.group === g).forEach((s) => row.appendChild(R.button(app, s)));
        box.appendChild(row);
        box.appendChild(el('div', 'pal-name', g));
        pal.appendChild(box);
      });
    };
    TABS.forEach((t) => {
      const b = el('button', 'tab', t);
      b.type = 'button';
      b.dataset.tab = t;
      b.setAttribute('role', 'tab');
      b.addEventListener('click', () => show(t));
      tabs.appendChild(b);
    });
    show(TABS.indexOf(current) >= 0 ? current : 'Params');
  };

  R.button = function (app, spec) {
    const b = el('button', 'pal-btn');
    b.type = 'button';
    b.innerHTML = VR.icon(spec.icon, 24);
    b.appendChild(el('span', 'pal-label', SHORT[spec.name] || spec.name));
    b.setAttribute('aria-label', 'Add ' + spec.name);
    b.addEventListener('pointerenter', (e) => {
      VR.ui.tipLater(() => {
        const box = el('div');
        box.appendChild(el('div', 'tip-title', spec.name));
        box.appendChild(el('div', 'tip-desc', spec.desc));
        box.appendChild(el('div', 'tip-sub', 'Click to add, or drag onto the canvas'));
        return box;
      }, e.clientX, e.clientY);
    });
    b.addEventListener('pointerleave', () => VR.ui.hideTip());
    b.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      VR.ui.hideTip();
      const sx = e.clientX;
      const sy = e.clientY;
      let ghost = null;
      b.setPointerCapture(e.pointerId);
      const move = (ev) => {
        if (!ghost && Math.hypot(ev.clientX - sx, ev.clientY - sy) > 5) {
          ghost = el('div', 'drag-ghost');
          ghost.innerHTML = VR.icon(spec.icon, 20);
          ghost.appendChild(el('span', null, spec.name));
          document.body.appendChild(ghost);
        }
        if (ghost) { ghost.style.left = (ev.clientX + 8) + 'px'; ghost.style.top = (ev.clientY + 8) + 'px'; }
      };
      const up = (ev) => {
        b.removeEventListener('pointermove', move);
        b.removeEventListener('pointerup', up);
        b.removeEventListener('pointercancel', up);
        if (ghost) {
          ghost.remove();
          const r = app.stage.getBoundingClientRect();
          if (ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom) {
            const at = app.view.toWorld(ev.clientX, ev.clientY);
            app.addNode(spec.type, at.x - 20, at.y - 12);
          }
        } else if (ev.type === 'pointerup') {
          const c = app.view.centerWorld();
          const k = (app.placeCount = (app.placeCount + 1) % 8);
          app.addNode(spec.type, c.x - 60 + k * 18, c.y - 30 + k * 18);
        }
      };
      b.addEventListener('pointermove', move);
      b.addEventListener('pointerup', up);
      b.addEventListener('pointercancel', up);
    });
    return b;
  };
})(window.VR);
