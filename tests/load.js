/* Loads the app scripts that do not touch the DOM (everything index.html loads
   before the user interface) into this Node process, and returns window.VR. */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
globalThis.window = globalThis;
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const files = Array.from(html.matchAll(/<script src="([^"]+)"/g)).map((m) => m[1])
  .filter((f) => !/^js\/ui\//.test(f) && f !== 'js/main.js');
files.forEach((f) => vm.runInThisContext(fs.readFileSync(path.join(root, f), 'utf8'), { filename: f }));
module.exports = globalThis.VR;
