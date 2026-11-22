# lk Bricks Map

A whiteboard for building trees of colored blocks. Download the portable Windows x64 EXE from [GitHub Releases](https://github.com/lee2key/lk_BricksMap/releases/latest) and double-click it. The app uses the Microsoft WebView2 Runtime already present on Windows 11 and many Windows 10 systems.

Keep the EXE in a writable folder. The app opens `board.json` beside it on startup and saves changes there once a minute and on normal exit. To move a board, copy its JSON with the EXE. To migrate an older Electron board, export it there and import it here.

## Controls

- Hover the growing edge of a block and click **+** to add children. If the block is selected, **+** adds a child under every selected block.
- Double-click to rename. While editing, press **Tab** to add and edit the next sibling.
- Click to select, **Shift + click** to toggle blocks, or drag with the left mouse button to select an area. The palette applies colors to the whole selection.
- Drag with the middle mouse button to pan. Scroll to zoom.
- **Layout** switches between top-to-bottom and left-to-right. **F** or **Fit All** frames the tree. Startup and import also fit the tree.
- **X**, **Delete**, or **Backspace** removes selected blocks and their descendants. **Ctrl+Z** undoes up to 30 board changes.
- **Create New** starts a board with one root. **Import** opens a JSON board. **Export** opens a Save As dialog in the desktop app.

## Develop and build

```powershell
npm ci
npm start
```

Open the URL printed by Vite to work in the browser. To build the portable Windows EXE:

```powershell
npm run dist
```

The build downloads a pinned Microsoft WebView2 SDK and produces `release/lk Bricks Map.exe`.
