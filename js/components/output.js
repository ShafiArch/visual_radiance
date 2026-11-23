/* Visual Radiance: Batch Writer, which composes the .bat file from workflow scripts. */
(function (VR) {
  'use strict';
  const T = VR.types;
  const B = VR.build;
  const hint = VR.hint;

  VR.defineComponent({
    type: 'Bat.Writer', name: 'Batch Writer', nick: 'Bat', tab: 'Output', group: 'Batch', icon: 'writer',
    desc: 'Writes the Windows batch file. Connect one or more workflow scripts; they run in order. Use Export .bat in the top bar, or the Write input, to save it. Put the file in your project folder and double-click it to run the simulation.',
    keywords: 'batch writer bat file export save write run cmd windows',
    help: 'Folder adds "cd /d" to that folder. With no folder and Here on, the batch file changes to its own folder (cd /d "%~dp0"), so it runs wherever you place it. Browsers save downloads to your Downloads folder; in Chrome and Edge you can pick a save folder from this component\'s menu.',
    inputs: [
      { name: 'Scripts', nick: 'Scr', access: 'list', optional: false, desc: 'Workflow scripts, in run order.' },
      { name: 'File name', nick: 'Name', def: 'run_simulation.bat', desc: 'Name of the .bat file.', hint: VR.hint.panel('run_simulation.bat') },
      { name: 'Folder', nick: 'Dir', desc: 'Project folder where the simulation runs (cd /d). Optional.', hint: hint.panel('C:\\Projects\\Radiance\\run') },
      { name: 'Radiance', nick: 'Env', desc: 'Radiance Folders component, to set PATH and RAYPATH (optional).' },
      { name: 'Here', nick: 'Here', def: true, desc: 'When no folder is given, run in the folder of the batch file (cd /d "%~dp0").', hint: hint.toggle(true) },
      { name: 'Echo off', nick: 'Quiet', def: false, desc: 'Hide each command as it runs (@echo off).', hint: hint.toggle(false) },
      { name: 'Comments', nick: 'REM', def: true, desc: 'Add REM comments describing each step.', hint: hint.toggle(true) },
      { name: 'Progress', nick: 'Echo', def: true, desc: 'Print start and end messages.', hint: hint.toggle(true) },
      { name: 'Pause', nick: 'Pause', def: false, desc: 'Keep the window open at the end (pause).', hint: hint.toggle(false) },
      { name: 'Write', nick: 'Write', def: false, desc: 'Saves the file each time this turns True (connect a Button or Toggle).', hint: { widget: 'button' } }
    ],
    outputs: [
      { name: 'Batch', nick: 'Bat', desc: 'Batch file text' },
      { name: 'File', nick: 'File', desc: 'Batch file name' }
    ],
    menu: [
      { label: 'Save .bat', action: 'saveBat' },
      { label: 'Copy .bat text', action: 'copyBat' },
      { label: 'Choose save folder...', action: 'pickFolder' }
    ],
    solve(ctx) {
      const items = ctx.list(0);
      const scripts = items.filter((s) => s && s.kind === 'script');
      if (!scripts.length) ctx.fail('Scripts needs workflow components (Annual, PIT, Render...)', 'warning');
      if (scripts.length < items.length) ctx.warn((items.length - scripts.length) + ' item(s) in Scripts are not workflow scripts and were skipped');
      let name = ctx.str(1) || 'run_simulation.bat';
      if (/[\\/:*?"<>|]/.test(name)) {
        name = name.replace(/[\\/:*?"<>|]/g, '_');
        ctx.warn('Removed characters Windows does not allow in file names');
      }
      if (!/\.(bat|cmd)$/i.test(name)) name += '.bat';
      const envIn = ctx.raw(3);
      if (envIn !== undefined && !(envIn && envIn.kind === 'env')) ctx.fail('Radiance needs a Radiance Folders component');
      const folder = ctx.str(2) || '';
      const text = B.compose(scripts, {
        folder, here: !!ctx.bool(4), echoOff: !!ctx.bool(5), comments: !!ctx.bool(6),
        progress: !!ctx.bool(7), pause: !!ctx.bool(8), env: envIn || null
      });
      if (/[^\x00-\x7f]/.test(text)) ctx.warn('The batch file contains non-ASCII characters; cmd.exe may misread them');
      const rt = ctx.runtime();
      const write = !!ctx.bool(9);
      if (rt.lastWrite === false && write && VR.onWriteRequest) VR.onWriteRequest(ctx.node.id);
      rt.lastWrite = write;
      if (rt.folderName) ctx.remark('Saves to the folder "' + rt.folderName + '"');
      return [text, name];
    }
  });

  T.batchOf = (doc, id) => ({ text: doc.out(id, 0), name: doc.out(id, 1) });
})(window.VR);
