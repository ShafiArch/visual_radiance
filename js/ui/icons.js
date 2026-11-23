/* Visual Radiance: line icons for the component palette (24 x 24, stroke = currentColor). */
(function (VR) {
  'use strict';
  const I = VR.iconPaths = {
    slider: '<path d="M3 12h18"/><rect x="12" y="7.5" width="4.5" height="9" rx="1.2" fill="currentColor" stroke="none"/>',
    md: '<rect x="4" y="4" width="16" height="16" rx="1.5"/><path d="M14 4v16M4 10h16" opacity=".35"/><circle cx="14" cy="10" r="2.4" fill="currentColor" stroke="none"/>',
    toggle: '<rect x="2.5" y="7.5" width="19" height="9" rx="4.5"/><circle cx="16.5" cy="12" r="2.6" fill="currentColor" stroke="none"/>',
    button: '<circle cx="12" cy="12" r="7.5"/><circle cx="12" cy="12" r="3.5" fill="currentColor" stroke="none"/>',
    list: '<path d="M4 7h10M4 12h10M4 17h10"/><path d="M17 10.5l2.2 2.2 2.2-2.2"/>',
    panel: '<path d="M5 3.5h14v17H5z"/><path d="M8 8.5h8M8 12h8M8 15.5h5"/>',
    file: '<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4"/><path d="M9.5 13h5M9.5 16.5h5"/>',
    scribble: '<path d="M3.5 16.5c2.5-5.5 4.5-6 6.5-2.5s4.5 3.5 10-6"/><path d="M4 20h16"/>',
    point: '<path d="M12 3.5v17M3.5 12h17"/><circle cx="12" cy="12" r="2.6" fill="currentColor" stroke="none"/>',
    params: '<path d="M4 7h3M11 7h9M4 12h9M17 12h3M4 17h5M13 17h7"/><circle cx="9" cy="7" r="2"/><circle cx="15" cy="12" r="2"/><circle cx="11" cy="17" r="2"/>',
    spectral: '<path d="M3.5 19l8.5-14.5L20.5 19z"/><path d="M12.5 12.5l8.5-3M13 14.2l8.5-.4M13.4 15.9l8 2.6" opacity=".75"/>',
    image: '<rect x="3" y="5" width="18" height="14" rx="1.5"/><path d="M3 15.5l5-4 4 3 3-2 6 4.5"/><circle cx="16" cy="9" r="1.5"/>',
    env: '<rect x="3" y="4.5" width="18" height="15" rx="1.5"/><path d="M7 9.5l3 2.5-3 2.5M12.5 15.5h4.5"/>',
    weather: '<circle cx="8.5" cy="8.5" r="3"/><path d="M8.5 2v1.8M2 8.5h1.8M4 4l1.3 1.3M13 4l-1.3 1.3"/><path d="M8.5 20h8.5a3.2 3.2 0 0 0 .3-6.4 4.6 4.6 0 0 0-8.7 1.2 2.6 2.6 0 0 0-.1 5.2z"/>',
    location: '<path d="M12 21s-6.5-6.4-6.5-11.3a6.5 6.5 0 0 1 13 0C18.5 14.6 12 21 12 21z"/><circle cx="12" cy="9.8" r="2.4"/>',
    scene: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M12 12l8-4.5M12 12L4 7.5M12 12v9"/>',
    grid: '<g fill="currentColor" stroke="none"><circle cx="6" cy="6" r="1.5"/><circle cx="12" cy="6" r="1.5"/><circle cx="18" cy="6" r="1.5"/><circle cx="6" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="18" cy="12" r="1.5"/><circle cx="6" cy="18" r="1.5"/><circle cx="12" cy="18" r="1.5"/><circle cx="18" cy="18" r="1.5"/></g>',
    view: '<path d="M2 12s3.8-6.5 10-6.5S22 12 22 12s-3.8 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    receiver: '<path d="M3 18.5a9 9 0 0 1 18 0z"/><path d="M12 9.5v9M6.4 12L9 18.5M17.6 12L15 18.5M3.6 15.2h16.8"/>',
    gensky: '<path d="M3 19.5a9 9 0 0 1 18 0"/><path d="M2 19.5h20"/><circle cx="15" cy="12" r="2.4" fill="currentColor" stroke="none"/>',
    gendaylit: '<path d="M3 19.5a9 9 0 0 1 18 0"/><path d="M2 19.5h20"/><circle cx="9" cy="13.5" r="2"/><path d="M13.5 12h5M13 15h4"/>',
    genssky: '<path d="M3 19.5a9 9 0 0 1 18 0"/><path d="M2 19.5h20"/><path d="M7.5 19.5v-3M10.5 19.5v-5.5M13.5 19.5v-6.5M16.5 19.5v-4"/>',
    annual: '<rect x="3.5" y="5" width="17" height="15.5" rx="1.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/><path d="M7.5 14h2M11 14h2M14.5 14h2M7.5 17.2h2M11 17.2h2"/>',
    pit: '<path d="M3 20h18"/><path d="M12 3.5v3.5M5.5 6.5l2.4 2.4M18.5 6.5l-2.4 2.4"/><path d="M7.5 16.5a4.5 4.5 0 0 1 9 0"/>',
    electric: '<path d="M9.5 18h5M10.5 21h3"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z"/>',
    render: '<rect x="2.5" y="6.5" width="19" height="13.5" rx="2"/><circle cx="12" cy="13.2" r="3.7"/><path d="M8 6.5l1.6-3h4.8l1.6 3"/>',
    specpit: '<path d="M3 19l7-12 7 12z"/><path d="M11.5 12.5l9.5-3M12 14.5h9M12.5 16.2l8.5 2.6" opacity=".75"/>',
    specannual: '<rect x="3" y="5" width="11" height="11" rx="1.2"/><path d="M3 8.5h11M6 3.5v3M11 3.5v3"/><path d="M14 20l3.5-6 3.5 6z"/>',
    writer: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/><path d="M9 11.5l2.3 2-2.3 2M12.5 16.5h3"/>',
    period: '<rect x="3.5" y="5" width="17" height="15" rx="1.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/><path d="M7 15h9.5M14.5 12.8l2.3 2.2-2.3 2.2"/>',
    schedule: '<circle cx="12" cy="12" r="8.5"/><path d="M12 6.8V12l3.6 2.2"/><path d="M12 3.5v1.5M20.5 12H19M12 20.5V19M3.5 12H5" opacity=".6"/>',
    bsdf: '<path d="M3 16.5h18M3 19.5h18"/><path d="M5.5 16.5a6.5 6.5 0 0 1 13 0"/><path d="M12 4.5v12M8.2 8.5l3.8 8 3.8-8" opacity=".75"/>',
    aperture: '<rect x="5" y="3.5" width="14" height="17" rx="1"/><path d="M12 3.5v17M5 12h14"/><path d="M15.8 6.2l-2 2M9.8 14.2l-2 2" opacity=".6"/>',
    ies: '<path d="M7.5 4h9l-2 4.5h-5z"/><path d="M9.5 8.5L5 20M14.5 8.5L19 20" opacity=".7"/><path d="M3.5 20h17"/><path d="M12 11v5" opacity=".5"/>',
    pmap: '<path d="M4 20L20 4" opacity=".35"/><g fill="currentColor" stroke="none"><circle cx="6.5" cy="7" r="1.4"/><circle cx="11" cy="5" r="1.1"/><circle cx="16" cy="9" r="1.4"/><circle cx="9" cy="12" r="1.1"/><circle cx="14" cy="15" r="1.4"/><circle cx="6" cy="17" r="1.1"/><circle cx="18.5" cy="18" r="1.1"/></g>',
    illum: '<rect x="3.5" y="4" width="8" height="16" rx="1"/><path d="M7.5 4v16" opacity=".5"/><path d="M13.5 8l6.5-3M13.5 12h7M13.5 16l6.5 3"/>',
    radiation: '<circle cx="7" cy="7" r="3"/><path d="M7 1.8v1.4M1.8 7h1.4M3.3 3.3l1 1"/><path d="M11 11l6.5 6.5M8.5 13.5l5 5M13.5 8.5l5 5"/><path d="M3 21h18"/>',
    sunhours: '<circle cx="12" cy="12" r="4.5"/><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8"/><path d="M12 9.5V12l1.8 1.2"/>',
    annualglare: '<path d="M2 13s3.6-5.5 9.5-5.5S21 13 21 13s-3.6 5.5-9.5 5.5S2 13 2 13z"/><circle cx="11.5" cy="13" r="2.4"/><path d="M18 2.5v3M16.5 4h3M21.5 6.5v2M20.5 7.5h2"/>',
    annualimages: '<rect x="7" y="3" width="14" height="11" rx="1.2" opacity=".6"/><rect x="3" y="8" width="14" height="12" rx="1.2"/><path d="M3 17l4-3 3 2.2 3-2 4 3"/><circle cx="13" cy="11.5" r="1.2"/>',
    animation: '<rect x="3" y="5" width="18" height="14" rx="1.5"/><path d="M7 5v14M17 5v14M3 9h4M3 15h4M17 9h4M17 15h4"/><path d="M10.5 9.5l4 2.5-4 2.5z" fill="currentColor"/>',
    scenes: '<path d="M5.5 4v16M12 4v16M18.5 4v16"/><rect x="3.5" y="8" width="4" height="3" rx=".8" fill="currentColor" stroke="none"/><rect x="10" y="14" width="4" height="3" rx=".8" fill="currentColor" stroke="none"/><rect x="16.5" y="6" width="4" height="3" rx=".8" fill="currentColor" stroke="none"/>',
    leed: '<path d="M12 3l7 3v5c0 4.6-3 8-7 10-4-2-7-5.4-7-10V6z"/><path d="M8.6 12.2l2.4 2.4 4.4-4.8"/>',
    metrics: '<path d="M3.5 20.5h17"/><rect x="5.5" y="12" width="3" height="8.5"/><rect x="10.5" y="6.5" width="3" height="14"/><rect x="15.5" y="9.5" width="3" height="11"/>',
    stats: '<path d="M17.5 5H6.5l5.5 7-5.5 7h11"/>',
    falsecolor: '<rect x="3" y="4" width="13" height="16" rx="1.2"/><path d="M3 12.5c2.5-2.5 4.8 1.6 7.2-.4 2-1.7 3.8-3.6 5.8-1.6"/><path d="M19.5 4v16" stroke-width="3" opacity=".75"/>',
    tonemap: '<path d="M3.5 20.5h17M3.5 20.5v-17"/><path d="M5 19c4.5 0 5.5-12.5 14.5-14.5"/>',
    glare: '<path d="M2 12s3.8-6 10-6 10 6 10 6-3.8 6-10 6S2 12 2 12z"/><circle cx="12" cy="12" r="2.6"/><path d="M12 1.8v2.2M5.6 3.6l1.2 1.8M18.4 3.6l-1.2 1.8"/>',
    search: '<circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5.5 5.5"/>',
    fit: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/><rect x="8.5" y="8.5" width="7" height="7" rx="1"/>',
    group: '<rect x="3" y="5" width="18" height="14" rx="3" stroke-dasharray="3 2"/><rect x="6.5" y="9" width="4.5" height="6" rx="1"/><rect x="13" y="9" width="4.5" height="6" rx="1"/>',
    power: '<path d="M12 3.5v7.5"/><path d="M6.6 7.3a7.5 7.5 0 1 0 10.8 0"/>',
    trash: '<path d="M4 7h16M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13"/><path d="M10 11v5.5M14 11v5.5"/>',
    undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.6 9.4a2.5 2.5 0 1 1 3.4 2.4c-.6.3-1 .8-1 1.5v.6M12 16.9v.2"/>',
    unknown: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5v.7M12 16.8v.2"/>'
  };

  VR.icon = function (name, size) {
    const s = size || 22;
    return '<svg class="ico" width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (I[name] || I.unknown) + '</svg>';
  };
})(window.VR);
