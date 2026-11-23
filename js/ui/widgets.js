/* Visual Radiance: how each node is drawn on the canvas and how its controls respond.
   Every widget has layout() (size and grip positions), build() (DOM), update() (values),
   and optionally down() (pointer on a control) and dbl() (double-click). */
(function (VR) {
  'use strict';
  const U = VR.util;
  const T = VR.types;
  const el = U.el;

  const FAMILY = '"Barlow Semi Condensed", "Segoe UI", "Helvetica Neue", Arial, sans-serif';
  const L = VR.L = {
    ROW: 18, PAD: 6, CORE: 22,
    FONT: '500 12px ' + FAMILY,
    FONT_CORE: '600 12px ' + FAMILY,
    FONT_LABEL: '600 12px ' + FAMILY
  };

  let mctx = null;
  VR.measure = function (text, font) {
    if (!mctx) mctx = document.createElement('canvas').getContext('2d');
    mctx.font = font || L.FONT;
    return mctx.measureText(String(text)).width;
  };

  // Panel text for any value: lists get indices like a Grasshopper panel.
  VR.display = function (v) {
    if (v === undefined || v === null) return '';
    if (Array.isArray(v)) {
      const f = T.flat(v);
      if (f.length === 1) return T.str(f[0]);
      return f.map((x, i) => i + '  ' + T.str(x).replace(/\n/g, ' ')).join('\n');
    }
    return T.str(v);
  };

  const W = VR.widgets = {};
  const labelW = (n) => Math.max(26, Math.ceil(VR.measure(n.nick || '', L.FONT_LABEL)) + 16);

  /* == regular components == */

  W.component = {
    cls: 'comp',
    layout(view, n, spec) {
      const ins = spec ? spec.inputs : [];
      const outs = spec ? spec.outputs : [];
      const inW = ins.length ? Math.ceil(Math.max.apply(null, ins.map((p) => VR.measure(p.nick || p.name)))) + 16 : 8;
      const outW = outs.length ? Math.ceil(Math.max.apply(null, outs.map((p) => VR.measure(p.nick || p.name)))) + 16 : 8;
      const rows = Math.max(ins.length, outs.length, 1);
      const nickLen = Math.ceil(VR.measure(n.nick, L.FONT_CORE)) + 22;
      const h = Math.max(rows * L.ROW + 2 * L.PAD, nickLen, 44);
      const w = inW + L.CORE + outW + 8;
      const at = (i, count) => Math.round(L.PAD + (i + 0.5) * (h - 2 * L.PAD) / count);
      return { w, h, inW, outW, ins: ins.map((p, i) => ({ x: 0, y: at(i, ins.length) })), outs: outs.map((p, i) => ({ x: w, y: at(i, outs.length) })) };
    },
    build(view, n, spec, root, lay) {
      (spec ? spec.inputs : []).forEach((p, i) => {
        const d = el('div', 'io in' + (p.optional === false ? ' req' : ''), p.nick || p.name);
        d.style.top = (lay.ins[i].y - 9) + 'px';
        d.style.width = (lay.inW - 8) + 'px';
        root.appendChild(d);
      });
      const core = el('div', 'core');
      core.style.left = (lay.inW + 4) + 'px';
      core.style.height = (lay.h - 10) + 'px';
      core.appendChild(el('span', null, n.nick));
      root.appendChild(core);
      (spec ? spec.outputs : []).forEach((p, i) => {
        const d = el('div', 'io out', p.nick || p.name);
        d.style.top = (lay.outs[i].y - 9) + 'px';
        d.style.width = (lay.outW - 8) + 'px';
        root.appendChild(d);
      });
    }
  };

  /* == Number Slider == */

  W.slider = {
    cls: 'w-slider',
    layout(view, n) {
      const w = Math.max(labelW(n) + 90, n.state.w || 230);
      return { w, h: 24, ins: [], outs: [{ x: w, y: 12 }] };
    },
    build(view, n, spec, root) {
      root.appendChild(el('div', 'w-label', n.nick));
      const track = el('div', 'w-track');
      track.dataset.ctl = 'track';
      track.appendChild(el('div', 'w-rail'));
      track.appendChild(el('div', 'w-knob'));
      track.appendChild(el('div', 'w-val'));
      root.appendChild(track);
      const rz = el('span', 'w-resize');
      rz.dataset.ctl = 'width';
      root.appendChild(rz);
    },
    update(view, n, e) {
      const st = n.state;
      const t = U.clamp((VR.sliderValue(st) - st.min) / ((st.max - st.min) || 1), 0, 1);
      const knob = e.root.querySelector('.w-knob');
      const val = e.root.querySelector('.w-val');
      const at = (t * 100).toFixed(3) + '% - ' + (t * 9).toFixed(2) + 'px';
      knob.style.left = 'calc(' + at + ')';
      val.textContent = VR.sliderText(st);
      const leftSide = t > 0.55;
      val.classList.toggle('left', leftSide);
      val.style.left = 'calc(' + at + (leftSide ? ' - 4px)' : ' + 13px)');
    },
    down(view, n, ctl, e) {
      if (ctl.dataset.ctl === 'width') { view.startWidth(e, n, 120); return true; }
      const rect = ctl.getBoundingClientRect();
      const set = (cx) => {
        const st = n.state;
        const t = U.clamp((cx - rect.left - 4) / Math.max(1, rect.width - 8), 0, 1);
        st.value = VR.sliderValue(Object.assign({}, st, { value: st.min + t * (st.max - st.min) }));
      };
      view.app.checkpoint();
      set(e.clientX);
      view.app.changed({ live: true });
      view.startControl(e, n, (ev) => { set(ev.clientX); view.app.changed({ live: true }); }, () => view.app.changed({}));
      return true;
    },
    dbl(view, n, t) {
      if (!t.closest('.w-label') && !t.closest('.w-val')) return false;
      VR.ui.sliderEditor(n, (o) => view.app.editNode(n, o));
      return true;
    },
    menu(view, n) {
      const st = n.state;
      const mode = (m) => () => view.app.editNode(n, { state: { mode: m, value: VR.sliderValue(Object.assign({}, st, { mode: m })) } });
      return [
        { label: 'Edit slider...', action: () => VR.ui.sliderEditor(n, (o) => view.app.editNode(n, o)) },
        { label: 'Rounding', sub: [
          { label: 'Floating point (R)', checked: (st.mode || 'R') === 'R', action: mode('R') },
          { label: 'Integer (N)', checked: st.mode === 'N', action: mode('N') },
          { label: 'Even (E)', checked: st.mode === 'E', action: mode('E') },
          { label: 'Odd (O)', checked: st.mode === 'O', action: mode('O') }] }
      ];
    }
  };

  /* == MD Slider == */

  W.md = {
    cls: 'w-md',
    layout(view, n) {
      const s = n.state.size || 150;
      const w = Math.max(s + 16, labelW(n) + 16);
      const h = s + 48;
      return { w, h, ins: [], outs: [{ x: w, y: Math.round(h / 2) }] };
    },
    build(view, n, spec, root) {
      root.appendChild(el('div', 'w-label', n.nick));
      const area = el('div', 'md-area');
      area.dataset.ctl = 'md';
      area.style.width = area.style.height = (n.state.size || 150) + 'px';
      area.appendChild(el('div', 'md-h'));
      area.appendChild(el('div', 'md-v'));
      area.appendChild(el('div', 'md-dot'));
      root.appendChild(area);
      root.appendChild(el('div', 'md-val'));
    },
    update(view, n, e) {
      const st = n.state;
      const v = VR.mdValue(st);
      const tx = U.clamp((v[0] - st.xmin) / ((st.xmax - st.xmin) || 1), 0, 1);
      const ty = U.clamp((v[1] - st.ymin) / ((st.ymax - st.ymin) || 1), 0, 1);
      const px = (tx * 100).toFixed(3) + '%';
      const py = ((1 - ty) * 100).toFixed(3) + '%';
      e.root.querySelector('.md-dot').style.left = px;
      e.root.querySelector('.md-dot').style.top = py;
      e.root.querySelector('.md-v').style.left = px;
      e.root.querySelector('.md-h').style.top = py;
      const d = U.clamp(st.decimals | 0, 0, 8);
      e.root.querySelector('.md-val').textContent = v[0].toFixed(d) + ',  ' + v[1].toFixed(d);
    },
    down(view, n, ctl, e) {
      const rect = ctl.getBoundingClientRect();
      const set = (ev) => {
        const st = n.state;
        const tx = U.clamp((ev.clientX - rect.left) / rect.width, 0, 1);
        const ty = U.clamp(1 - (ev.clientY - rect.top) / rect.height, 0, 1);
        const v = VR.mdValue(Object.assign({}, st, { x: st.xmin + tx * (st.xmax - st.xmin), y: st.ymin + ty * (st.ymax - st.ymin) }));
        st.x = v[0];
        st.y = v[1];
      };
      view.app.checkpoint();
      set(e);
      view.app.changed({ live: true });
      view.startControl(e, n, (ev) => { set(ev); view.app.changed({ live: true }); }, () => view.app.changed({}));
      return true;
    },
    dbl(view, n, t) {
      if (t.closest('.md-area')) return false;
      VR.ui.mdEditor(n, (o) => view.app.editNode(n, o, true));
      return true;
    },
    menu: (view, n) => [{ label: 'Edit MD slider...', action: () => VR.ui.mdEditor(n, (o) => view.app.editNode(n, o, true)) }]
  };

  /* == Boolean Toggle == */

  W.toggle = {
    cls: 'w-toggle',
    layout(view, n) {
      const w = labelW(n) + 58;
      return { w, h: 24, ins: [], outs: [{ x: w, y: 12 }] };
    },
    build(view, n, spec, root) {
      root.appendChild(el('div', 'w-label', n.nick));
      const b = el('button', 'w-bool');
      b.type = 'button';
      b.dataset.ctl = 'toggle';
      root.appendChild(b);
    },
    update(view, n, e) {
      const b = e.root.querySelector('.w-bool');
      b.textContent = n.state.value ? 'True' : 'False';
      b.classList.toggle('on', !!n.state.value);
      b.setAttribute('aria-pressed', String(!!n.state.value));
    },
    down(view, n) {
      view.app.checkpoint();
      n.state.value = !n.state.value;
      view.app.changed({});
      return true;
    }
  };

  /* == Button == */

  W.button = {
    cls: 'w-button',
    layout(view, n) {
      const w = labelW(n) + 46;
      return { w, h: 24, ins: [], outs: [{ x: w, y: 12 }] };
    },
    build(view, n, spec, root) {
      root.appendChild(el('div', 'w-label', n.nick));
      const b = el('button', 'w-push');
      b.type = 'button';
      b.dataset.ctl = 'push';
      b.setAttribute('aria-label', 'Press');
      root.appendChild(b);
    },
    update(view, n, e) {
      e.root.querySelector('.w-push').classList.toggle('on', !!view.app.doc.rt(n.id).pressed);
    },
    down(view, n, ctl, e) {
      const rt = view.app.doc.rt(n.id);
      rt.pressed = true;
      view.app.changed({ live: true });
      view.startControl(e, n, null, () => { rt.pressed = false; view.app.changed({ live: true }); });
      return true;
    }
  };

  /* == Value List == */

  W.list = {
    cls: 'w-list',
    layout(view, n) {
      const items = n.state.items || [];
      const iw = items.length ? Math.max.apply(null, items.map((it) => VR.measure(it.label))) : 40;
      const extra = n.state.mode === 'cycle' ? 52 : 34;
      const w = Math.ceil(labelW(n) + iw + extra + 12);
      return { w, h: 24, ins: [], outs: [{ x: w, y: 12 }] };
    },
    build(view, n, spec, root) {
      root.appendChild(el('div', 'w-label', n.nick));
      if (n.state.mode === 'cycle') {
        const prev = el('button', 'w-step', '‹');
        prev.type = 'button';
        prev.dataset.ctl = 'prev';
        prev.setAttribute('aria-label', 'Previous item');
        root.appendChild(prev);
      }
      const sel = el('button', 'w-pick');
      sel.type = 'button';
      sel.dataset.ctl = n.state.mode === 'cycle' ? 'next' : 'pick';
      sel.appendChild(el('span', 'w-pick-text'));
      if (n.state.mode !== 'cycle') sel.appendChild(el('span', 'w-caret', '▾'));
      root.appendChild(sel);
      if (n.state.mode === 'cycle') {
        const next = el('button', 'w-step', '›');
        next.type = 'button';
        next.dataset.ctl = 'next';
        next.setAttribute('aria-label', 'Next item');
        root.appendChild(next);
      }
    },
    update(view, n, e) {
      const items = n.state.items || [];
      const it = items[U.clamp(n.state.index | 0, 0, Math.max(0, items.length - 1))];
      e.root.querySelector('.w-pick-text').textContent = it ? it.label : '(empty)';
    },
    down(view, n, ctl) {
      const items = n.state.items || [];
      const pick = (i) => { view.app.checkpoint(); n.state.index = i; view.app.changed({}); };
      if (ctl.dataset.ctl === 'prev') { pick(((n.state.index | 0) - 1 + items.length) % items.length); return true; }
      if (ctl.dataset.ctl === 'next') { pick(((n.state.index | 0) + 1) % items.length); return true; }
      const r = ctl.getBoundingClientRect();
      VR.ui.menu(items.map((it, i) => ({ label: it.label, checked: i === (n.state.index | 0), action: () => pick(i) })), r.left, r.bottom + 2);
      return true;
    },
    dbl(view, n, t) {
      if (!t.closest('.w-label')) return false;
      VR.ui.listEditor(n, (o) => view.app.editNode(n, o, true));
      return true;
    },
    menu(view, n) {
      const mode = (m) => () => view.app.editNode(n, { state: { mode: m } }, true);
      return [
        { label: 'Edit items...', action: () => VR.ui.listEditor(n, (o) => view.app.editNode(n, o, true)) },
        { label: 'Drop-down list', checked: n.state.mode !== 'cycle', action: mode('dropdown') },
        { label: 'Value cycle', checked: n.state.mode === 'cycle', action: mode('cycle') }
      ];
    }
  };

  /* == Panel == */

  W.panel = {
    cls: 'w-panel',
    layout(view, n) {
      const w = Math.max(60, n.state.w || 200);
      const h = Math.max(36, n.state.h || 64);
      return { w, h, ins: [{ x: 0, y: Math.round(h / 2) }], outs: [{ x: w, y: Math.round(h / 2) }] };
    },
    build(view, n, spec, root) {
      root.appendChild(el('div', 'p-head', n.nick));
      const ta = el('textarea', 'p-text');
      ta.spellcheck = false;
      ta.placeholder = 'Double-click to type';
      ta.value = n.state.text || '';
      ta.setAttribute('aria-label', n.nick);
      ta.addEventListener('focus', () => { view.app.checkpoint(); });
      ta.addEventListener('input', () => { n.state.text = ta.value; view.app.changed({ except: n.id }); });
      ta.addEventListener('keydown', (e) => { if (e.key === 'Escape') ta.blur(); e.stopPropagation(); });
      root.appendChild(ta);
      root.appendChild(el('pre', 'p-view'));
      const rz = el('span', 'p-resize');
      rz.dataset.ctl = 'size';
      root.appendChild(rz);
    },
    update(view, n, e) {
      const doc = view.app.doc;
      const linked = doc.wiresTo(n.id, 0).length > 0;
      const ta = e.root.querySelector('.p-text');
      const pre = e.root.querySelector('.p-view');
      e.root.classList.toggle('linked', linked);
      if (linked) {
        const txt = VR.display(doc.out(n.id, 0));
        if (pre.textContent !== txt) pre.textContent = txt;
      } else if (document.activeElement !== ta && ta.value !== (n.state.text || '')) {
        ta.value = n.state.text || '';
      }
    },
    down(view, n, ctl, e) {
      if (ctl.dataset.ctl === 'size') { view.startResize(e, n); return true; }
      return false;
    },
    dbl(view, n, t) {
      if (t.closest('.p-head')) {
        VR.ui.prompt('Rename panel', 'Name', n.nick).then((v) => { if (v !== null && v.trim()) view.app.editNode(n, { nick: v.trim() }, true); });
        return true;
      }
      const ta = view.els.get(n.id).root.querySelector('.p-text');
      if (!view.app.doc.wiresTo(n.id, 0).length) { ta.focus(); return true; }
      return true;
    },
    menu(view, n) {
      return [
        { label: 'Multiline data', checked: n.state.multiline !== false,
          action: () => view.app.editNode(n, { state: { multiline: n.state.multiline === false } }) },
        { note: 'When off, each line is a separate item.' },
        { label: 'Copy text', action: () => {
          const txt = view.app.doc.wiresTo(n.id, 0).length ? VR.display(view.app.doc.out(n.id, 0)) : n.state.text || '';
          if (navigator.clipboard) navigator.clipboard.writeText(txt).then(() => VR.ui.toast('Copied'), () => VR.ui.toast('Copy is blocked by the browser', 'error'));
        } }
      ];
    }
  };

  /* == File Path == */

  W.file = {
    cls: 'w-file',
    layout(view, n) {
      const w = Math.max(labelW(n) + 90, n.state.w || 220);
      return { w, h: 24, ins: [], outs: [{ x: w, y: 12 }] };
    },
    build(view, n, spec, root) {
      root.appendChild(el('div', 'w-label', n.nick));
      const p = el('div', 'w-path');
      root.appendChild(p);
      const b = el('button', 'w-browse', '…');
      b.type = 'button';
      b.dataset.ctl = 'browse';
      b.title = 'Pick a file';
      b.setAttribute('aria-label', 'Pick a file');
      root.appendChild(b);
      const rz = el('span', 'w-resize');
      rz.dataset.ctl = 'width';
      root.appendChild(rz);
    },
    update(view, n, e) {
      const p = e.root.querySelector('.w-path');
      p.textContent = n.state.path || 'No file';
      p.classList.toggle('empty', !n.state.path);
    },
    down(view, n, ctl, e) {
      if (ctl.dataset.ctl === 'width') { view.startWidth(e, n, 140); return true; }
      const inp = el('input');
      inp.type = 'file';
      inp.addEventListener('change', () => {
        const f = inp.files && inp.files[0];
        if (f) view.app.editNode(n, { state: { path: f.name } });
      });
      inp.click();
      return true;
    },
    dbl(view, n, t) {
      if (t.closest('.w-browse')) return true;
      VR.ui.prompt('File path', 'Name or full path, as the batch file should see it', n.state.path || '').then((v) => {
        if (v !== null) view.app.editNode(n, { state: { path: v.trim() } });
      });
      return true;
    }
  };

  /* == Scribble == */

  W.scribble = {
    cls: 'w-scribble',
    layout(view, n) {
      const size = n.state.size || 18;
      const lines = String(n.state.text || ' ').split('\n');
      const w = Math.ceil(Math.max.apply(null, lines.map((l) => VR.measure(l, '600 ' + size + 'px ' + FAMILY)))) + 8;
      return { w: Math.max(30, w), h: Math.ceil(lines.length * size * 1.25) + 4, ins: [], outs: [] };
    },
    build(view, n, spec, root) {
      root.style.fontSize = (n.state.size || 18) + 'px';
      root.textContent = n.state.text || '';
    },
    dbl(view, n) {
      VR.ui.prompt('Scribble', 'Text', n.state.text || '', true).then((v) => {
        if (v !== null) view.app.editNode(n, { state: { text: v } }, true);
      });
      return true;
    },
    menu: (view, n) => [
      { label: 'Edit text...', action: () => W.scribble.dbl(view, n) },
      { label: 'Size', sub: [14, 18, 24, 32, 48].map((s) => ({ label: s + ' px', checked: (n.state.size || 18) === s,
        action: () => view.app.editNode(n, { state: { size: s } }, true) })) }
    ]
  };
})(window.VR);
