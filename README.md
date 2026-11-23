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
| Spectral Settings | `-cs` bands, `-cw` wavelength range and the output (`-co+`, `-pY`, `-pM`, `-pS`, `-pXYZ`, `-pRGB`, `-pA`) for Radiance 6 |
| Image Settings | Render resolution, warm-up pass size, pfilt downsampling and progress reports |
| Radiance Folders | Adds the Radiance `bin` folder to PATH and `lib` to RAYPATH inside the batch file |
| Weather File | The EPW file. Double-click it to load the EPW and read its location and hourly data |
| Location | Latitude, longitude (east positive) and time zone, converted to gensky's `-a -o -m` |
| Scene | Scene files for oconv, or an existing octree |
| Sensor Grid | Points file, with an optional fixed count (otherwise the batch file counts the points) |
| View | `-vt -vp -vd -vu -vh -vv` |
| Sky Receiver | The `skyglow.rad` receiver for rfluxmtx (Tregenza or Reinhart), written by the batch file if you want |
| CIE Sky, Perez Sky, Spectral Sky | gensky, gendaylit (`-W`) and genssky skies |

**Workflows**

| Component | Commands it writes |
| - | - |
| Annual Illuminance | epw2wea, gendaymtx, rfluxmtx daylight coefficients, a black-scene direct pass, Reinhart sun coefficients with rcontrib, dctimestep and rmtxop. Result: total minus direct-only plus direct sun |
| Point-in-Time Illuminance | oconv with the sky, `rtrace -I`, optional conversion to lux with rcalc |
| Electric Illuminance | oconv with luminaires, `rtrace -I` |
| Point-in-Time Render | oconv, a low resolution rpict warm-up that fills the ambient cache, the main rpict render, pcompos, pfilt and the view written into the HDR header |
| Spectral Point-in-Time | rtrace with spectral sampling |
| Spectral Annual | For each hour in a list: genssky, oconv and spectral rtrace (with that hour's cloud cover and illuminance when the EPW was loaded) |

**Output**: Batch Writer. Connect one or more workflow scripts and set the file name. Options: project folder (`cd /d`), run in the batch file's own folder (`cd /d "%~dp0"`, on by default), Radiance folders, `@echo off`, comments, progress messages, `pause`, and a Write input for a Button or Toggle.

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
js/radiance/             Radiance options, presets and the command builders
js/components/           Params, Radiance, Workflows and Output components
js/ui/                   canvas, widgets, menus, palette and icons
js/examples.js           example definitions
js/main.js               app setup, files, undo, keyboard
reference/               the original batch files
tests/check-reference.js rebuilds the examples and compares them with reference/
```

To add a component, call `VR.defineComponent` with its inputs, outputs and a `solve` function (see `js/components/radiance.js`). It appears in the palette and in search automatically.

## Notes

- Batch files are written for Windows `cmd.exe`, with CRLF line endings.
- Spectral options (`-cs`, `-cw`, `-co`, `-pM`), genssky and gensdaymtx need Radiance 6.
- genssky precomputes atmosphere data into an `atmos_data` folder the first time it runs, which takes a while.
- Radiance parameter presets follow the low, medium and high settings used by Ladybug Tools (Honeybee). Slider ranges follow the Radiance notes on rendering options.

Visual Radiance by Shafiul Islam.
