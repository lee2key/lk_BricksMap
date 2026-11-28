# lk_BricksMap

A whiteboard for building trees of colored blocks. Download the portable Windows x64 EXE from [GitHub Releases](https://github.com/lee2key/lk_BricksMap/releases/latest) and double-click it. The app uses the Microsoft WebView2 Runtime already present on Windows 11 and many Windows 10 systems.

At startup, choose **New** to create a JSON file in a location you choose, or **Open** to work on an existing JSON file. The desktop app saves changes to the active file once a minute, before switching maps, and on normal exit. Existing board files from earlier versions can be opened directly.

## Controls

- Hover the growing edge of a block and click **+** to add children. If the block is selected, **+** adds a child under every selected block.
- Double-click or press **Enter** to rename. With multiple blocks selected, **Enter** renames them together. **Tab** adds children to selected blocks, or adds the next sibling while editing.
- Click to select, **Shift + click** to toggle blocks, or drag with the left mouse button to select an area. The palette applies colors to the whole selection.
- Drag with the middle mouse button to pan. Scroll or hold the right mouse button and drag vertically to zoom.
- **Layout** switches between left-to-right (the default) and top-to-bottom. **F** or **Fit All** frames the tree. The tree also fits when a file is opened.
- **X**, **Delete**, or **Backspace** removes selected blocks and their descendants. **Ctrl+Z** undoes up to 30 board changes.

## Develop and build

```powershell
npm ci
npm start
```

Open the URL printed by Vite to preview the interface in the browser. The preview uses browser storage instead of updating a file. To build the portable Windows EXE:

```powershell
npm run dist
```

The build downloads a pinned Microsoft WebView2 SDK and produces `release/lk_BricksMap.exe`.
