/* Visual Radiance: application glue. Changes, undo, clipboard, files, examples,
   batch export and keyboard shortcuts. */
(function (VR) {
  'use strict';
  const U = VR.util;
  const UI = VR.ui;
  const STORE = 'visual-radiance.definition.v1';
  const PREFS = 'visual-radiance.prefs.v1';
  const WIDGET_TYPES = { slider: 'NumberSlider', md: 'MDSlider', panel: 'Panel', toggle: 'Toggle', list: 'ValueList', button: 'Button' };

  const app = VR.app = {
    doc: new VR.Doc(),
    history: new VR.History(120),
    clip: null,
    wireMode: 'default',
    showMap: true,
    placeCount: 0,

    init() {
      this.saveSoon = U.debounce(() => this.autosave(), 400);
      this.stage = document.getElementById('stage');
      this.status = document.getElementById('status');
      this.loadPrefs();
      this.view = new VR.CanvasView(this, this.stage);
      VR.ribbon.build(this);
      this.bindKeys();
      VR.onWriteRequest = (id) => setTimeout(() => { const n = this.doc.get(id); if (n) this.saveBat(n); }, 0);

      const m = (location.search + location.hash).match(/example=([\w-]+)/);
      let fit = false;
      if (m && VR.examples.some((ex) => ex.id === m[1])) {
        this.doc.load(VR.examples.find((ex) => ex.id === m[1]).build());
        fit = true;
      } else {
        const saved = this.readAutosave();
        if (saved) {
          try { this.doc.load(saved); } catch (e) { this.doc = new VR.Doc(); }
        } else {
          this.doc.load(VR.examples[0].build());
          fit = true;
        }
      }
      this.solve();
      this.view.renderAll();
      if (fit) this.view.zoomExtents();
      this.updateTitle();
      if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(() => {
          this.view.renderAll();
          if (fit) this.view.zoomExtents();
        });
      }
    },

    /* == change flow == */

    snapshot() { return JSON.stringify(this.doc.serialize()); },
    checkpoint() { this.history.push(this.snapshot()); },
    solve() { this.doc.solve(); },
    changed(o) {
      o = o || {};
      if (o.solve !== false) this.solve();
      if (o.render) this.view.renderAll();
      else this.view.refresh(o.except);
      if (!o.live) this.saveSoon();
      this.updateStatus();
    },
    restore(json) {
      const view = Object.assign({}, this.doc.view);
      const keep = new Set(this.view.sel);
      this.doc.load(JSON.parse(json));
      this.doc.view = view;
      this.view.sel = new Set(Array.from(keep).filter((id) => this.doc.get(id)));
      this.solve();
      this.view.renderAll();
      this.updateTitle();
      this.saveSoon();
    },
    undo() {
      const s = this.history.undo(this.snapshot());
      if (s) this.restore(s); else UI.toast('Nothing to undo');
    },
    redo() {
      const s = this.history.redo(this.snapshot());
      if (s) this.restore(s); else UI.toast('Nothing to redo');
    },

    /* == status and preferences == */

    updateStatus() {
      if (!this.status || !this.view) return;
      const st = this.doc.stats;
      const parts = [];
      parts.push(st.count + ' component' + (st.count === 1 ? '' : 's') + ' solved in ' + st.ms + ' ms');
      if (st.errors) parts.push('<b class="s-err">' + st.errors + ' error' + (st.errors > 1 ? 's' : '') + '</b>');
      if (st.warnings) parts.push('<b class="s-warn">' + st.warnings + ' warning' + (st.warnings > 1 ? 's' : '') + '</b>');
      const right = (this.view.sel.size ? this.view.sel.size + ' selected' : '') + '<span>Zoom ' + Math.round(this.doc.view.zoom * 100) + '%</span>';
      this.status.innerHTML = '<div class="s-left">' + parts.join('<span class="s-gap"></span>') + '</div><div class="s-right">' + right + '</div>';
    },
    updateTitle() {
      const n = document.getElementById('doc-name');
      if (n) n.textContent = this.doc.name || 'Untitled';
      document.title = (this.doc.name ? this.doc.name + ' | ' : '') + 'Visual Radiance';
    },
    loadPrefs() {
      try {
        const p = JSON.parse(localStorage.getItem(PREFS) || '{}');
        this.wireMode = p.wireMode || 'default';
        this.showMap = p.showMap !== false;
      } catch (e) { /* defaults */ }
    },
    savePrefs() {
      try { localStorage.setItem(PREFS, JSON.stringify({ wireMode: this.wireMode, showMap: this.showMap })); } catch (e) { /* ignore */ }
    },
    setWireMode(m) { this.wireMode = m; this.savePrefs(); this.view.renderWires(); },
    toggleMap() { this.showMap = !this.showMap; this.savePrefs(); this.view.minimap.draw(); },
    zoomTo(z) {
      const r = this.stage.getBoundingClientRect();
      this.view.zoomAt(r.left + r.width / 2, r.top + r.height / 2, z / this.doc.view.zoom);
    },
    zoomBy(f) {
      const r = this.stage.getBoundingClientRect();
      this.view.zoomAt(r.left + r.width / 2, r.top + r.height / 2, f);
    },

    /* == autosave == */

    autosave() {
      try { localStorage.setItem(STORE, this.snapshot()); } catch (e) {
        if (!this.warnedStore) { UI.toast('The browser would not keep an autosave. Use File > Save to keep your work.', 'error'); this.warnedStore = true; }
      }
    },
    readAutosave() {
      try { return JSON.parse(localStorage.getItem(STORE) || 'null'); } catch (e) { return null; }
    },

    /* == editing == */

    addNode(type, x, y, state, nick) {
      this.checkpoint();
      const n = this.doc.addNode(type, x, y, state, nick);
      this.view.renderNode(n);
      this.view.sel = new Set([n.id]);
      this.changed({});
      return n;
    },
    addFromSearch(r, at, connect) {
      this.checkpoint();
      const n = this.doc.addNode(r.type, at.x - 8, at.y - 12, r.state || null, r.nick);
      let e = this.view.renderNode(n);
      if (connect) {
        const spec = VR.components[n.type];
        if (connect.side === 'out' && spec.inputs.length) {
          let i = spec.inputs.findIndex((p) => p.optional === false);
          if (i < 0) i = 0;
          n.x = Math.round(at.x + 4);
          n.y = Math.round(at.y - e.lay.ins[i].y);
          this.doc.connect(connect.n.id, connect.i, n.id, i, 'replace');
        } else if (connect.side === 'in' && spec.outputs.length) {
          n.x = Math.round(at.x - e.lay.w - 4);
          n.y = Math.round(at.y - e.lay.outs[0].y);
          this.doc.connect(n.id, 0, connect.n.id, connect.i, 'replace');
        }
        e = this.view.renderNode(n);
      }
      this.view.sel = new Set([n.id]);
      this.changed({});
    },
    editNode(n, o) {
      this.checkpoint();
      if (o.nick) n.nick = o.nick;
      if (o.state) Object.assign(n.state, o.state);
      this.solve();
      this.view.renderNode(n);
      this.changed({ solve: false });
    },
    deleteNodes(ids) {
      if (!ids.length) return;
      this.checkpoint();
      this.doc.removeNodes(ids);
      ids.forEach((id) => this.view.sel.delete(id));
      this.changed({ render: true });
    },
    toggleEnabled(ids) {
      ids = ids.filter((id) => this.doc.get(id));
      if (!ids.length) { UI.toast('Select components first'); return; }
      this.checkpoint();
      const anyOn = ids.some((id) => this.doc.get(id).enabled !== false);
      ids.forEach((id) => { this.doc.get(id).enabled = !anyOn; });
      this.changed({});
    },
    selectAll() {
      this.view.sel = new Set(this.doc.nodes.map((n) => n.id));
      this.view.refreshSelection();
    },
    copy() {
      if (!this.view.sel.size) return false;
      this.clip = JSON.stringify(this.doc.serialize(Array.from(this.view.sel)));
      if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(this.clip).catch(() => {});
      UI.toast('Copied ' + this.view.sel.size + ' component' + (this.view.sel.size > 1 ? 's' : ''));
      return true;
    },
    cut() { if (this.copy()) this.deleteNodes(Array.from(this.view.sel)); },
    paste(at) {
      if (!this.clip) { UI.toast('Copy components first'); return; }
      const data = JSON.parse(this.clip);
      if (!data.nodes || !data.nodes.length) return;
      const x0 = Math.min.apply(null, data.nodes.map((n) => n.x));
      const y0 = Math.min.apply(null, data.nodes.map((n) => n.y));
      const target = at || (this.view.pointerInStage() ? this.view.toWorld(this.view.pointer.x, this.view.pointer.y) : { x: x0 + 30, y: y0 + 30 });
      this.checkpoint();
      const ids = this.doc.insert(data, Math.round(target.x - x0), Math.round(target.y - y0));
      this.view.sel = new Set(ids);
      this.changed({ render: true });
    },
    duplicate() {
      if (!this.view.sel.size) return;
      this.checkpoint();
      const ids = this.doc.insert(this.doc.serialize(Array.from(this.view.sel)), 30, 30);
      this.view.sel = new Set(ids);
      this.changed({ render: true });
    },
    group() {
      const ids = Array.from(this.view.sel);
      if (!ids.length) { UI.toast('Select components to group'); return; }
      this.checkpoint();
      this.doc.groups.push({ id: U.uid('g'), name: 'Group', color: 'blue', members: ids });
      this.changed({ solve: false });
    },
    ungroup() {
      const sel = this.view.sel;
      const before = this.doc.groups.length;
      const keep = this.doc.groups.filter((g) => !g.members.some((id) => sel.has(id)));
      if (keep.length === before) { UI.toast('Select a group (click its background) to ungroup'); return; }
      this.checkpoint();
      this.doc.groups = keep;
      this.changed({ solve: false });
    },

    // Add a slider, panel, toggle or list set up for one input and wire it in.
    extract(n, i, h) {
      const spec = VR.components[n.type];
      const p = spec.inputs[i];
      const e = this.view.els.get(n.id);
      const type = WIDGET_TYPES[h.widget];
      if (!type || !e) return;
      const cur = this.doc.out(n.id, 0);
      const live = p.opt && cur && cur.values ? cur.values[p.opt] : undefined;
      let state = {};
      if (h.widget === 'slider') {
        let v = live !== undefined ? live : h.value !== undefined ? h.value : typeof p.def === 'number' ? p.def : (h.min + h.max) / 2;
        const min = Math.min(h.min, v);
        const max = Math.max(h.max, v);
        v = U.clamp(v, min, max);
        state = { min, max, value: v, decimals: h.dec || 0, mode: h.mode || (h.dec ? 'R' : 'N'), w: 230 };
      } else if (h.widget === 'md') {
        state = { xmin: h.xmin, xmax: h.xmax, ymin: h.ymin, ymax: h.ymax, x: h.x, y: h.y, decimals: h.dec || 0, size: 120 };
      } else if (h.widget === 'panel') {
        let text = h.text !== undefined ? h.text : typeof p.def === 'string' ? p.def : '';
        if (live !== undefined) text = Array.isArray(live) ? live.join(' ') : String(live);
        const lines = String(text).split('\n');
        state = { text, w: U.clamp(Math.ceil(Math.max.apply(null, lines.map((l) => VR.measure(l)))) + 36, 110, 420), h: Math.max(44, 30 + lines.length * 17), multiline: true };
      } else if (h.widget === 'toggle') {
        state = { value: p.def !== undefined ? !!p.def : !!h.value };
      } else if (h.widget === 'list') {
        const k = h.items.findIndex((it) => it.value === p.def);
        state = { items: U.clone(h.items), index: k >= 0 ? k : (h.index || 0), mode: 'dropdown' };
      }
      this.checkpoint();
      const f = this.doc.addNode(type, 0, 0, state, p.nick || p.name);
      const fe = this.view.renderNode(f);
      f.x = Math.round(n.x - 46 - fe.lay.w);
      f.y = Math.round(n.y + e.lay.ins[i].y - fe.lay.outs[0].y);
      this.view.renderNode(f);
      this.doc.connect(f.id, 0, n.id, i, 'replace');
      this.view.sel = new Set([f.id]);
      this.changed({});
    },
    viewOutput(n, i) {
      const e = this.view.els.get(n.id);
      this.checkpoint();
      const f = this.doc.addNode('Panel', n.x + e.lay.w + 50, n.y + e.lay.outs[i].y - 60, { text: '', w: 300, h: 120 }, 'Panel');
      this.view.renderNode(f);
      this.doc.connect(n.id, i, f.id, 0, 'replace');
      this.view.sel = new Set([f.id]);
      this.changed({});
    },

    /* == files and examples == */

    async newDoc() {
      if (this.doc.nodes.length && !(await UI.confirm('New definition', 'Start an empty definition? You can undo this.', 'Start new'))) return;
      this.checkpoint();
      this.doc.load({ name: 'Untitled', nodes: [], wires: [], groups: [], view: { x: 60, y: 40, zoom: 1 } });
      this.view.sel.clear();
      this.changed({ render: true });
      this.updateTitle();
    },
    open() {
      const inp = document.createElement('input');
      inp.type = 'file';
      inp.accept = '.json,.vrad,application/json';
      inp.addEventListener('change', () => {
        const f = inp.files && inp.files[0];
        if (!f) return;
        f.text().then((txt) => {
          let data;
          try { data = JSON.parse(txt); } catch (e) { UI.toast('That file is not valid JSON', 'error'); return; }
          this.checkpoint();
          try { this.doc.load(data); } catch (e) { UI.toast(e.message, 'error'); return; }
          this.view.sel.clear();
          this.changed({ render: true });
          this.view.zoomExtents();
          this.updateTitle();
          UI.toast('Opened ' + f.name);
        });
      });
      inp.click();
    },
    save() {
      const slug = (this.doc.name || 'definition').replace(/[^\w.-]+/g, '_');
      U.download(slug + '.vrad.json', JSON.stringify(this.doc.serialize(), null, 1), 'application/json');
      UI.toast('Saved ' + slug + '.vrad.json');
    },
    async loadExample(id) {
      const ex = VR.examples.find((x) => x.id === id);
      if (!ex) return;
      this.checkpoint();
      this.doc.load(ex.build());
      this.view.sel.clear();
      this.solve();
      this.view.renderAll();
      this.view.zoomExtents();
      this.updateTitle();
      this.saveSoon();
      UI.toast('Opened example: ' + ex.name + '. Undo returns to your previous definition.');
    },

    /* == batch files == */

    writers() {
      return this.doc.nodes.filter((n) => n.type === 'Bat.Writer' && n.enabled !== false && typeof this.doc.out(n.id, 0) === 'string');
    },
    async exportBats() {
      const ws = this.writers();
      if (!ws.length) { UI.toast('Add a Batch Writer and connect a workflow to it first', 'error'); return; }
      for (let k = 0; k < ws.length; k += 1) {
        await this.saveBat(ws[k]);
        if (k < ws.length - 1) await new Promise((r) => setTimeout(r, 350));
      }
    },
    async saveBat(n) {
      const text = this.doc.out(n.id, 0);
      const name = this.doc.out(n.id, 1);
      if (typeof text !== 'string') { UI.toast((n.nick || 'Batch Writer') + ' has nothing to save yet', 'error'); return; }
      const rt = this.doc.rt(n.id);
      if (rt.dir) {
        try {
          const fh = await rt.dir.getFileHandle(name, { create: true });
          const w = await fh.createWritable();
          await w.write(text);
          await w.close();
          UI.toast('Saved ' + name + ' in ' + rt.folderName);
          return;
        } catch (e) {
          UI.toast('Could not write into ' + rt.folderName + ' (' + e.message + '). Downloading instead.', 'error');
        }
      }
      U.download(name, text, 'application/octet-stream');
      UI.toast('Downloaded ' + name + '. Move it into your project folder and run it.');
    },
    copyBat(n) {
      const text = this.doc.out(n.id, 0);
      if (typeof text !== 'string') { UI.toast('Nothing to copy yet', 'error'); return; }
      if (!navigator.clipboard) { UI.toast('The browser blocked the clipboard', 'error'); return; }
      navigator.clipboard.writeText(text).then(() => UI.toast('Copied the batch file text'), () => UI.toast('The browser blocked the clipboard', 'error'));
    },
    async pickFolder(n) {
      if (!window.showDirectoryPicker) {
        UI.toast('This browser cannot save into a chosen folder, so .bat files download instead. Chrome and Edge can.', 'error');
        return;
      }
      try {
        const dir = await window.showDirectoryPicker({ mode: 'readwrite' });
        const rt = this.doc.rt(n.id);
        rt.dir = dir;
        rt.folderName = dir.name;
        this.changed({});
        UI.toast('This writer now saves into "' + dir.name + '"');
      } catch (e) { /* cancelled */ }
    },
    loadEpw(n) {
      const inp = document.createElement('input');
      inp.type = 'file';
      inp.accept = '.epw';
      inp.addEventListener('change', () => {
        const f = inp.files && inp.files[0];
        if (!f) return;
        f.text().then((txt) => {
          try {
            const r = VR.parseEpw(txt);
            this.editNode(n, { state: { file: f.name, header: r.header, hourly: r.hourly } });
            UI.toast('Read ' + f.name + ': ' + r.header.name + (r.hourly ? ', 8760 hours' : ''));
          } catch (e) { UI.toast(e.message, 'error'); }
        });
      });
      inp.click();
    },
    action(name, n) {
      const fn = { loadEpw: this.loadEpw, saveBat: this.saveBat, copyBat: this.copyBat, pickFolder: this.pickFolder }[name];
      if (fn) fn.call(this, n);
    },

    /* == keyboard == */

    bindKeys() {
      document.addEventListener('keydown', (e) => {
        if (UI.menuOpen() || document.querySelector('.modal-back')) return;
        const t = e.target;
        if (t && t.closest && t.closest('textarea, input, select, [contenteditable="true"]')) return;
        const mod = e.ctrlKey || e.metaKey;
        const k = e.key.toLowerCase();
        const act = (fn) => { e.preventDefault(); fn(); };
        if (mod && k === 'z') return act(() => (e.shiftKey ? this.redo() : this.undo()));
        if (mod && k === 'y') return act(() => this.redo());
        if (mod && k === 'c') return act(() => this.copy());
        if (mod && k === 'x') return act(() => this.cut());
        if (mod && k === 'v') return act(() => this.paste());
        if (mod && k === 'd') return act(() => this.duplicate());
        if (mod && k === 'a') return act(() => this.selectAll());
        if (mod && k === 'g') return act(() => (e.shiftKey ? this.ungroup() : this.group()));
        if (mod && k === 'e') return act(() => (e.shiftKey ? this.exportBats() : this.toggleEnabled(Array.from(this.view.sel))));
        if (mod && k === 's') return act(() => this.save());
        if (mod && k === 'o') return act(() => this.open());
        if (mod && (k === '=' || k === '+')) return act(() => this.zoomBy(1.25));
        if (mod && k === '-') return act(() => this.zoomBy(0.8));
        if (mod && k === '0') return act(() => this.zoomTo(1));
        if (mod) return;
        if (k === 'delete' || k === 'backspace') return act(() => this.deleteNodes(Array.from(this.view.sel)));
        if (k === 'escape') { this.view.closeRadial(); this.view.closeSearch(); this.view.sel.clear(); this.view.refreshSelection(); return; }
        if (k === 'f') return act(() => this.view.zoomExtents());
        if (k === ' ' && !e.repeat) {
          const p = this.view.pointerInStage() ? this.view.pointer : (() => { const r = this.stage.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })();
          return act(() => this.view.openRadial(p.x, p.y));
        }
        if (k.indexOf('arrow') === 0) return act(() => this.nudge(k.slice(5), e.shiftKey));
      });
    },
    nudge(dir, big) {
      const sliders = Array.from(this.view.sel).map((id) => this.doc.get(id)).filter((n) => n && n.type === 'NumberSlider');
      if (sliders.length && (dir === 'left' || dir === 'right')) {
        this.checkpoint();
        sliders.forEach((n) => {
          const st = n.state;
          const step = st.mode === 'E' || st.mode === 'O' ? 2 : st.mode === 'N' ? 1 : Math.pow(10, -(st.decimals | 0));
          const v = VR.sliderValue(st) + (dir === 'right' ? 1 : -1) * step * (big ? 10 : 1);
          st.value = VR.sliderValue(Object.assign({}, st, { value: v }));
        });
        this.changed({});
        return;
      }
      const v = this.doc.view;
      const d = big ? 200 : 60;
      if (dir === 'left') v.x += d;
      if (dir === 'right') v.x -= d;
      if (dir === 'up') v.y += d;
      if (dir === 'down') v.y -= d;
      this.view.applyView();
      this.saveSoon();
    }
  };

  // EPW header (location) and the hourly columns used by Spectral Annual:
  // direct normal illuminance (field 18), diffuse horizontal illuminance (19), total sky cover (23).
  VR.parseEpw = function (text) {
    const lines = text.split(/\r?\n/);
    const head = lines[0].split(',');
    if (!/^LOCATION$/i.test((head[0] || '').trim())) throw new Error('This is not an EPW file (the first line should start with LOCATION)');
    const header = {
      name: [head[1], head[2], head[3]].map((s) => (s || '').trim()).filter((s) => s && s !== '-').join(', '),
      lat: Number(head[6]), lon: Number(head[7]), tz: Number(head[8]), elev: Number(head[9])
    };
    if (![header.lat, header.lon, header.tz].every(isFinite)) throw new Error('The EPW location line could not be read');
    const dn = [];
    const dh = [];
    const cc = [];
    const clean = (v, max) => (isFinite(v) && v >= 0 && v < max ? v : 0);
    for (let i = 8; i < lines.length; i += 1) {
      const f = lines[i].split(',');
      if (f.length < 23) continue;
      if (Number(f[1]) === 2 && Number(f[2]) === 29) continue;
      dn.push(Math.round(clean(Number(f[17]), 999000)));
      dh.push(Math.round(clean(Number(f[18]), 999000)));
      cc.push(clean(Number(f[22]), 11));
    }
    const hourly = dn.length >= 8760 ? { dn: dn.slice(0, 8760), dh: dh.slice(0, 8760), cc: cc.slice(0, 8760) } : null;
    return { header, hourly };
  };

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => app.init());
    else app.init();
  }
})(window.VR);
