# Visual Radiance

A node editor in the style of Grasshopper for composing [Radiance](https://www.radiance-online.org/) simulations. You wire sliders, panels, toggles and value lists into Radiance components, and the app writes a Windows batch file (`.bat`). Put the batch file in your project folder, run it, and Radiance does the rest.

It is a static web app: plain HTML, CSS and JavaScript with no build step and no server. It runs on GitHub Pages, or straight from `index.html` on your computer.

## Using the canvas

| Action | How |
| - | - |
| Add a component | Double-click the canvas and type a name, click a button in the palette, or drag one onto the canvas |
| Quick slider or panel | In the search box type a number (`3`), a range (`0<3<12`) or text that starts with a quote (`"envelope.rad`) |
| Connect | Drag from an output grip to an input grip. Shift adds a wire, Ctrl removes one, Ctrl+Shift moves all wires to another grip |
| Set up an input | Right-click an input and choose Add slider, Add panel, Add toggle or Add value list. It comes preset with the right range |
| Read data | Hover a grip for its value, or connect a Panel to any output |
| Pan and zoom | Right-drag or middle-drag to pan, mouse wheel to zoom, F to fit everything |
| Select | Click, or drag a window (left to right selects inside, right to left selects crossing). Shift adds, Ctrl removes |
| Edit | Ctrl+Z, Ctrl+Y, Ctrl+C, Ctrl+V, Ctrl+D, Delete, Ctrl+G to group, Ctrl+E to enable or disable, Alt+drag to duplicate |
| Radial menu | Space |
| Save your work | Ctrl+S saves a `.vrad.json` definition. The app also autosaves in the browser |

Components turn orange when an input is missing or a setting looks wrong, and red when they cannot run. Hover the badge in the corner to read the message.

## Components

**Params**: Number Slider (R, N, E and O rounding like Grasshopper), MD Slider (two values, for resolution, view size or a wavelength range), Boolean Toggle, Button, Value List (drop-down or cycle), Panel, File Path, Scribble and Construct Point.

**Radiance**

| Component | What it does |
| - | - |
| Radiance Parameters | Every quality option in one component (`-ab -ad -as -ar -aa -lr -lw -dj -ds -dt -dc -dr -dp -ss -st -av -aw -ps -pt -pj`). Start from a preset (none, low, medium, high) and connect sliders to the options you want to set. Each workflow only passes the options its program accepts |
| Spectral Settings | `-cs` bands, `-cw` wavelength range and the output (`-co+`, `-pY`, `-pM`, `-pS`, `-pXYZ`, `-pRGB`, `-pA`, PAR or PPFD) for Radiance 6 |
| Image Settings | Render resolution, warm-up pass size, pfilt downsampling and progress reports |
| Radiance Folders | Adds the Radiance `bin` folder to PATH and `lib` to RAYPATH inside the batch file |
| Photon Map | Adds a photon map to Radiance Parameters: mkpmap after the octree and `-ap` for rtrace or rpict, with photon ports for daylight |
| Weather File | The EPW file. Double-click it to load the EPW and read its location and hourly data |
| Location | Latitude, longitude (east positive) and time zone, converted to gensky's `-a -o -m` |
| Scene | Scene files for oconv, or an existing octree |
| Sensor Grid | Points file, with an optional fixed count (otherwise the batch file counts the points) |
| View | `-vt -vp -vd -vu -vh -vv` |
| Illum Windows | Turns windows into secondary sources with mkillum and returns the scene with the illum file |
| Sky Receiver | The `skyglow.rad` receiver for rfluxmtx (Tregenza or Reinhart), written by the batch file if you want |
| CIE Sky, Perez Sky, Spectral Sky | gensky, gendaylit (`-W`) and genssky skies |
| Analysis Period | Start and end date and hours, as in Ladybug. Also gives the hours of the year in the period |
| Occupancy Schedule | Occupied hours every day (8 to 18 for LM-83 and LEED) or a CSV file with one value per hour |
| BSDF | An XML file, or one made by genBSDF from shading geometry (Klems or tensor tree) |
| Window Group | Glazing polygons, their BSDF and an optional facade aperture. The batch file writes the `#@rfluxmtx` receiver file and a BSDF material version of the glazing |
| IES Luminaire | ies2rad, then xform copies at the given points and rotations. One component is one luminaire group |

**Workflows**

| Component | Commands it writes |
| - | - |
| Annual Illuminance | One component for every annual method (see Method below). The default is two-phase DDS |
| Point-in-Time Illuminance | oconv with the sky, rtrace, and the rcalc conversion for the chosen Quantity |
| Electric Illuminance | oconv with luminaires (files or IES Luminaire components), rtrace |
| Lighting Scenes | One rtrace per luminaire group at full output, then rlam and rcalc add the groups with each scene's dimming levels |
| Point-in-Time Render | oconv, a low resolution rpict warm-up that fills the ambient cache, the main rpict render, pcompos, pfilt and the view written into the HDR header. Optional rtpict image layers (depth, normals, material ids) |
| Annual Images | Image-based daylight coefficients: vwrays into rfluxmtx (one image per sky patch), then dctimestep for the chosen hours |
| Animation | Views interpolated between key views, rpict `-S` with one ambient cache, then pfilt on every frame |
| Spectral Point-in-Time | rtrace with spectral sampling |
| Spectral Annual | For each hour in a list: genssky, oconv and spectral rtrace (with that hour's cloud cover and illuminance when the EPW was loaded) |
| Cumulative Radiation | An average solar sky over the period (gendaymtx `-A -O1`), daylight coefficients, and the total in kWh/m2 |
| Direct Sun Hours | One sun per time step with the sun up (gendaymtx `-D`), rcontrib, and rcomb to add up the hours. Possible sun or weather-based sun, with an optional EN 17037 sunlight exposure check |
| Annual Glare | dcglare from direct-view and total daylight coefficients: hourly DGP and glare autonomy |
| LEED Illuminance | LEED v4.1 EQ Daylight option 2: illuminance at 9 am and 3 pm under clear skies, the share of sensors between 300 and 3000 lux, and the points |

**Post**: these take a workflow's Scr output (or existing result file names) and write their own script. The Batch Writer adds the simulation before the post step, once.

| Component | What it does |
| - | - |
| Annual Metrics | DA, continuous DA, UDI, sDA and ASE from an annual result, with LEED v4.1 option 1 points or the EN 17037 daylight provision level |
| Grid Statistics | Mean, minimum, maximum, uniformity and the share of sensors above thresholds |
| Falsecolor | falsecolor with the right multiplier and label for the render quantity, as bands or lines over the image if you like, and BMP or TIFF export |
| Tone Map | pcond (human vision, linear or acuity) and export to BMP, TIFF, PPM or HDR |
| Glare | evalglare on fisheye images: DGP, DGI, UGR, VCP and CGI, with a check image |

**Output**: Batch Writer. Connect one or more workflow or post scripts and set the file name. Options: project folder (`cd /d`), run in the batch file's own folder (`cd /d "%~dp0"`, on by default), Radiance folders, `@echo off`, comments, progress messages, `pause`, a Write input for a Button or Toggle, and Simulations first (adds the simulations that post steps need; turn it off to post-process results you already have).

### Shared settings

To keep the components lean, a few inputs mean the same thing everywhere.

**Quantity** (Point-in-Time, Electric, Annual, Render, Lighting Scenes): raw RGB, illuminance (lux), irradiance (W/m2), luminance (cd/m2, the sensor direction is the view ray), radiance, daylight factor (percent, under its own CIE overcast sky of 10,000 lux), sky view (percent, a uniform sky seen directly with `-ab 1`) and melanopic EDI (lux, `-pM`). Point-in-Time keeps raw RGB when nothing is connected, as before, and a True or False toggle still means illuminance or raw.

**Method** (Annual): `dds` two-phase plus accurate direct sun (default), `two` daylight coefficients only, `three` V T D S with Window Groups, `four` adds the facade matrix F, `five` and `six` add the direct sun correction to three- and four-phase, and `direct` runs gendaylit and rtrace for every daylight hour. The commands follow the LBNL tutorial on matrix-based methods. Window groups face into the room, and for three- to six-phase the scene leaves out the glazing.

Annual results have one row per hour and one column per sensor (`rmtxop -t`). Annual Metrics reads that layout.

## Getting the batch file onto your computer

- **Export .bat** in the top bar saves the file from every Batch Writer. Browsers save it to your Downloads folder; move it into the project folder that holds your `.rad`, `.pts` and `.epw` files and double-click it.
- Chrome and Edge can save straight into a folder: right-click the Batch Writer and choose **Choose save folder**.
- Chrome may ask you to confirm before keeping a downloaded `.bat` file, because it is a program file.
- The batch files call Radiance programs by name. If Radiance is not on your PATH, connect a **Radiance Folders** component to the Batch Writer.

## Deploying on GitHub Pages

1. In the repository on GitHub, open **Settings > Pages**.
2. Under **Build and deployment**, choose **Deploy from a branch**, then branch `main` and folder `/ (root)`, and save.
3. After a minute the app is live at `https://shafiarch.github.io/visual_radiance/`.

`.nojekyll` is included so GitHub serves every file as is. An example can be opened directly with a link such as `https://shafiarch.github.io/visual_radiance/?example=annual`.

## Project layout

```
index.html               page shell
css/app.css              styles
js/core/                 helpers, data conversion, document model and solver
js/radiance/             Radiance options and presets, and the command builders:
                         builders.js (core workflows), studies.js (annual methods and
                         studies), post.js (metrics and images)
js/components/           Params, Radiance, Workflows, Post and Output components
js/ui/                   canvas, widgets, menus, palette and icons
js/examples.js           examples that rebuild the reference files
js/examples-more.js      examples for the other workflows
js/main.js               app setup, files, undo, keyboard
reference/               the original batch files
tests/check-reference.js rebuilds the examples and compares them with reference/
tests/check-workflows.js solves every example and checks the batch text
```

To add a component, call `VR.defineComponent` with its inputs, outputs and a `solve` function (see `js/components/radiance.js`). It appears in the palette and in search automatically.

## Notes

- Batch files are written for Windows `cmd.exe`, with CRLF line endings.
- Spectral options (`-cs`, `-cw`, `-co`, `-pM`), genssky, gensdaymtx, rcomb (used by Annual Metrics and Direct Sun Hours) and `gendaymtx -D` need Radiance 6.
- genBSDF and rtpict are Perl scripts. On Windows install Perl; if `genBSDF` is not found, pick `perl -S genBSDF.pl` in the BSDF component's menu.
- Daylight factor uses `gensky -ang 45 0 -c -B 55.866` (10,000 lux), so the result in lux divided by 100 is the daylight factor in percent.
- EN 17037 daylight provision counts the half of the year with the most global horizontal irradiance as daylight hours (the same idea as Ladybug Tools), read from the EPW when the batch file runs.
- PPFD uses 4.57 umol/J, the usual factor for daylight.
- genssky precomputes atmosphere data into an `atmos_data` folder the first time it runs, which takes a while.
- Radiance parameter presets follow the low, medium and high settings used by Ladybug Tools (Honeybee). Slider ranges follow the Radiance notes on rendering options.

Visual Radiance by Shafiul Islam.
