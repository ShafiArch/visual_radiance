#!/usr/bin/env node
/* Evaluates the rcalc expressions that the builders write (analysis periods,
   month from day of year, lists of hours) with a small JavaScript version of
   rcalc's if(), select(), and(), max() and floor(), and checks the answers. */
'use strict';
const VR = require('./load.js');
const B = VR.build;

function rc(expr, vars) {
  const js = expr.replace(/\$(\d+)/g, 'v$1');
  const f = new Function('IF', 'select', 'and', 'max', 'floor', 'vars', 'with (vars) { return (' + js.replace(/\bif\(/g, 'IF(') + '); }');
  const IF = (a, b, c) => (a > 0 ? b : c);
  return f(IF, (n, ...a) => a[Math.round(n) - 1], (a, b) => (a > 0 ? b : a), Math.max, Math.floor, vars);
}
let bad = 0;
const check = (name, got, want) => {
  if (got !== want) { bad += 1; console.log('FAIL ' + name + ': got ' + got + ', want ' + want); }
};
const CUM = B.CUM;
const doy = (m, d) => CUM[m - 1] + d;

// month from day of year
for (let m = 1; m <= 12; m += 1) {
  const first = doy(m, 1);
  const last = doy(m, VR.build.MONTH_DAYS[m - 1]);
  check('month of day ' + first, rc(B.monthExpr('jd'), { jd: first }), m);
  check('month of day ' + last, rc(B.monthExpr('jd'), { jd: last }), m);
}

// analysis periods on month, day, hour
const inside = (p, m, d, h) => rc(B.periodCond(p, '$1', '$2', '$3') || '1', { v1: m, v2: d, v3: h }) > 0;
const summer = { sm: 6, sd: 1, sh: 0, em: 8, ed: 31, eh: 23 };
check('summer Jun 1', inside(summer, 6, 1, 0.5), true);
check('summer Aug 31', inside(summer, 8, 31, 23.5), true);
check('summer May 31', inside(summer, 5, 31, 12.5), false);
check('summer Sep 1', inside(summer, 9, 1, 12.5), false);
const winter = { sm: 12, sd: 15, sh: 8, em: 1, ed: 15, eh: 17 };
check('winter Dec 20 10 h', inside(winter, 12, 20, 10.5), true);
check('winter Jan 10 17 h', inside(winter, 1, 10, 17.5), true);
check('winter Jan 10 18 h', inside(winter, 1, 10, 18.5), false);
check('winter Jan 20', inside(winter, 1, 20, 10.5), false);
check('winter Dec 14', inside(winter, 12, 14, 10.5), false);
const night = { sm: 1, sd: 1, sh: 22, em: 12, ed: 31, eh: 4 };
check('night 23 h', inside(night, 3, 3, 23.5), true);
check('night 3 h', inside(night, 3, 3, 3.5), true);
check('night 12 h', inside(night, 3, 3, 12.5), false);
check('whole year has no condition', B.periodCond({ sm: 1, sd: 1, sh: 0, em: 12, ed: 31, eh: 23 }, '$1', '$2', '$3'), '');

// hour lists on record numbers
const hc = B.hoursCond([4113, 4114, 4115, 4120, 10], 'recno-1');
[[4114, true], [4113, true], [4115, true], [4116, false], [4120, true], [4121, false], [10, true], [11, false]].forEach(([h, want]) => {
  check('hour ' + h, rc(hc, { recno: h + 1 }) > 0, want);
});

// schedules: 8 to 18 gives ten hours a day
const sched = B.scheduleCsv({ start: 8, end: 18 }, 'x.csv')[0].match(/"\$1=([^"]+)"/)[1];
let n = 0;
for (let h = 0; h < 24; h += 1) n += rc(sched, { h });
check('8 to 18 occupied hours per day', n, 10);
const over = B.scheduleCsv({ start: 22, end: 6 }, 'x.csv')[0].match(/"\$1=([^"]+)"/)[1];
n = 0;
for (let h = 0; h < 24; h += 1) n += rc(over, { h });
check('22 to 6 occupied hours per day', n, 8);

console.log(bad ? bad + ' expression check(s) failed' : 'All rcalc expressions give the expected answers.');
process.exit(bad ? 1 : 0);
