#!/usr/bin/env node
/* Solves every example and checks each Batch Writer's text for batch file
   mistakes: unknown subroutine labels, single percent signs that cmd.exe would
   read as variables, unbalanced quotes and parentheses, and variables used
   before they are set. Run from the repository folder:
     node tests/check-workflows.js          (summary)
     node tests/check-workflows.js show ID  (print the batch files of one example) */
'use strict';
const VR = require('./load.js');

const [mode, which] = process.argv.slice(2);
let failed = 0;

// Percent signs must be doubled (%%), or form %VAR%, %~dp0, %1 to %9, %~5 or %%a.
function lintPercent(line) {
  const s = line.replace(/%%/g, '').replace(/%~?dp0/g, '').replace(/%~?[0-9]/g, '').replace(/%[A-Za-z_][\w]*%/g, '');
  return s.indexOf('%') >= 0;
}

function lint(text) {
  const issues = [];
  const lines = text.split('\r\n');
  if (text.indexOf('\r\n') < 0) issues.push('no CRLF line endings');
  if (/[^\x00-\x7f]/.test(text)) issues.push('non-ASCII characters');
  const labels = new Set(lines.filter((l) => /^:\w/.test(l)).map((l) => l.trim().toLowerCase()));
  const set = new Set(['PATH', 'RAYPATH']);
  lines.forEach((l, i) => {
    const n = 'line ' + (i + 1) + ': ';
    const m = l.match(/call (:\w+)/);
    if (m && !labels.has(m[1].toLowerCase())) issues.push(n + 'call to missing label ' + m[1]);
    if (lintPercent(l)) issues.push(n + 'single percent sign: ' + l);
    if ((l.match(/"/g) || []).length % 2) issues.push(n + 'odd number of quotes: ' + l);
    const bare = l.replace(/"[^"]*"/g, '');
    if (!/^REM /.test(l) && (bare.match(/\(/g) || []).length !== (bare.match(/\)/g) || []).length) issues.push(n + 'unbalanced parentheses: ' + l);
    const def = l.match(/set (?:\/p )?"?(\w+)=/);
    (l.match(/%([A-Za-z_]\w*)%/g) || []).forEach((v) => {
      const name = v.slice(1, -1);
      if (!set.has(name) && !(def && def[1] === name)) issues.push(n + 'variable ' + name + ' used before it is set');
    });
    if (def) set.add(def[1]);
    if (/^\s*(echo\s+(on|off)\b)/i.test(l) && i > 0) issues.push(n + 'echo on/off in the middle of the file');
    if (/^(cnt|rcalc|rtrace|rpict|rfluxmtx|rcontrib|dctimestep|rmtxop|oconv)\b/.test(l) && l.length > 8000) issues.push(n + 'line longer than cmd.exe allows');
  });
  return issues;
}

VR.examples.forEach((ex) => {
  if (which && ex.id !== which) return;
  const doc = new VR.Doc();
  doc.load(ex.build());
  doc.solve();
  const problems = [];
  doc.nodes.forEach((n) => {
    (doc.msgs.get(n.id) || []).forEach((m) => {
      if (m.level === 'remark') return;
      if ((ex.expectWarnings || []).some((w) => m.text.indexOf(w) >= 0)) return;
      problems.push(n.nick + ' (' + n.type + '): ' + m.level + ': ' + m.text);
    });
  });
  const writers = doc.nodes.filter((n) => n.type === 'Bat.Writer');
  if (!writers.length) problems.push('no Batch Writer');
  writers.forEach((w) => {
    const text = doc.out(w.id, 0);
    if (!text) { problems.push(w.nick + ' produced no text'); return; }
    lint(text).forEach((x) => problems.push(w.nick + ': ' + x));
    if (mode === 'show') {
      console.log('==== ' + ex.id + ' / ' + w.nick + ' (' + doc.out(w.id, 1) + ')');
      console.log(text.replace(/\r/g, ''));
    }
  });
  const ok = !problems.length;
  if (!ok) failed += 1;
  if (mode !== 'show' || !ok) console.log((ok ? 'ok   ' : 'FAIL ') + ex.id + ' (' + writers.length + ' writer' + (writers.length === 1 ? '' : 's') + ')');
  problems.slice(0, 12).forEach((p) => console.log('     ' + p));
});
// Shared blocks: a sky used again runs once, unless another sky rewrote its file.
(function () {
  const B = VR.build;
  const mk = (h) => {
    const s = B.script({ name: 'test ' + h });
    s.blocks.push(B.skyBlock({ file: 'sky.rad', cmds: ['gensky 6 21 ' + h + ' > sky.rad'] }, 'sky'));
    s.blocks.push({ rem: 'trace', cmds: ['rtrace ' + h] });
    return s;
  };
  const text = B.compose([mk(9), mk(9), mk(15), mk(9)], { comments: false });
  const runs = text.split('\r\n').filter((l) => l.indexOf('gensky') === 0);
  const ok = runs.join('|') === 'gensky 6 21 9 > sky.rad|gensky 6 21 15 > sky.rad|gensky 6 21 9 > sky.rad';
  if (!ok) { failed += 1; console.log('FAIL shared sky blocks: ' + runs.join(' | ')); } else console.log('ok   shared blocks run once unless their file was rewritten');
  const a = B.script({ name: 'a' });
  const p = B.script({ name: 'p', deps: [a] });
  const q = B.script({ name: 'q', deps: [a] });
  const order = B.expand([p, q, a]).map((x) => x.name).join(' ');
  if (order !== 'a p q') { failed += 1; console.log('FAIL dependency order: ' + order); } else console.log('ok   simulations come before their post steps, once');
})();

console.log(failed ? '\n' + failed + ' check(s) with problems' : '\nAll examples solve and their batch files pass the checks.');
process.exit(failed ? 1 : 0);
