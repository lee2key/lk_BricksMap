# Bricks Map

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
- Select a brick and press **Delete** to remove it (root stays)
- Drag empty canvas (or hold **Space**) to pan; mouse wheel to zoom
- **New map** starts from a single root; **Load example** shows a Houdini-style tree
