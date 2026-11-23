#!/usr/bin/env node
/* Builds each example definition, solves it, and compares the Batch Writer output with
   the matching file in /reference. Radiance options are compared as sets (their order
   does not matter to Radiance), numbers are compared by value and quotes are ignored.
   Run from the repository folder:  node tests/check-reference.js */
'use strict';
const fs = require('fs');
const path = require('path');

const VR = require('./load.js');
const root = path.join(__dirname, '..');

// Changes made on purpose. The original sun list used 145 x MF x MF + 1 suns (5221 for MF 6);
// the Reinhart sky has 144 x MF x MF + 1 patches, and the extra 36 suns all land on the
// zenith patch (see README).
const INTENDED = {
  'Annual_Illuminance_run_part0.bat': [['cnt 5221 ', 'cnt 5185 ']]
};

const RAD = new Set(['rtrace', 'rpict', 'rfluxmtx', 'rcontrib']);
const ARITY = { vp: 3, vd: 3, vu: 3, av: 3, cw: 2 };
const NO_ARG = /^-(vt[vlchas]|[Ihiuw][+-]?|co[+-]?|ld[+-]?|dv[+-]?|bv[+-]?|f[afdc]{1,2}|p(RGB|XYZ|Y|S|M|A))$/;
const isNum = (t) => /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(t);

function canonLine(line) {
  const toks = line.replace(/"/g, '').trim().split(/\s+/).map((t) => (isNum(t) ? String(Number(t)) : t));
  if (!RAD.has(toks[0])) return toks.join(' ');
  const groups = [];
  let i = 1;
  while (i < toks.length && /^-[A-Za-z]/.test(toks[i])) {
    const t = toks[i];
    const n = NO_ARG.test(t) ? 0 : ARITY[t.slice(1)] || 1;
    groups.push(toks.slice(i, i + 1 + n).join(' '));
    i += 1 + n;
  }
  return toks[0] + ' {' + groups.sort().join(' | ') + '} ' + toks.slice(i).join(' ');
}
const canon = (text) => text.replace(/\r/g, '').split('\n').map((l) => l.trim()).filter(Boolean).map(canonLine);

let failed = 0;
VR.examples.forEach((ex) => {
  const doc = new VR.Doc();
  doc.load(ex.build());
  doc.solve();
  const problems = [];
  doc.nodes.forEach((n) => (doc.msgs.get(n.id) || []).forEach((m) => {
    const expected = (ex.expectWarnings || []).some((w) => m.text.indexOf(w) >= 0);
    if (m.level !== 'remark' && !expected) problems.push(n.nick + ' (' + n.type + '): ' + m.level + ': ' + m.text);
  }));
  const writers = doc.nodes.filter((n) => n.type === 'Bat.Writer');
  if (!writers.length || writers.some((w) => typeof doc.out(w.id, 0) !== 'string')) problems.push('a Batch Writer produced no text');
  if (!ex.reference) {
    console.log((problems.length ? 'FAIL ' : 'ok   ') + ex.id + ' (no reference file)');
    problems.forEach((p) => console.log('     ' + p));
    if (problems.length) failed += 1;
    return;
  }
  const writer = writers.find((w) => w.nick === (ex.writer || 'Bat'));
  const got = writer ? doc.out(writer.id, 0) : '';
  let expected = fs.readFileSync(path.join(root, 'reference', ex.reference), 'utf8');
  (INTENDED[ex.reference] || []).forEach(([a, b]) => { expected = expected.split(a).join(b); });
  const A = canon(expected);
  const B = canon(got || '');
  const diffs = [];
  for (let i = 0; i < Math.max(A.length, B.length); i += 1) {
    if (A[i] !== B[i]) diffs.push('  line ' + (i + 1) + '\n    expected: ' + (A[i] || '(none)') + '\n    got:      ' + (B[i] || '(none)'));
  }
  const ok = !diffs.length && !problems.length;
  if (!ok) failed += 1;
  console.log((ok ? 'ok   ' : 'FAIL ') + ex.id + ' -> ' + ex.reference + ' (' + B.length + ' lines)');
  problems.forEach((p) => console.log('     ' + p));
  diffs.slice(0, 8).forEach((d) => console.log(d));
  if (process.argv.includes('show')) console.log('\n' + got + '\n');
});
console.log(failed ? '\n' + failed + ' example(s) differ' : '\nAll examples match their reference files.');
process.exit(failed ? 1 : 0);
