/* Visual Radiance: the canvas. Pan, zoom, wires, selection, groups, search,
   context menus, radial menu, tooltips and the navigation map. */
(function (VR) {
  'use strict';
  const U = VR.util;
  const T = VR.types;
  const el = U.el;

  function curve(a, b) {
    const dx = Math.max(Math.abs(b.x - a.x) * 0.5, 36);
    return 'M' + a.x + ',' + a.y + ' C' + (a.x + dx) + ',' + a.y + ' ' + (b.x - dx) + ',' + b.y + ' ' + b.x + ',' + b.y;
  }

  const GROUP_COLORS = [['blue', 'Blue'], ['green', 'Green'], ['sand', 'Sand'], ['rose', 'Rose'], ['grey', 'Grey']];

  class CanvasView {
    constructor(app, stage) {
      this.app = app;
      this.stage = stage;
      this.world = el('div', 'world');
      this.groupLayer = el('div', 'group-layer');
      this.svg = U.svg('svg', { class: 'wires', width: '1', height: '1', 'aria-hidden': 'true' });
      this.wireLayer = U.svg('g');
      this.svg.appendChild(this.wireLayer);
      this.nodeLayer = el('div', 'node-layer');
      this.world.append(this.groupLayer, this.svg, this.nodeLayer);
      this.boxEl = el('div', 'sel-box');
      this.boxEl.hidden = true;
      this.hintEl = el('div', 'empty-hint', 'Double-click the canvas to add a component, or open an example from the File menu.');
      stage.append(this.world, this.boxEl, this.hintEl);
      this.els = new Map();
      this.wireEls = new Map();
      this.groupEls = new Map();
      this.sel = new Set();
      this.drag = null;
      this.pointer = { x: 0, y: 0 };
      this.frame = 0;
      this.minimap = new Minimap(this);
      this.bind();
    }

    get doc() { return this.app.doc; }

    /* == coordinates and view == */

    toWorld(cx, cy) {
      const r = this.stage.getBoundingClientRect();
      const v = this.doc.view;
      return { x: (cx - r.left - v.x) / v.zoom, y: (cy - r.top - v.y) / v.zoom };
    }
    centerWorld() {
      const r = this.stage.getBoundingClientRect();
      return this.toWorld(r.left + r.width / 2, r.top + r.height / 2);
    }
    pointerInStage() {
      const r = this.stage.getBoundingClientRect();
      const p = this.pointer;
      return p.x >= r.left && p.x <= r.right && p.y >= r.top && p.y <= r.bottom;
    }
    applyView() {
      const v = this.doc.view;
      this.world.style.transform = 'translate(' + v.x + 'px,' + v.y + 'px) scale(' + v.zoom + ')';
      const big = 100 * v.zoom;
      const small = 20 * v.zoom;
      this.stage.style.backgroundSize = big + 'px ' + big + 'px,' + big + 'px ' + big + 'px,' + small + 'px ' + small + 'px,' + small + 'px ' + small + 'px';
      this.stage.style.backgroundPosition = v.x + 'px ' + v.y + 'px';
      this.stage.classList.toggle('far', v.zoom < 0.5);
      this.minimap.draw();
      this.app.updateStatus();
    }
    zoomAt(cx, cy, factor) {
      const v = this.doc.view;
      const r = this.stage.getBoundingClientRect();
      const px = cx - r.left;
      const py = cy - r.top;
      const z = U.clamp(v.zoom * factor, 0.1, 3);
      const k = z / v.zoom;
      v.x = px - (px - v.x) * k;
      v.y = py - (py - v.y) * k;
      v.zoom = z;
      this.applyView();
      this.app.saveSoon();
    }
    bounds(nodes) {
      let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
      nodes.forEach((n) => {
        const e = this.els.get(n.id);
        if (!e) return;
        x0 = Math.min(x0, n.x); y0 = Math.min(y0, n.y);
        x1 = Math.max(x1, n.x + e.lay.w); y1 = Math.max(y1, n.y + e.lay.h);
      });
      return isFinite(x0) ? { x0, y0, x1, y1 } : null;
    }
    zoomExtents(ids) {
      const nodes = ids && ids.length ? ids.map((id) => this.doc.get(id)).filter(Boolean) : this.doc.nodes;
      const b = this.bounds(nodes);
      const v = this.doc.view;
      if (!b) { v.x = 60; v.y = 40; v.zoom = 1; this.applyView(); return; }
      const r = this.stage.getBoundingClientRect();
      const pad = 48;
      const z = U.clamp(Math.min((r.width - 2 * pad) / (b.x1 - b.x0), (r.height - 2 * pad) / (b.y1 - b.y0)), 0.1, 1.25);
      v.zoom = z;
      v.x = (r.width - (b.x1 - b.x0) * z) / 2 - b.x0 * z;
      v.y = (r.height - (b.y1 - b.y0) * z) / 2 - b.y0 * z;
      this.applyView();
      this.app.saveSoon();
    }

    /* == rendering == */

    widgetOf(n) {
      const spec = VR.components[n.type];
      return (spec && spec.widget && VR.widgets[spec.widget]) || VR.widgets.component;
    }
    renderAll() {
      this.nodeLayer.textContent = '';
      this.els.clear();
      this.doc.nodes.forEach((n) => this.renderNode(n));
      Array.from(this.sel).forEach((id) => { if (!this.doc.get(id)) this.sel.delete(id); });
      this.refresh();
      this.applyView();
    }
    renderNode(n) {
      const spec = VR.components[n.type];
      const w = this.widgetOf(n);
      const lay = w.layout(this, n, spec);
      const root = el('div', 'node ' + w.cls);
      root.dataset.id = n.id;
      root.style.left = n.x + 'px';
      root.style.top = n.y + 'px';
      root.style.width = lay.w + 'px';
      root.style.height = lay.h + 'px';
      w.build(this, n, spec, root, lay);
      root.querySelectorAll('.io').forEach((io, k) => {
        const ins = spec ? spec.inputs.length : 0;
        io.dataset.port = k < ins ? 'in' : 'out';
        io.dataset.i = k < ins ? k : k - ins;
      });
      lay.ins.forEach((p, i) => root.appendChild(this.grip('in', i, p)));
      lay.outs.forEach((p, i) => root.appendChild(this.grip('out', i, p)));
      root.appendChild(el('span', 'bubble'));
      const old = this.els.get(n.id);
      if (old && old.root.parentNode) old.root.replaceWith(root);
      else this.nodeLayer.appendChild(root);
      const e = { root, lay, widget: w };
      this.els.set(n.id, e);
      return e;
    }
    grip(side, i, p) {
      const g = el('span', 'grip ' + side);
      g.dataset.port = side;
      g.dataset.i = i;
      g.style.left = p.x + 'px';
      g.style.top = p.y + 'px';
      return g;
    }
    rerender(n) {
      this.renderNode(n);
      this.refreshNode(n);
      this.renderWires();
      this.renderGroups();
      this.minimap.draw();
    }
    refresh(except) {
      this.doc.nodes.forEach((n) => (n.id === except ? this.refreshClasses(n) : this.refreshNode(n)));
      this.renderWires();
      this.renderGroups();
      this.minimap.draw();
      this.hintEl.hidden = this.doc.nodes.length > 0;
    }
    refreshNode(n) {
      const e = this.els.get(n.id);
      if (!e) return;
      this.refreshClasses(n);
      if (e.widget.update) e.widget.update(this, n, e);
    }
    refreshClasses(n) {
      const e = this.els.get(n.id);
      if (!e) return;
      const lvl = this.doc.level(n.id);
      const c = e.root.classList;
      c.toggle('sel', this.sel.has(n.id));
      c.toggle('warn', lvl === 'warning');
      c.toggle('err', lvl === 'error');
      c.toggle('off', n.enabled === false);
      const b = e.root.querySelector(':scope > .bubble');
      b.className = 'bubble' + (lvl ? ' ' + lvl : '');
      b.textContent = lvl === 'remark' ? 'i' : lvl ? '!' : '';
    }
    refreshSelection() {
      this.doc.nodes.forEach((n) => this.refreshClasses(n));
      this.renderWires();
      this.renderGroups();
      this.minimap.draw();
      this.app.updateStatus();
    }
    port(n, side, i) {
      const e = this.els.get(n.id);
      if (!e) return null;
      const p = (side === 'in' ? e.lay.ins : e.lay.outs)[i];
      return p ? { x: n.x + p.x, y: n.y + p.y } : null;
    }
    renderWires() {
      const seen = new Set();
      const global = this.app.wireMode || 'default';
      this.doc.wires.forEach((w) => {
        const a = this.doc.get(w.from);
        const b = this.doc.get(w.to);
        if (!a || !b) return;
        const p1 = this.port(a, 'out', w.out);
        const p2 = this.port(b, 'in', w.in);
        if (!p1 || !p2) return;
        let g = this.wireEls.get(w.id);
        if (!g) {
          g = { base: U.svg('path'), inner: U.svg('path') };
          this.wireLayer.append(g.base, g.inner);
          this.wireEls.set(w.id, g);
        }
        const d = curve(p1, p2);
        g.base.setAttribute('d', d);
        g.inner.setAttribute('d', d);
        const val = this.doc.out(w.from, w.out);
        const list = Array.isArray(val) && T.flat(val).length > 1;
        const hot = this.sel.has(w.from) || this.sel.has(w.to);
        let mode = (b.wireModes && b.wireModes[w.in]) || global;
        if (hot && mode === 'hidden') mode = 'faint';
        const cls = ' m-' + mode + (list ? ' list' : '') + (hot ? ' hot' : '') + (val === undefined || val === null ? ' empty' : '');
        g.base.setAttribute('class', 'wire' + cls);
        g.inner.setAttribute('class', 'wire-in' + cls);
        seen.add(w.id);
      });
      this.wireEls.forEach((g, id) => {
        if (!seen.has(id)) { g.base.remove(); g.inner.remove(); this.wireEls.delete(id); }
      });
    }
    renderGroups() {
      const seen = new Set();
      this.doc.groups.forEach((g) => {
        const b = this.bounds(g.members.map((id) => this.doc.get(id)).filter(Boolean));
        if (!b) return;
        let d = this.groupEls.get(g.id);
        if (!d) {
          d = el('div', 'group');
          d.dataset.gid = g.id;
          d.appendChild(el('div', 'g-title'));
          this.groupLayer.appendChild(d);
          this.groupEls.set(g.id, d);
        }
        const all = g.members.length && g.members.every((id) => this.sel.has(id));
        d.className = 'group gc-' + (g.color || 'blue') + (all ? ' sel' : '');
        const pad = 14;
        d.style.left = (b.x0 - pad) + 'px';
        d.style.top = (b.y0 - pad - 22) + 'px';
        d.style.width = (b.x1 - b.x0 + 2 * pad) + 'px';
        d.style.height = (b.y1 - b.y0 + 2 * pad + 22) + 'px';
        d.firstChild.textContent = g.name;
        seen.add(g.id);
      });
      this.groupEls.forEach((d, id) => { if (!seen.has(id)) { d.remove(); this.groupEls.delete(id); } });
    }
    schedule() {
      if (this.frame) return;
      this.frame = requestAnimationFrame(() => {
        this.frame = 0;
        this.renderWires();
        this.renderGroups();
        this.minimap.draw();
      });
    }

    /* == events == */

    bind() {
      const s = this.stage;
      s.addEventListener('pointerdown', (e) => this.onDown(e));
      s.addEventListener('pointermove', (e) => this.onMove(e));
      s.addEventListener('pointerup', (e) => this.onUp(e));
      s.addEventListener('pointercancel', (e) => this.onUp(e, true));
      s.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
      s.addEventListener('dblclick', (e) => this.onDbl(e));
      s.addEventListener('contextmenu', (e) => { if (!e.target.closest('textarea, input')) e.preventDefault(); });
      s.addEventListener('pointerover', (e) => this.onOver(e));
      s.addEventListener('pointerleave', () => VR.ui.hideTip());
      window.addEventListener('pointermove', (e) => { this.pointer = { x: e.clientX, y: e.clientY }; }, { passive: true });
      window.addEventListener('resize', () => this.applyView());
    }
    capture(e) {
      try { this.stage.setPointerCapture(e.pointerId); } catch (err) { /* pointer already gone */ }
    }

    onDown(e) {
      VR.ui.hideTip();
      this.closeRadial();
      this.pointer = { x: e.clientX, y: e.clientY };
      const t = e.target;
      if (t.closest('.minimap')) return;
      if (e.button === 1) { e.preventDefault(); this.startPan(e, true); return; }
      if (e.button === 2) { this.startPan(e, false); return; }
      if (e.button !== 0) return;
      const nodeEl = t.closest('.node');
      if (t.closest('textarea')) {
        if (nodeEl && !this.sel.has(nodeEl.dataset.id)) { this.sel.clear(); this.sel.add(nodeEl.dataset.id); this.refreshSelection(); }
        return;
      }
      const grip = t.closest('.grip');
      if (grip) { this.startWire(e, grip); return; }
      if (nodeEl) {
        const n = this.doc.get(nodeEl.dataset.id);
        if (!n) return;
        const ctl = t.closest('[data-ctl]');
        if (ctl && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
          const w = this.els.get(n.id).widget;
          if (w.down && w.down(this, n, ctl, e)) { e.preventDefault(); return; }
        }
        this.pick(n.id, e);
        this.startMove(e, n.id);
        return;
      }
      const gEl = t.closest('.group');
      if (gEl) {
        const g = this.doc.groups.find((x) => x.id === gEl.dataset.gid);
        if (g) {
          if (!(e.shiftKey || e.ctrlKey || e.metaKey)) this.sel.clear();
          g.members.forEach((id) => ((e.ctrlKey || e.metaKey) ? this.sel.delete(id) : this.sel.add(id)));
          this.refreshSelection();
          if (g.members.length) this.startMove(e, g.members[0]);
          return;
        }
      }
      this.startBox(e);
    }

    onMove(e) {
      const d = this.drag;
      if (!d) return;
      const v = this.doc.view;
      const dist = Math.hypot(e.clientX - d.sx, e.clientY - d.sy);
      if (d.kind === 'pan') {
        if (!d.moved && dist < 4) return;
        d.moved = true;
        this.stage.classList.add('panning');
        v.x = d.vx + (e.clientX - d.sx);
        v.y = d.vy + (e.clientY - d.sy);
        this.applyView();
      } else if (d.kind === 'move') {
        if (!d.moved) {
          if (dist < 3) return;
          if (!d.dup) this.app.checkpoint();
          d.moved = true;
        }
        let dx = (e.clientX - d.sx) / v.zoom;
        let dy = (e.clientY - d.sy) / v.zoom;
        if (e.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
        d.items.forEach((it) => {
          it.n.x = Math.round(it.x + dx);
          it.n.y = Math.round(it.y + dy);
          const x = this.els.get(it.n.id);
          if (x) { x.root.style.left = it.n.x + 'px'; x.root.style.top = it.n.y + 'px'; }
        });
        this.schedule();
      } else if (d.kind === 'box') {
        if (!d.moved && dist < 4) return;
        d.moved = true;
        this.updateBox(e);
      } else if (d.kind === 'wire') {
        this.updateWire(e);
      } else if (d.kind === 'control') {
        if (d.onMove) d.onMove(e);
      } else if (d.kind === 'resize' || d.kind === 'width') {
        if (!d.moved) { if (dist < 2) return; this.app.checkpoint(); d.moved = true; }
        const st = d.n.state;
        st.w = Math.round(Math.max(d.min, d.w + (e.clientX - d.sx) / v.zoom));
        if (d.kind === 'resize') st.h = Math.round(Math.max(36, d.h + (e.clientY - d.sy) / v.zoom));
        this.rerender(d.n);
      }
    }

    onUp(e, cancelled) {
      const d = this.drag;
      if (!d) return;
      this.drag = null;
      try { this.stage.releasePointerCapture(e.pointerId); } catch (err) { /* not captured */ }
      if (d.kind === 'pan') {
        this.stage.classList.remove('panning');
        if (!d.right || d.moved) { if (d.moved) this.app.saveSoon(); return; }
        if (!cancelled) this.contextMenu(e, d.target);
      } else if (d.kind === 'move') {
        if (d.moved || d.dup) this.app.changed({ solve: false });
      } else if (d.kind === 'box') {
        this.boxEl.hidden = true;
        if (!d.moved && d.mode === 'set') { this.sel.clear(); this.refreshSelection(); }
      } else if (d.kind === 'wire') {
        this.finishWire(e, cancelled, d);
      } else if (d.kind === 'control') {
        if (d.onEnd) d.onEnd(e);
      } else if (d.kind === 'resize' || d.kind === 'width') {
        if (d.moved) this.app.changed({ solve: false });
      }
    }

    onWheel(e) {
      const sc = e.target.closest('.p-view, .p-text');
      if (sc && !e.ctrlKey && sc.scrollHeight > sc.clientHeight + 1) return;
      e.preventDefault();
      const unit = e.deltaMode === 1 ? 0.05 : e.deltaMode === 2 ? 0.5 : 0.0015;
      this.zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * unit * (e.ctrlKey ? 2 : 1)));
    }

    onDbl(e) {
      // Pointer capture retargets dblclick to the stage, so look at what is under the pointer.
      const t = document.elementFromPoint(e.clientX, e.clientY) || e.target;
      if (t.closest('textarea, .minimap')) return;
      const nodeEl = t.closest('.node');
      if (nodeEl) {
        const n = this.doc.get(nodeEl.dataset.id);
        if (!n) return;
        const w = this.els.get(n.id).widget;
        if (w.dbl && w.dbl(this, n, t, e)) return;
        const spec = VR.components[n.type];
        if (spec && spec.dblclick) { this.app.action(spec.dblclick, n); return; }
        if (spec && !spec.widget) VR.ui.help(n.type);
        return;
      }
      const gEl = t.closest('.group');
      if (gEl) { this.renameGroup(gEl.dataset.gid); return; }
      this.openSearch(e.clientX, e.clientY);
    }

    onOver(e) {
      if (this.drag) return;
      const t = e.target;
      const nodeEl = t.closest('.node');
      const n = nodeEl && this.doc.get(nodeEl.dataset.id);
      if (!n) { VR.ui.hideTip(); return; }
      const portEl = t.closest('[data-port]');
      if (portEl) { VR.ui.tipLater(() => this.portTip(n, portEl.dataset.port, Number(portEl.dataset.i)), e.clientX, e.clientY); return; }
      if (t.closest('.core, .bubble, .w-label, .p-head')) { VR.ui.tipLater(() => this.nodeTip(n), e.clientX, e.clientY); return; }
      VR.ui.hideTip();
    }

    /* == selection and moving == */

    pick(id, e) {
      if (e.ctrlKey || e.metaKey) {
        if (e.shiftKey && !this.sel.has(id)) this.sel.add(id);
        else this.sel.delete(id);
      } else if (e.shiftKey) this.sel.add(id);
      else if (!this.sel.has(id)) { this.sel.clear(); this.sel.add(id); }
      this.refreshSelection();
    }
    startMove(e, id) {
      if (!this.sel.has(id)) return;
      let dup = false;
      if (e.altKey) {
        this.app.checkpoint();
        const ids = this.doc.insert(this.doc.serialize(Array.from(this.sel)), 0, 0);
        this.app.solve();
        ids.forEach((nid) => this.renderNode(this.doc.get(nid)));
        this.sel = new Set(ids);
        this.refresh();
        dup = true;
      }
      const items = Array.from(this.sel).map((sid) => this.doc.get(sid)).filter(Boolean).map((n) => ({ n, x: n.x, y: n.y }));
      this.drag = { kind: 'move', sx: e.clientX, sy: e.clientY, items, moved: false, dup };
      this.capture(e);
    }
    startBox(e) {
      const mode = (e.ctrlKey || e.metaKey) ? 'remove' : e.shiftKey ? 'add' : 'set';
      this.drag = { kind: 'box', sx: e.clientX, sy: e.clientY, mode, base: new Set(this.sel), moved: false };
      this.capture(e);
    }
    updateBox(e) {
      const d = this.drag;
      const r = this.stage.getBoundingClientRect();
      const x0 = Math.min(d.sx, e.clientX);
      const y0 = Math.min(d.sy, e.clientY);
      const x1 = Math.max(d.sx, e.clientX);
      const y1 = Math.max(d.sy, e.clientY);
      const crossing = e.clientX < d.sx;
      Object.assign(this.boxEl.style, { left: (x0 - r.left) + 'px', top: (y0 - r.top) + 'px', width: (x1 - x0) + 'px', height: (y1 - y0) + 'px' });
      this.boxEl.hidden = false;
      this.boxEl.classList.toggle('crossing', crossing);
      const a = this.toWorld(x0, y0);
      const b = this.toWorld(x1, y1);
      const sel = d.mode === 'set' ? new Set() : new Set(d.base);
      this.doc.nodes.forEach((n) => {
        const x = this.els.get(n.id);
        if (!x) return;
        const nx1 = n.x + x.lay.w;
        const ny1 = n.y + x.lay.h;
        const hit = crossing ? (n.x < b.x && nx1 > a.x && n.y < b.y && ny1 > a.y)
          : (n.x >= a.x && nx1 <= b.x && n.y >= a.y && ny1 <= b.y);
        if (hit) { if (d.mode === 'remove') sel.delete(n.id); else sel.add(n.id); }
      });
      this.sel = sel;
      this.refreshSelection();
    }
    startPan(e, immediate) {
      this.drag = { kind: 'pan', sx: e.clientX, sy: e.clientY, vx: this.doc.view.x, vy: this.doc.view.y, moved: !!immediate, right: !immediate, target: e.target };
      this.capture(e);
    }
    startControl(e, n, onMove, onEnd) {
      this.drag = { kind: 'control', sx: e.clientX, sy: e.clientY, n, onMove, onEnd };
      this.capture(e);
    }
    startResize(e, n) {
      this.drag = { kind: 'resize', sx: e.clientX, sy: e.clientY, n, w: n.state.w || 200, h: n.state.h || 64, min: 60, moved: false };
      this.capture(e);
    }
    startWidth(e, n, min) {
      const x = this.els.get(n.id);
      this.drag = { kind: 'width', sx: e.clientX, sy: e.clientY, n, w: x ? x.lay.w : (n.state.w || 220), min, moved: false };
      this.capture(e);
    }

    /* == wires == */

    startWire(e, grip) {
      const n = this.doc.get(grip.closest('.node').dataset.id);
      if (!n) return;
      const temp = U.svg('path', { class: 'wire temp' });
      this.wireLayer.appendChild(temp);
      this.stage.classList.add('wiring');
      this.drag = { kind: 'wire', sx: e.clientX, sy: e.clientY, n, side: grip.dataset.port, i: Number(grip.dataset.i), temp,
        target: null, moveAll: (e.ctrlKey || e.metaKey) && e.shiftKey, mode: 'replace' };
      this.capture(e);
      this.updateWire(e);
    }
    updateWire(e) {
      const d = this.drag;
      const from = this.port(d.n, d.side, d.i);
      let to = this.toWorld(e.clientX, e.clientY);
      const hit = document.elementFromPoint(e.clientX, e.clientY);
      const g = hit && hit.closest ? hit.closest('.grip') : null;
      let target = null;
      if (g) {
        const tn = this.doc.get(g.closest('.node').dataset.id);
        const ts = g.dataset.port;
        const ti = Number(g.dataset.i);
        const ok = d.moveAll ? (ts === d.side && !(tn.id === d.n.id && ti === d.i)) : (tn.id !== d.n.id && ts !== d.side);
        if (tn && ok) { target = { n: tn, side: ts, i: ti, el: g }; to = this.port(tn, ts, ti); }
      }
      if (d.target && (!target || d.target.el !== target.el)) d.target.el.classList.remove('target');
      if (target) target.el.classList.add('target');
      d.target = target;
      d.mode = d.moveAll ? 'move' : (e.ctrlKey || e.metaKey) ? 'remove' : e.shiftKey ? 'add' : 'replace';
      const a = d.side === 'out' ? from : to;
      const b = d.side === 'out' ? to : from;
      d.temp.setAttribute('d', d.moveAll && target ? curve(from, to) : curve(a, b));
      d.temp.setAttribute('class', 'wire temp mode-' + d.mode);
    }
    finishWire(e, cancelled, d) {
      this.stage.classList.remove('wiring');
      d.temp.remove();
      if (d.target) d.target.el.classList.remove('target');
      if (cancelled) return;
      const app = this.app;
      if (!d.target) {
        // Dropped on empty canvas: search for a component and connect it to this grip.
        const moved = Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > 12;
        const hit = document.elementFromPoint(e.clientX, e.clientY);
        if (moved && !d.moveAll && hit && !hit.closest('.node')) this.openSearch(e.clientX, e.clientY, { connect: { n: d.n, side: d.side, i: d.i } });
        return;
      }
      const t = d.target;
      app.checkpoint();
      if (d.moveAll) {
        // Ctrl+Shift drag: move every wire on this grip to another grip.
        this.doc.wires.forEach((w) => {
          if (d.side === 'in' && w.to === d.n.id && w.in === d.i) { w.to = t.n.id; w.in = t.i; }
          if (d.side === 'out' && w.from === d.n.id && w.out === d.i) { w.from = t.n.id; w.out = t.i; }
        });
        const seen = new Set();
        this.doc.wires = this.doc.wires.filter((w) => {
          const k = w.from + ':' + w.out + '>' + w.to + ':' + w.in;
          if (seen.has(k) || w.from === w.to) return false;
          seen.add(k);
          return true;
        });
      } else {
        const out = d.side === 'out' ? { n: d.n, i: d.i } : { n: t.n, i: t.i };
        const inp = d.side === 'out' ? { n: t.n, i: t.i } : { n: d.n, i: d.i };
        this.doc.connect(out.n.id, out.i, inp.n.id, inp.i, d.mode === 'add' ? 'add' : d.mode === 'remove' ? 'remove' : 'replace');
      }
      app.changed({});
    }

    /* == menus == */

    contextMenu(e, target) {
      const portEl = target.closest && target.closest('[data-port]');
      const nodeEl = target.closest && target.closest('.node');
      if (portEl && nodeEl) { this.portMenu(e, this.doc.get(nodeEl.dataset.id), portEl.dataset.port, Number(portEl.dataset.i)); return; }
      if (nodeEl) {
        const n = this.doc.get(nodeEl.dataset.id);
        if (!this.sel.has(n.id)) { this.sel.clear(); this.sel.add(n.id); this.refreshSelection(); }
        this.nodeMenu(e, n);
        return;
      }
      const gEl = target.closest && target.closest('.group');
      if (gEl) { this.groupMenu(e, gEl.dataset.gid); return; }
      this.canvasMenu(e);
    }

    nodeMenu(e, n) {
      const app = this.app;
      const spec = VR.components[n.type];
      const w = this.els.get(n.id).widget;
      const items = [{ header: spec ? spec.name : n.type }];
      (this.doc.msgs.get(n.id) || []).forEach((m) => items.push({ note: (m.level === 'error' ? 'Error: ' : m.level === 'warning' ? 'Warning: ' : '') + m.text }));
      if (items.length > 1) items.push({ sep: true });
      items.push({ label: 'Rename...', action: () => VR.ui.prompt('Rename', 'Name', n.nick).then((v) => { if (v !== null && v.trim()) app.editNode(n, { nick: v.trim() }, true); }) });
      items.push({ label: 'Enabled', checked: n.enabled !== false, shortcut: 'Ctrl+E', action: () => app.toggleEnabled([n.id]) });
      if (w.menu) { items.push({ sep: true }); w.menu(this, n).forEach((x) => items.push(x)); }
      if (spec && spec.menu) {
        items.push({ sep: true });
        spec.menu.forEach((m) => {
          if (m.options) {
            items.push({ label: m.label, sub: m.options.map((o) => ({ label: o.label, checked: n.state[m.key] === o.value,
              action: () => app.editNode(n, { state: { [m.key]: o.value } }) })) });
          } else items.push({ label: m.label, action: () => app.action(m.action, n) });
        });
      }
      items.push({ sep: true }, { label: 'Help', action: () => VR.ui.help(n.type) },
        { label: 'Delete', shortcut: 'Del', action: () => app.deleteNodes(this.sel.has(n.id) ? Array.from(this.sel) : [n.id]) });
      VR.ui.menu(items, e.clientX, e.clientY);
    }

    portMenu(e, n, side, i) {
      const app = this.app;
      const spec = VR.components[n.type];
      if (!spec) return;
      const p = side === 'in' ? spec.inputs[i] : spec.outputs[i];
      if (!p) return;
      const items = [{ header: (p.name || 'Input') + (p.nick && p.nick !== p.name ? '  (' + p.nick + ')' : '') }];
      if (p.desc) items.push({ note: p.desc });
      if (side === 'in') {
        const wires = this.doc.wiresTo(n.id, i);
        items.push({ sep: true });
        if (p.hint) items.push({ label: 'Add ' + hintName(p.hint), action: () => app.extract(n, i, p.hint) });
        if (!p.hint || p.hint.widget !== 'panel') items.push({ label: 'Add panel', action: () => app.extract(n, i, { widget: 'panel', text: '' }) });
        items.push({ label: 'Disconnect', disabled: !wires.length, action: () => { app.checkpoint(); this.doc.disconnectInput(n.id, i); app.changed({}); } });
        const cur = (n.wireModes && n.wireModes[i]) || 'default';
        items.push({ label: 'Wire display', sub: ['default', 'faint', 'hidden'].map((m) => ({ label: m[0].toUpperCase() + m.slice(1), checked: cur === m,
          action: () => { n.wireModes = Object.assign({}, n.wireModes, { [i]: m }); if (m === 'default') delete n.wireModes[i]; app.changed({ solve: false }); } })) });
      } else {
        items.push({ sep: true });
        items.push({ label: 'Add panel to read this output', action: () => app.viewOutput(n, i) });
        items.push({ label: 'Disconnect all', disabled: !this.doc.wiresFrom(n.id, i).length,
          action: () => { app.checkpoint(); this.doc.disconnectOutput(n.id, i); app.changed({}); } });
      }
      VR.ui.menu(items, e.clientX, e.clientY);
    }

    groupMenu(e, gid) {
      const app = this.app;
      const g = this.doc.groups.find((x) => x.id === gid);
      if (!g) return;
      VR.ui.menu([
        { header: g.name },
        { label: 'Rename...', action: () => this.renameGroup(gid) },
        { label: 'Colour', sub: GROUP_COLORS.map(([k, l]) => ({ label: l, checked: (g.color || 'blue') === k,
          action: () => { app.checkpoint(); g.color = k; app.changed({ solve: false }); } })) },
        { label: 'Ungroup', action: () => { app.checkpoint(); this.doc.groups = this.doc.groups.filter((x) => x !== g); app.changed({ solve: false }); } }
      ], e.clientX, e.clientY);
    }

    renameGroup(gid) {
      const g = this.doc.groups.find((x) => x.id === gid);
      if (!g) return;
      VR.ui.prompt('Rename group', 'Name', g.name).then((v) => {
        if (v === null || !v.trim()) return;
        this.app.checkpoint();
        g.name = v.trim();
        this.app.changed({ solve: false });
      });
    }

    canvasMenu(e) {
      const app = this.app;
      const at = this.toWorld(e.clientX, e.clientY);
      VR.ui.menu([
        { label: 'Add component...', action: () => this.openSearch(e.clientX, e.clientY) },
        { label: 'Paste', shortcut: 'Ctrl+V', disabled: !app.clip, action: () => app.paste(at) },
        { label: 'Select all', shortcut: 'Ctrl+A', action: () => app.selectAll() },
        { label: 'Zoom to fit', shortcut: 'F', action: () => this.zoomExtents() },
        { sep: true },
        { label: 'Wire display', sub: ['default', 'faint', 'hidden'].map((m) => ({ label: m[0].toUpperCase() + m.slice(1), checked: (app.wireMode || 'default') === m,
          action: () => app.setWireMode(m) })) }
      ], e.clientX, e.clientY);
    }

    /* == tooltips == */

    portTip(n, side, i) {
      const spec = VR.components[n.type];
      if (!spec) return null;
      const p = side === 'in' ? spec.inputs[i] : spec.outputs[i];
      if (!p) return null;
      const box = el('div');
      box.appendChild(el('div', 'tip-title', (p.name || 'Data') + (p.nick && p.nick !== p.name ? ' (' + p.nick + ')' : '')));
      box.appendChild(el('div', 'tip-sub', (side === 'in' ? (p.access === 'list' ? 'List input' : 'Item input') + (p.optional === false ? ', required' : ', optional') : 'Output')));
      if (p.desc) box.appendChild(el('div', 'tip-desc', p.desc));
      let v;
      let src = '';
      if (side === 'out') v = this.doc.out(n.id, i);
      else {
        const ws = this.doc.wiresTo(n.id, i);
        if (ws.length) {
          const vals = ws.map((w) => this.doc.out(w.from, w.out)).filter((x) => x !== undefined && x !== null);
          v = vals.length === 1 ? vals[0] : vals.length ? vals : undefined;
          src = ws.length > 1 ? ws.length + ' wires' : '';
        } else if (p.def !== undefined) { v = p.def; src = 'default'; }
      }
      const text = v === undefined || v === null ? '(no data)' : VR.display(v);
      const lines = text.split('\n');
      const pre = el('pre', 'tip-val', lines.slice(0, 8).join('\n') + (lines.length > 8 ? '\n...' : ''));
      box.appendChild(el('div', 'tip-sub', 'Value' + (src ? ' (' + src + ')' : '') + ': ' + T.label(v)));
      box.appendChild(pre);
      return box;
    }
    nodeTip(n) {
      const spec = VR.components[n.type];
      const box = el('div');
      box.appendChild(el('div', 'tip-title', spec ? spec.name : n.type));
      if (spec && spec.desc) box.appendChild(el('div', 'tip-desc', spec.desc));
      (this.doc.msgs.get(n.id) || []).forEach((m) => box.appendChild(el('div', 'tip-msg ' + m.level, m.text)));
      return box;
    }

    /* == search == */

    openSearch(cx, cy, opt) {
      this.closeSearch();
      const pop = el('div', 'search-pop');
      const inp = el('input', 'search-inp');
      inp.placeholder = 'Search components, type a number for a slider, or "text for a panel';
      inp.setAttribute('aria-label', 'Search components');
      const list = el('div', 'search-list');
      list.setAttribute('role', 'listbox');
      pop.append(inp, list);
      document.body.appendChild(pop);
      pop.style.left = Math.max(6, Math.min(cx - 24, window.innerWidth - 380)) + 'px';
      pop.style.top = Math.max(6, Math.min(cy - 18, window.innerHeight - 350)) + 'px';
      const at = this.toWorld(cx, cy);
      let results = [];
      let cur = 0;
      const draw = () => {
        list.textContent = '';
        results.forEach((r, i) => {
          const b = el('button', 'search-item' + (i === cur ? ' on' : ''));
          b.type = 'button';
          b.setAttribute('role', 'option');
          b.innerHTML = VR.icon(r.icon, 20);
          const txt = el('span', 'search-text');
          txt.appendChild(el('span', 'search-name', r.label));
          txt.appendChild(el('span', 'search-desc', r.sub || ''));
          b.appendChild(txt);
          b.addEventListener('pointerdown', (ev) => { ev.preventDefault(); choose(r); });
          list.appendChild(b);
        });
      };
      const update = () => { results = VR.searchComponents(inp.value); cur = 0; draw(); };
      const choose = (r) => { this.closeSearch(); this.app.addFromSearch(r, at, opt && opt.connect); };
      inp.addEventListener('input', update);
      inp.addEventListener('keydown', (ev) => {
        if (ev.key === 'ArrowDown') { cur = Math.min(results.length - 1, cur + 1); draw(); ev.preventDefault(); }
        else if (ev.key === 'ArrowUp') { cur = Math.max(0, cur - 1); draw(); ev.preventDefault(); }
        else if (ev.key === 'Enter') { if (results[cur]) choose(results[cur]); ev.preventDefault(); }
        else if (ev.key === 'Escape') { this.closeSearch(); ev.preventDefault(); }
        ev.stopPropagation();
      });
      inp.addEventListener('blur', () => setTimeout(() => { if (this.searchEl === pop) this.closeSearch(); }, 120));
      this.searchEl = pop;
      update();
      setTimeout(() => inp.focus(), 0);
    }
    closeSearch() {
      if (this.searchEl) { this.searchEl.remove(); this.searchEl = null; }
    }

    /* == radial menu == */

    openRadial(cx, cy) {
      this.closeRadial();
      const app = this.app;
      const r = el('div', 'radial');
      r.style.left = cx + 'px';
      r.style.top = cy + 'px';
      const items = [
        ['Search', 'search', () => this.openSearch(cx, cy)],
        ['Zoom to fit', 'fit', () => this.zoomExtents()],
        ['Group', 'group', () => app.group()],
        ['Enable or disable', 'power', () => app.toggleEnabled(Array.from(this.sel))],
        ['Delete', 'trash', () => app.deleteNodes(Array.from(this.sel))],
        ['Undo', 'undo', () => app.undo()],
        ['Export .bat', 'writer', () => app.exportBats()],
        ['Mouse and keyboard', 'help', () => VR.ui.shortcuts()]
      ];
      items.forEach(([label, icon, fn], i) => {
        const a = -Math.PI / 2 + i * 2 * Math.PI / items.length;
        const b = el('button', 'radial-item');
        b.type = 'button';
        b.title = label;
        b.setAttribute('aria-label', label);
        b.innerHTML = VR.icon(icon, 20);
        b.appendChild(el('span', 'radial-label', label));
        b.style.left = Math.round(Math.cos(a) * 78) + 'px';
        b.style.top = Math.round(Math.sin(a) * 78) + 'px';
        b.addEventListener('click', (ev) => { ev.stopPropagation(); this.closeRadial(); fn(); });
        r.appendChild(b);
      });
      document.body.appendChild(r);
      this.radialEl = r;
      const close = (ev) => { if (!ev.target.closest('.radial')) this.closeRadial(); };
      setTimeout(() => document.addEventListener('pointerdown', close, { once: true, capture: true }), 0);
    }
    closeRadial() {
      if (this.radialEl) { this.radialEl.remove(); this.radialEl = null; }
    }
  }

  function hintName(h) {
    return { slider: 'slider', md: 'MD slider', panel: 'panel', toggle: 'toggle', list: 'value list', button: 'button' }[h.widget] || 'parameter';
  }

  /* == navigation map == */

  class Minimap {
    constructor(view) {
      this.view = view;
      this.c = el('canvas', 'minimap');
      this.c.width = 200;
      this.c.height = 130;
      this.c.setAttribute('aria-label', 'Navigation map');
      view.stage.appendChild(this.c);
      this.frame = 0;
      const go = (e) => {
        if (!this.map) return;
        const r = this.c.getBoundingClientRect();
        const wx = (e.clientX - r.left - this.map.ox) / this.map.s;
        const wy = (e.clientY - r.top - this.map.oy) / this.map.s;
        const sr = view.stage.getBoundingClientRect();
        const v = view.doc.view;
        v.x = sr.width / 2 - wx * v.zoom;
        v.y = sr.height / 2 - wy * v.zoom;
        view.applyView();
      };
      this.c.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        this.c.setPointerCapture(e.pointerId);
        this.dragging = true;
        go(e);
      });
      this.c.addEventListener('pointermove', (e) => { if (this.dragging) go(e); });
      this.c.addEventListener('pointerup', () => { this.dragging = false; view.app.saveSoon(); });
    }
    draw() {
      if (this.frame) return;
      this.frame = requestAnimationFrame(() => { this.frame = 0; this.paint(); });
    }
    paint() {
      const view = this.view;
      const ctx = this.c.getContext('2d');
      const W = this.c.width;
      const H = this.c.height;
      ctx.clearRect(0, 0, W, H);
      this.c.hidden = !view.app.showMap || !view.doc.nodes.length;
      if (this.c.hidden) return;
      const sr = view.stage.getBoundingClientRect();
      const v = view.doc.view;
      const vp = { x0: -v.x / v.zoom, y0: -v.y / v.zoom, x1: (sr.width - v.x) / v.zoom, y1: (sr.height - v.y) / v.zoom };
      const b = view.bounds(view.doc.nodes) || vp;
      const x0 = Math.min(b.x0, vp.x0);
      const y0 = Math.min(b.y0, vp.y0);
      const x1 = Math.max(b.x1, vp.x1);
      const y1 = Math.max(b.y1, vp.y1);
      const s = Math.min((W - 12) / (x1 - x0), (H - 12) / (y1 - y0));
      const ox = (W - (x1 - x0) * s) / 2 - x0 * s;
      const oy = (H - (y1 - y0) * s) / 2 - y0 * s;
      this.map = { s, ox, oy };
      view.doc.nodes.forEach((n) => {
        const e = view.els.get(n.id);
        if (!e) return;
        const lvl = view.doc.level(n.id);
        ctx.fillStyle = view.sel.has(n.id) ? '#5d9c3d' : lvl === 'error' ? '#c4473a' : lvl === 'warning' ? '#d78a2b' : '#7b7a73';
        ctx.fillRect(ox + n.x * s, oy + n.y * s, Math.max(2, e.lay.w * s), Math.max(2, e.lay.h * s));
      });
      ctx.strokeStyle = '#1f6fd1';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(ox + vp.x0 * s, oy + vp.y0 * s, (vp.x1 - vp.x0) * s, (vp.y1 - vp.y0) * s);
    }
  }

  VR.CanvasView = CanvasView;
})(window.VR);
