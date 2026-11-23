/* Visual Radiance: component registry, document model, solver and undo history. */
(function (VR) {
  'use strict';
  const U = VR.util;
  const T = VR.types;

  /* == registry == */

  VR.components = {};
  VR.componentList = [];

  // spec: { type, name, nick, tab, group, icon, desc, inputs, outputs, init, solve, widget, menu, help }
  VR.defineComponent = function (spec) {
    spec.inputs = (spec.inputs || []).map((p) => Object.assign({ access: 'item', optional: true }, p));
    spec.outputs = spec.outputs || [];
    VR.components[spec.type] = spec;
    VR.componentList.push(spec);
    return spec;
  };

  /* == solve context handed to each component == */

  class Fail extends Error {
    constructor(msg, level) {
      super(msg);
      this.level = level || 'error';
    }
  }

  class Ctx {
    constructor(doc, node, spec, inputs, msgs) {
      this.doc = doc;
      this.node = node;
      this.spec = spec;
      this.inputs = inputs;
      this.msgs = msgs;
      this.state = node.state;
    }
    def(i) { return this.spec.inputs[i].def; }
    has(i) {
      const p = this.inputs[i];
      return !!(p && p.connected && !T.empty(p.values));
    }
    connected(i) { return !!(this.inputs[i] && this.inputs[i].connected); }
    // First value from the first source, unflattened (keeps MD slider pairs intact).
    raw(i) { return this.has(i) ? this.inputs[i].values[0] : this.def(i); }
    get(i) { return this.has(i) ? T.flat(this.inputs[i].values)[0] : this.def(i); }
    list(i) {
      if (this.has(i)) return T.flat(this.inputs[i].values);
      const d = this.def(i);
      return d === undefined ? [] : T.flat([d]);
    }
    num(i) {
      const v = this.get(i);
      if (v === undefined) return undefined;
      const n = T.num(v);
      if (!isFinite(n)) this.fail(this.spec.inputs[i].name + ' needs a number, got "' + T.str(v) + '"');
      return n;
    }
    int(i) {
      const n = this.num(i);
      return n === undefined ? undefined : Math.round(n);
    }
    bool(i) {
      const v = this.get(i);
      if (v === undefined) return undefined;
      const b = T.bool(v);
      if (b === undefined) this.fail(this.spec.inputs[i].name + ' needs True or False, got "' + T.str(v) + '"');
      return b;
    }
    str(i) {
      const v = this.get(i);
      return v === undefined || v === null ? undefined : T.str(v).trim();
    }
    runtime() { return this.doc.rt(this.node.id); }
    warn(t) { this.msgs.push({ level: 'warning', text: t }); }
    remark(t) { this.msgs.push({ level: 'remark', text: t }); }
    fail(t, level) { throw new Fail(t, level); }
  }

  /* == document == */

  class Doc {
    constructor() {
      this.name = 'Untitled';
      this.nodes = [];
      this.wires = [];
      this.groups = [];
      this.view = { x: 60, y: 40, zoom: 1 };
      this.byId = new Map();
      this.values = new Map();
      this.msgs = new Map();
      this.runtimeMap = new Map();
      this.stats = { count: 0, ms: 0, warnings: 0, errors: 0 };
    }

    get(id) { return this.byId.get(id); }
    rt(id) {
      if (!this.runtimeMap.has(id)) this.runtimeMap.set(id, {});
      return this.runtimeMap.get(id);
    }

    addNode(type, x, y, state, nick, id) {
      const spec = VR.components[type];
      const base = spec && spec.init ? spec.init() : {};
      const n = {
        id: id || U.uid('n'),
        type,
        x: Math.round(x),
        y: Math.round(y),
        nick: nick || (spec ? spec.nick : type),
        state: Object.assign(base, state ? U.clone(state) : {}),
        enabled: true
      };
      this.nodes.push(n);
      this.byId.set(n.id, n);
      return n;
    }

    removeNodes(ids) {
      const set = new Set(ids);
      this.nodes = this.nodes.filter((n) => !set.has(n.id));
      ids.forEach((id) => { this.byId.delete(id); this.runtimeMap.delete(id); });
      this.wires = this.wires.filter((w) => !set.has(w.from) && !set.has(w.to));
      this.groups.forEach((g) => { g.members = g.members.filter((m) => !set.has(m)); });
      this.groups = this.groups.filter((g) => g.members.length > 0);
    }

    wiresTo(id, i) { return this.wires.filter((w) => w.to === id && (i === undefined || w.in === i)); }
    wiresFrom(id, o) { return this.wires.filter((w) => w.from === id && (o === undefined || w.out === o)); }
    findWire(from, out, to, inp) {
      return this.wires.find((w) => w.from === from && w.out === out && w.to === to && w.in === inp);
    }

    // mode: 'replace' (default) removes other wires into the input, 'add' keeps them,
    // 'remove' deletes this wire if it exists.
    connect(from, out, to, inp, mode) {
      if (from === to) return false;
      const existing = this.findWire(from, out, to, inp);
      if (mode === 'remove') {
        if (existing) this.wires = this.wires.filter((w) => w !== existing);
        return !!existing;
      }
      if (mode !== 'add') this.wires = this.wires.filter((w) => !(w.to === to && w.in === inp) || w === existing);
      if (!existing) this.wires.push({ id: U.uid('w'), from, out, to, in: inp });
      return true;
    }

    disconnectInput(id, i) { this.wires = this.wires.filter((w) => !(w.to === id && w.in === i)); }
    disconnectOutput(id, o) { this.wires = this.wires.filter((w) => !(w.from === id && w.out === o)); }

    /* == solver == */

    solve() {
      const t0 = Date.now();
      this.values = new Map();
      this.msgs = new Map();
      const inMap = new Map();
      this.wires.forEach((w) => {
        if (!inMap.has(w.to)) inMap.set(w.to, []);
        inMap.get(w.to).push(w);
      });
      const order = [];
      const mark = new Map();
      const cyclic = new Set();
      const visit = (id, path) => {
        const m = mark.get(id);
        if (m === 2) return;
        if (m === 1) { path.slice(path.indexOf(id)).forEach((x) => cyclic.add(x)); return; }
        mark.set(id, 1);
        path.push(id);
        (inMap.get(id) || []).forEach((w) => { if (this.byId.has(w.from)) visit(w.from, path); });
        path.pop();
        mark.set(id, 2);
        order.push(id);
      };
      this.nodes.forEach((n) => visit(n.id, []));

      let warnings = 0;
      let errors = 0;
      order.forEach((id) => {
        const n = this.byId.get(id);
        const spec = VR.components[n.type];
        const msgs = [];
        this.msgs.set(id, msgs);
        if (!spec) { msgs.push({ level: 'error', text: 'Unknown component type "' + n.type + '"' }); errors += 1; return; }
        const empty = () => this.values.set(id, spec.outputs.map(() => undefined));
        if (cyclic.has(id)) { msgs.push({ level: 'error', text: 'Recursive data stream: this component feeds itself' }); errors += 1; empty(); return; }
        if (n.enabled === false) { empty(); return; }
        const ws = inMap.get(id) || [];
        const inputs = spec.inputs.map((p, i) => {
          const mine = ws.filter((w) => w.in === i);
          const vals = [];
          mine.forEach((w) => {
            const src = this.values.get(w.from);
            const v = src ? src[w.out] : undefined;
            if (v !== undefined && v !== null) vals.push(v);
          });
          return { connected: mine.length > 0, values: vals };
        });
        const ctx = new Ctx(this, n, spec, inputs, msgs);
        const missing = spec.inputs.map((p, i) => (!p.optional && !ctx.has(i) ? p.name : null)).filter(Boolean);
        if (missing.length) {
          missing.forEach((m) => msgs.push({ level: 'warning', text: 'Input parameter ' + m + ' failed to collect data' }));
          empty();
        } else {
          try {
            const out = spec.solve(ctx);
            this.values.set(id, Array.isArray(out) ? out : [out]);
          } catch (e) {
            if (e instanceof Fail) msgs.push({ level: e.level, text: e.message });
            else {
              msgs.push({ level: 'error', text: 'Solution exception: ' + (e && e.message ? e.message : e) });
              if (typeof console !== 'undefined') console.error(e);
            }
            empty();
          }
        }
        if (msgs.some((m) => m.level === 'error')) errors += 1;
        else if (msgs.some((m) => m.level === 'warning')) warnings += 1;
      });
      this.stats = { count: order.length, ms: Date.now() - t0, warnings, errors };
      return this.stats;
    }

    level(id) {
      const m = this.msgs.get(id) || [];
      if (m.some((x) => x.level === 'error')) return 'error';
      if (m.some((x) => x.level === 'warning')) return 'warning';
      return m.length ? 'remark' : '';
    }

    out(id, i) {
      const v = this.values.get(id);
      return v ? v[i || 0] : undefined;
    }

    /* == serialization == */

    serialize(ids) {
      const pick = ids ? new Set(ids) : null;
      const nodes = this.nodes.filter((n) => !pick || pick.has(n.id));
      const keep = new Set(nodes.map((n) => n.id));
      return {
        app: 'Visual Radiance',
        version: 1,
        name: this.name,
        view: pick ? undefined : { x: Math.round(this.view.x), y: Math.round(this.view.y), zoom: this.view.zoom },
        nodes: nodes.map((n) => {
          const o = { id: n.id, type: n.type, x: Math.round(n.x), y: Math.round(n.y), nick: n.nick, state: U.clone(n.state) };
          if (n.enabled === false) o.enabled = false;
          if (n.wireModes && Object.keys(n.wireModes).length) o.wireModes = U.clone(n.wireModes);
          return o;
        }),
        wires: this.wires.filter((w) => keep.has(w.from) && keep.has(w.to))
          .map((w) => ({ from: w.from, out: w.out, to: w.to, in: w.in })),
        groups: this.groups.filter((g) => g.members.every((m) => keep.has(m)))
          .map((g) => ({ id: g.id, name: g.name, color: g.color, members: g.members.slice() }))
      };
    }

    load(data) {
      if (!data || !Array.isArray(data.nodes)) throw new Error('This file is not a Visual Radiance definition');
      this.name = data.name || 'Untitled';
      this.nodes = [];
      this.wires = [];
      this.groups = [];
      this.byId = new Map();
      this.runtimeMap = new Map();
      data.nodes.forEach((n) => {
        const node = this.addNode(n.type, n.x || 0, n.y || 0, n.state || {}, n.nick, n.id);
        if (n.enabled === false) node.enabled = false;
        if (n.wireModes) node.wireModes = U.clone(n.wireModes);
      });
      (data.wires || []).forEach((w) => {
        if (this.byId.has(w.from) && this.byId.has(w.to)) this.wires.push({ id: U.uid('w'), from: w.from, out: w.out, to: w.to, in: w.in });
      });
      (data.groups || []).forEach((g) => {
        const members = (g.members || []).filter((m) => this.byId.has(m));
        if (members.length) this.groups.push({ id: g.id || U.uid('g'), name: g.name || 'Group', color: g.color || 'blue', members });
      });
      if (data.view) this.view = { x: data.view.x || 0, y: data.view.y || 0, zoom: data.view.zoom || 1 };
    }

    // Insert serialized nodes (from copy or duplicate) with fresh ids. Returns new ids.
    insert(data, dx, dy) {
      const map = new Map();
      (data.nodes || []).forEach((n) => {
        const node = this.addNode(n.type, (n.x || 0) + dx, (n.y || 0) + dy, n.state || {}, n.nick);
        if (n.enabled === false) node.enabled = false;
        if (n.wireModes) node.wireModes = U.clone(n.wireModes);
        map.set(n.id, node.id);
      });
      (data.wires || []).forEach((w) => {
        if (map.has(w.from) && map.has(w.to)) this.wires.push({ id: U.uid('w'), from: map.get(w.from), out: w.out, to: map.get(w.to), in: w.in });
      });
      (data.groups || []).forEach((g) => {
        this.groups.push({ id: U.uid('g'), name: g.name, color: g.color, members: g.members.map((m) => map.get(m)).filter(Boolean) });
      });
      return Array.from(map.values());
    }
  }

  VR.Doc = Doc;

  /* == undo history (whole-document snapshots) == */

  class History {
    constructor(limit) {
      this.limit = limit || 100;
      this.undoStack = [];
      this.redoStack = [];
    }
    push(snapshot) {
      if (this.undoStack[this.undoStack.length - 1] === snapshot) return;
      this.undoStack.push(snapshot);
      if (this.undoStack.length > this.limit) this.undoStack.shift();
      this.redoStack.length = 0;
    }
    undo(current) {
      if (!this.undoStack.length) return null;
      this.redoStack.push(current);
      return this.undoStack.pop();
    }
    redo(current) {
      if (!this.redoStack.length) return null;
      this.undoStack.push(current);
      return this.redoStack.pop();
    }
    clear() { this.undoStack.length = 0; this.redoStack.length = 0; }
  }

  VR.History = History;
})(window.VR);
