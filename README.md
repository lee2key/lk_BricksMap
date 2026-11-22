# lk Bricks

Download **lk-Bricks-Setup-1.0.0-x64.exe** from [GitHub Releases](https://github.com/lee2key/lk_BricksMap/releases/latest), run the installer, then open **lk Bricks** from the Start menu. No separate Node.js installation or terminal is required.

Windows whiteboard for a **top-down brick tree** — one root bar, children in a row underneath, and a **+** that appears when you hover the bottom of a brick.

## Run (dev)

```bash
npm install
npm start
```

This opens the desktop window. For the browser only: `npm run dev`, then open http://127.0.0.1:5173

## Installer

```bash
npm run dist
```

Creates a Windows installer in `release/`.

## Use

- Hover the **bottom edge** of any rectangle → **+** appears
- Click **+** to add a child brick under it (new bricks join that parent’s row)
- Double-click a brick to rename
- Hold **Shift** and click bricks to toggle any combination of selected bricks
- Press **X**, **Delete**, or **Backspace** to remove selected bricks and their descendants (root stays); X also works with the Russian keyboard layout
- Click a brick without Shift to select only it; click empty canvas to clear selection
- Drag empty canvas (or hold **Space**) to pan; mouse wheel to zoom
- **New map** starts from a single root; **Load example** shows a Houdini-style tree

## Board files

- **Export** downloads the current board as `bricks-map.json`, including all titles, colors, and hierarchy.
- **Import** loads an exported JSON file and replaces the current board. Export first if you want to keep it. Invalid files leave the board unchanged.

- **Ctrl+Z** undoes up to 30 board changes (including import, new map, and loading the example). Selection and camera movements do not count; history lasts until the app reloads.
- **F** or **Fit All** centers the entire board and adjusts zoom to fit it on screen. Shortcuts also work with the Russian keyboard layout; while editing text, Ctrl+Z keeps its normal text-editing behavior.
