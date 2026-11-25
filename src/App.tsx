import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from "react";
import {
  addChildren,
  COLOR_ROWS,
  blankTree,
  BrickNode,
  layoutTree,
  PlacedBrick,
  recolorNodes,
  removeNode,
  renameAndAddSibling,
  renameNode,
  type TreeDirection,
} from "./tree";

const STORAGE_KEY = "bricks-map-tree-v1";
const DIRECTION_KEY = "bricks-map-direction";

declare global {
  interface Window {
    lkDesktop?: boolean;
    lkValidateBoard?: (encoded: string) => boolean;
    chrome?: { webview?: EventTarget & { postMessage(message: string): void } };
  }
}

function parseBoard(raw: string): BrickNode {
  const data = JSON.parse(raw);
  if (data?.format !== "bricks-map" || data.version !== 1) throw new Error("Unsupported board file.");
  const ids = new Set<string>();
  const validate = (node: unknown, depth = 0): BrickNode => {
    if (!node || typeof node !== "object" || depth > 100 || ids.size >= 10000) throw new Error("Invalid board structure.");
    const n = node as Record<string, unknown>;
    if (typeof n.id !== "string" || !n.id || ids.has(n.id) || typeof n.title !== "string" ||
      typeof n.color !== "string" || !/^#[0-9a-f]{6}$/i.test(n.color) || !Array.isArray(n.children)) {
      throw new Error("Invalid board structure.");
    }
    ids.add(n.id);
    return { id: n.id, title: n.title, color: n.color, children: n.children.map((child) => validate(child, depth + 1)) };
  };
  return validate(data.tree);
}

function serializeBoard(tree: BrickNode) {
  return JSON.stringify({ format: "bricks-map", version: 1, tree }, null, 2);
}

function decodeBoard(encoded: string) {
  const bytes = Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0));
  return parseBoard(new TextDecoder().decode(bytes));
}

const desktop = window.lkDesktop ? window.chrome?.webview : undefined;
if (desktop) {
  window.lkValidateBoard = (encoded) => {
    try { decodeBoard(encoded); return true; }
    catch { return false; }
  };
}

function loadTree(): BrickNode {
  if (desktop) return blankTree();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as BrickNode;
  } catch {
    /* ignore */
  }
  return blankTree();
}

type BoardAction = { type: "change"; value: BrickNode | ((tree: BrickNode) => BrickNode) } | { type: "undo" } | { type: "load"; tree: BrickNode };

function boardReducer(state: { tree: BrickNode; past: BrickNode[] }, action: BoardAction) {
  if (action.type === "load") return { tree: action.tree, past: [] };
  if (action.type === "undo") {
    if (!state.past.length) return state;
    return { tree: state.past[state.past.length - 1], past: state.past.slice(0, -1) };
  }
  const tree = typeof action.value === "function" ? action.value(state.tree) : action.value;
  if (JSON.stringify(tree) === JSON.stringify(state.tree)) return state;
  return { tree, past: [...state.past, state.tree].slice(-30) };
}

type Point = { x: number; y: number };
type Marquee = { left: number; top: number; right: number; bottom: number };
type Gesture =
  | { kind: "pan"; pointerId: number; start: Point; camera: Point }
  | { kind: "select"; pointerId: number; start: Point; brickId?: string; extend: boolean; moved: boolean };

function selectionBounds(start: Point, end: Point): Marquee {
  return {
    left: Math.min(start.x, end.x),
    top: Math.min(start.y, end.y),
    right: Math.max(start.x, end.x),
    bottom: Math.max(start.y, end.y),
  };
}

export default function App() {
  const [{ tree }, dispatch] = useReducer(boardReducer, undefined, () => ({ tree: loadTree(), past: [] }));
  const setTree = (value: BrickNode | ((tree: BrickNode) => BrickNode)) => dispatch({ type: "change", value });
  const [fileSession, setFileSession] = useState<number | null>(null);
  const welcome = !!desktop && fileSession === null;
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [hoverPlusId, setHoverPlusId] = useState<string | null>(null);
  const [direction, setDirection] = useState<TreeDirection>(() => {
    try { return localStorage.getItem(DIRECTION_KEY) === "down" ? "down" : "right"; }
    catch { return "right"; }
  });
  const [camera, setCamera] = useState({ x: 80, y: 90, scale: 1 });
  const [panning, setPanning] = useState(false);
  const [marquee, setMarquee] = useState<Marquee | null>(null);

  const importRef = useRef<HTMLInputElement>(null);
  const [fileError, setFileError] = useState("");
  const boardRef = useRef<HTMLDivElement>(null);
  const gestureRef = useRef<Gesture | null>(null);

  const endGesture = useCallback(() => {
    const gesture = gestureRef.current;
    gestureRef.current = null;
    const board = boardRef.current;
    if (gesture && board?.hasPointerCapture(gesture.pointerId)) {
      board.releasePointerCapture(gesture.pointerId);
    }
    setPanning(false);
    setMarquee(null);
  }, []);

  const placed = useMemo(() => welcome ? [] : layoutTree(tree, direction), [tree, direction, welcome]);

  const previousTree = useRef(tree);
  useLayoutEffect(() => {
    if (desktop) {
      if (fileSession !== null && previousTree.current !== tree) {
        desktop.postMessage("save:" + fileSession + ":" + serializeBoard(tree));
        previousTree.current = tree;
      }
      return;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tree));
  }, [fileSession, tree]);

  const fitBoard = useCallback((bricks: PlacedBrick[]) => {
    const rect = boardRef.current?.getBoundingClientRect();
    if (!rect || !bricks.length || !rect.width || !rect.height) return;
    const left = Math.min(...bricks.map((b) => b.x));
    const top = Math.min(...bricks.map((b) => b.y));
    const width = Math.max(...bricks.map((b) => b.x + b.width)) - left;
    const height = Math.max(...bricks.map((b) => b.y + b.height)) - top;
    const scale = Math.min(1, Math.max(1, rect.width - 112) / width, Math.max(1, rect.height - 112) / height);
    endGesture();
    setCamera({ scale, x: (rect.width - width * scale) / 2 - left * scale, y: (rect.height - height * scale) / 2 - top * scale });
  }, [endGesture]);

  const fitAll = useCallback(() => fitBoard(placed), [fitBoard, placed]);
  const lastFittedDirection = useRef<TreeDirection>();
  useLayoutEffect(() => {
    if (lastFittedDirection.current === direction) return;
    lastFittedDirection.current = direction;
    fitAll();
  }, [direction, fitAll]);

  useEffect(() => {
    try { localStorage.setItem(DIRECTION_KEY, direction); } catch { /* Storage is optional for view preferences. */ }
  }, [direction]);

  useEffect(() => {
    if (welcome) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;
      if (e.type === "keydown" && !typing) {
        if (e.ctrlKey && !e.altKey && !e.shiftKey && e.code === "KeyZ") {
          e.preventDefault();
          dispatch({ type: "undo" });
          setSelectedIds(new Set());
          setEditingId(null);
          setHoverPlusId(null);
          return;
        }
        if (e.code === "KeyF" && !e.ctrlKey && !e.metaKey && !e.altKey) {
          e.preventDefault();
          fitAll();
          return;
        }
      }
      if (e.type === "keydown" && (e.key === "Delete" || e.key === "Backspace" ||
        (e.code === "KeyX" && !e.ctrlKey && !e.metaKey && !e.altKey))) {
        const t = e.target as HTMLElement;
        if (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable) return;
        if ([...selectedIds].some((id) => id !== tree.id)) {
          e.preventDefault();
          setTree((prev) => [...selectedIds].reduce((next, id) => removeNode(next, id), prev));
          setEditingId(null);
          setHoverPlusId(null);
          setSelectedIds(new Set());
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [selectedIds, tree.id, fitAll, welcome]);

  const onWheel = useCallback((e: React.WheelEvent) => {
    if (welcome) return;
    e.preventDefault();
    const rect = boardRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    setCamera((cam) => {
      const factor = e.deltaY > 0 ? 0.92 : 1.08;
      const next = Math.min(2.4, Math.max(0.25, cam.scale * factor));
      const wx = (mx - cam.x) / cam.scale;
      const wy = (my - cam.y) / cam.scale;
      return { scale: next, x: mx - wx * next, y: my - wy * next };
    });
  }, [welcome]);

  const pointerPosition = (e: React.PointerEvent<HTMLDivElement>): Point => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const onPointerDownBoard = (e: React.PointerEvent<HTMLDivElement>) => {
    if (welcome || gestureRef.current || (e.button !== 0 && e.button !== 1)) return;
    const target = e.target as Element;
    if (target.closest(".board-actions") || (e.button === 0 && target.closest("button, input"))) return;

    const start = pointerPosition(e);
    if (e.button === 1) {
      e.preventDefault();
      gestureRef.current = { kind: "pan", pointerId: e.pointerId, start, camera };
      e.currentTarget.setPointerCapture(e.pointerId);
      setPanning(true);
    } else {
      const brickId = target.closest<HTMLElement>("[data-brick-id]")?.dataset.brickId;
      gestureRef.current = { kind: "select", pointerId: e.pointerId, start, brickId, extend: e.shiftKey, moved: false };
      if (!brickId) e.currentTarget.setPointerCapture(e.pointerId);
    }
  };

  const onPointerMoveBoard = (e: React.PointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== e.pointerId) return;
    const point = pointerPosition(e);
    if (gesture.kind === "pan") {
      setCamera((cam) => ({
        ...cam,
        x: gesture.camera.x + point.x - gesture.start.x,
        y: gesture.camera.y + point.y - gesture.start.y,
      }));
      return;
    }

    if (!gesture.moved && Math.hypot(point.x - gesture.start.x, point.y - gesture.start.y) < 4) return;
    if (!gesture.moved) {
      gesture.moved = true;
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    setMarquee(selectionBounds(gesture.start, point));
  };

  const onPointerUpBoard = (e: React.PointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== e.pointerId) return;
    if (gesture.kind === "select") {
      if (gesture.moved) {
        const box = selectionBounds(gesture.start, pointerPosition(e));
        const hits = placed.filter((brick) => {
          const left = camera.x + brick.x * camera.scale;
          const top = camera.y + brick.y * camera.scale;
          return left < box.right && left + brick.width * camera.scale > box.left &&
            top < box.bottom && top + brick.height * camera.scale > box.top;
        });
        setSelectedIds((prev) => new Set([...(gesture.extend ? prev : []), ...hits.map((brick) => brick.id)]));
      } else {
        const id = gesture.brickId;
        setSelectedIds((prev) => {
          if (!gesture.extend) return new Set(id ? [id] : []);
          if (!id) return prev;
          const next = new Set(prev);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
        });
      }
    }
    endGesture();
  };

  const cancelPointerGesture = (e: React.PointerEvent<HTMLDivElement>) => {
    if (gestureRef.current?.pointerId === e.pointerId) endGesture();
  };

  const handleAdd = (id: string) => {
    const parents = selectedIds.has(id) ? selectedIds : new Set([id]);
    const { tree: next, added } = addChildren(tree, parents);
    const editingChild = added.get(id);
    if (!editingChild) return;
    setTree(next);
    setSelectedIds(new Set(added.values()));
    setEditingId(editingChild);
    setHoverPlusId(null);
  };

  const handleAddSibling = (id: string, title: string) => {
    const result = renameAndAddSibling(tree, id, title);
    if (!result) return;

    setTree(result.tree);
    setSelectedIds(new Set([result.newId]));
    setEditingId(result.newId);
    setHoverPlusId(null);

    const board = boardRef.current;
    const sibling = layoutTree(result.tree, direction).find((brick) => brick.id === result.newId);
    if (!board || !sibling) return;
    setCamera((cam) => {
      const padding = 24;
      const keepVisible = (offset: number, start: number, size: number, viewport: number) => {
        const min = padding - start * cam.scale;
        const max = viewport - padding - (start + size) * cam.scale;
        return Math.max(min, Math.min(max, offset));
      };
      return {
        ...cam,
        x: keepVisible(cam.x, sibling.x, sibling.width, board.clientWidth),
        y: keepVisible(cam.y, sibling.y, sibling.height, board.clientHeight),
      };
    });
  };

  const loadBoard = useCallback((next: BrickNode) => {
    previousTree.current = next;
    dispatch({ type: "load", tree: next });
    setSelectedIds(new Set());
    setEditingId(null);
    setHoverPlusId(null);
    setFileError("");
    fitBoard(layoutTree(next, direction));
  }, [direction, fitBoard]);

  useEffect(() => {
    if (!desktop) return;
    const onMessage = (event: Event) => {
      const message: unknown = (event as MessageEvent).data;
      if (typeof message !== "string") return;
      const loaded = /^loaded:(\d+):(.+)$/.exec(message);
      if (!loaded) return;
      loadBoard(decodeBoard(loaded[2]));
      setFileSession(Number(loaded[1]));
    };
    desktop.addEventListener("message", onMessage);
    return () => desktop.removeEventListener("message", onMessage);
  }, [loadBoard]);

  const newMap = () => {
    const next = blankTree();
    if (desktop) desktop.postMessage("new:" + serializeBoard(next));
    else loadBoard(next);
  };

  const openMap = () => {
    if (desktop) desktop.postMessage("open");
    else importRef.current?.click();
  };

  const openBrowserFile = async (file: File) => {
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error("File is too large (maximum 5 MB).");
      loadBoard(parseBoard(await file.text()));
    } catch (error) {
      setFileError(error instanceof SyntaxError ? "Invalid JSON file." : error instanceof Error ? error.message : "Could not read the board file.");
    }
  };

  const selected = placed.filter((brick) => selectedIds.has(brick.id));

  return (
    <div className="app">
      <header className={`toolbar${welcome ? " welcome-tools" : ""}`}>
        {welcome && <p>Open a map or start a new one.</p>}
        <button type="button" onClick={newMap}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
          New
        </button>
        <button type="button" onClick={openMap}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>
          Open
        </button>
        {!desktop && <input ref={importRef} type="file" accept=".json,application/json" hidden onChange={(e) => {
          const file = e.currentTarget.files?.[0];
          e.currentTarget.value = "";
          if (file) void openBrowserFile(file);
        }} />}
      </header>
      {fileError && <div role="alert" className="file-error">{fileError}</div>}

      <div
        ref={boardRef}
        data-direction={direction}
        className={`board ${panning ? "panning" : marquee ? "selecting" : ""}`}
        onWheel={onWheel}
        onPointerDown={onPointerDownBoard}
        onPointerMove={onPointerMoveBoard}
        onPointerUp={onPointerUpBoard}
        onPointerCancel={cancelPointerGesture}
        onLostPointerCapture={cancelPointerGesture}
        onPointerLeave={(e) => {
          if (!e.currentTarget.hasPointerCapture(e.pointerId)) cancelPointerGesture(e);
        }}
        onAuxClick={(e) => {
          if (e.button === 1) e.preventDefault();
        }}
      >
        <div
          className="world"
          data-world="1"
          style={{
            transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.scale})`,
          }}
        >
          {placed.map((brick) => (
            <Brick
              key={brick.id}
              brick={brick}
              selected={selectedIds.has(brick.id)}
              editing={brick.id === editingId}
              showPlus={hoverPlusId === brick.id}
              onEdit={() => setEditingId(brick.id)}
              onRename={(title) => {
                setTree((prev) => renameNode(prev, brick.id, title));
                setEditingId(null);
              }}
              onAddSibling={brick.id === tree.id ? undefined : (title) => handleAddSibling(brick.id, title)}
              onPlusEnter={() => setHoverPlusId(brick.id)}
              onPlusLeave={() => setHoverPlusId((id) => (id === brick.id ? null : id))}
              onAdd={() => handleAdd(brick.id)}
            />
          ))}
        </div>

        {marquee && (
          <div className="marquee" aria-hidden="true" style={{
            left: marquee.left,
            top: marquee.top,
            width: marquee.right - marquee.left,
            height: marquee.bottom - marquee.top,
          }} />
        )}

        {!welcome && <>
        <p className="hint">
          <span>+ · Add children to selected blocks</span>
          <span>Double-click · Rename</span>
          <span>Tab while editing · Add {direction === "right" ? "below" : "to the right"}</span>
          <span>Shift + click · Select multiple blocks</span>
          <span>X / Delete · Remove selected blocks</span>
          <span>Ctrl + Z · Undo</span>
          <span>Left drag · Select blocks</span>
          <span>Middle drag · Pan</span>
          <span>Scroll · Zoom</span>
          <span>F · Fit all</span>
        </p>
        <div className="board-actions">
          <button type="button" aria-pressed={direction === "right"}
            title={direction === "right" ? "Show tree top to bottom" : "Show tree left to right"}
            onClick={() => setDirection((current) => current === "right" ? "down" : "right")}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              {direction === "right" ? <path d="M4 12h15m-6-6 6 6-6 6" /> : <path d="M12 4v15m-6-6 6 6 6-6" />}
            </svg>
            Layout
          </button>
          <button type="button" onClick={fitAll} title="Fit All (F)" aria-label="Fit All (F)">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M8 3H3v5M16 3h5v5M21 16v5h-5M8 21H3v-5" />
            </svg>
            Fit All
          </button>
        </div>
        </>}
      </div>

      {selected.length > 0 && (
        <aside className="inspector">
          <span>Color</span>
          <div className="swatches" role="group" aria-label="Color palette">
            {COLOR_ROWS.flat().map((color) => (
              <button
                key={color}
                type="button"
                className="swatch"
                style={{ background: color }}
                onClick={() => setTree((prev) => recolorNodes(prev, selectedIds, color))}
                title={color}
                aria-label={color}
                aria-pressed={selected.every((brick) => color.toLowerCase() === brick.color.toLowerCase())}
              />
            ))}
          </div>
        </aside>
      )}
    </div>
  );
}

function Brick({
  brick,
  selected,
  editing,
  showPlus,
  onEdit,
  onRename,
  onAddSibling,
  onPlusEnter,
  onPlusLeave,
  onAdd,
}: {
  brick: PlacedBrick;
  selected: boolean;
  editing: boolean;
  showPlus: boolean;
  onEdit: () => void;
  onRename: (title: string) => void;
  onAddSibling?: (title: string) => void;
  onPlusEnter: () => void;
  onPlusLeave: () => void;
  onAdd: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const addedSibling = useRef(false);
  const dark = isDark(brick.color);

  useEffect(() => {
    if (editing) {
      addedSibling.current = false;
      inputRef.current?.focus({ preventScroll: true });
      inputRef.current?.select();
    }
  }, [editing]);

  return (
    <div
      className={`brick ${selected ? "selected" : ""} ${dark ? "dark" : ""}`}
      style={{
        left: brick.x,
        top: brick.y,
        width: brick.width,
        height: brick.height,
        background: brick.color,
      }}
      data-brick-id={brick.id}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onEdit();
      }}
    >
      {editing ? (
        <input
          ref={inputRef}
          className="brick-input"
          defaultValue={brick.title}
          onBlur={(e) => {
            if (!addedSibling.current) onRename(e.currentTarget.value.trim() || "New");
          }}
          onKeyDown={(e) => {
            if (e.key === "Tab" && onAddSibling && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              if (!e.repeat) {
                addedSibling.current = true;
                onAddSibling(e.currentTarget.value.trim() || "New");
              }
              return;
            }
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") {
              e.currentTarget.value = brick.title;
              e.currentTarget.blur();
            }
          }}
        />
      ) : (
        <span className="brick-title">{brick.title}</span>
      )}

      <div
        className="plus-zone"
        onPointerEnter={onPlusEnter}
        onPointerLeave={onPlusLeave}
      />

      {(showPlus || selected) && (
        <button
          type="button"
          className="plus"
          title="Add child block"
          onPointerEnter={onPlusEnter}
          onPointerLeave={onPlusLeave}
          onClick={(e) => {
            e.stopPropagation();
            onAdd();
          }}
        >
          +
        </button>
      )}
    </div>
  );
}

function isDark(hex: string) {
  const n = hex.replace("#", "");
  const r = parseInt(n.slice(0, 2), 16);
  const g = parseInt(n.slice(2, 4), 16);
  const b = parseInt(n.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 < 90;
}
