import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import {
  addChild,
  blankTree,
  BrickNode,
  exampleTree,
  layoutTree,
  PlacedBrick,
  recolorNode,
  removeNode,
  renameNode,
} from "./tree";

const STORAGE_KEY = "bricks-map-tree-v1";
const COLORS = ["#F5A04A", "#7BC67E", "#4DA6E8", "#9B6BDB", "#5EC8C5", "#E8789A", "#2A2A2A", "#9FD0F0"];

function loadTree(): BrickNode {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as BrickNode;
  } catch {
    /* ignore */
  }
  return exampleTree();
}

type BoardAction = { type: "change"; value: BrickNode | ((tree: BrickNode) => BrickNode) } | { type: "undo" };

function boardReducer(state: { tree: BrickNode; past: BrickNode[] }, action: BoardAction) {
  if (action.type === "undo") {
    if (!state.past.length) return state;
    return { tree: state.past[state.past.length - 1], past: state.past.slice(0, -1) };
  }
  const tree = typeof action.value === "function" ? action.value(state.tree) : action.value;
  if (JSON.stringify(tree) === JSON.stringify(state.tree)) return state;
  return { tree, past: [...state.past, state.tree].slice(-30) };
}

export default function App() {
  const [{ tree }, dispatch] = useReducer(boardReducer, undefined, () => ({ tree: loadTree(), past: [] }));
  const setTree = (value: BrickNode | ((tree: BrickNode) => BrickNode)) => dispatch({ type: "change", value });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [hoverPlusId, setHoverPlusId] = useState<string | null>(null);
  const [camera, setCamera] = useState({ x: 80, y: 90, scale: 1 });
  const [spaceDown, setSpaceDown] = useState(false);

  const importRef = useRef<HTMLInputElement>(null);
  const [fileError, setFileError] = useState("");
  const boardRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    dragging: boolean;
    px: number;
    py: number;
    cx: number;
    cy: number;
  }>({ dragging: false, px: 0, py: 0, cx: 0, cy: 0 });

  const placed = useMemo(() => layoutTree(tree), [tree]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tree));
  }, [tree]);

  const fitAll = useCallback(() => {
    const rect = boardRef.current?.getBoundingClientRect();
    if (!rect || !placed.length || !rect.width || !rect.height) return;
    const left = Math.min(...placed.map((b) => b.x));
    const top = Math.min(...placed.map((b) => b.y));
    const width = Math.max(...placed.map((b) => b.x + b.width)) - left;
    const height = Math.max(...placed.map((b) => b.y + b.height)) - top;
    const scale = Math.min(1, Math.max(1, rect.width - 80) / width, Math.max(1, rect.height - 80) / height);
    dragRef.current.dragging = false;
    setCamera({ scale, x: (rect.width - width * scale) / 2 - left * scale, y: (rect.height - height * scale) / 2 - top * scale });
  }, [placed]);

  useEffect(() => {
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
      if (e.code === "Space") {
        if (e.type === "keydown") {
          if (e.repeat) return;
          const t = e.target as HTMLElement;
          if (t.tagName === "INPUT" || t.tagName === "TEXTAREA") return;
          e.preventDefault();
          setSpaceDown(true);
        } else {
          setSpaceDown(false);
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
    window.addEventListener("keyup", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
    };
  }, [selectedIds, tree.id, fitAll]);

  const onWheel = useCallback((e: React.WheelEvent) => {
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
  }, []);

  const onPointerDownBoard = (e: React.PointerEvent) => {
    if (e.button !== 0 && e.button !== 1) return;
    const onEmpty = e.target === e.currentTarget || (e.target as HTMLElement).dataset.world === "1";
    if (!onEmpty && !spaceDown && e.button !== 1) return;
    dragRef.current = {
      dragging: true,
      px: e.clientX,
      py: e.clientY,
      cx: camera.x,
      cy: camera.y,
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    if (onEmpty && !spaceDown) setSelectedIds(new Set());
  };

  const onPointerMoveBoard = (e: React.PointerEvent) => {
    if (!dragRef.current.dragging) return;
    const dx = e.clientX - dragRef.current.px;
    const dy = e.clientY - dragRef.current.py;
    setCamera({
      ...camera,
      x: dragRef.current.cx + dx,
      y: dragRef.current.cy + dy,
    });
  };

  const onPointerUpBoard = () => {
    dragRef.current.dragging = false;
  };

  const handleAdd = (id: string) => {
    const { tree: next, newId } = addChild(tree, id);
    setTree(next);
    setSelectedIds(new Set([newId]));
    setEditingId(newId);
    setHoverPlusId(null);
  };

  const exportBoard = () => {
    const blob = new Blob([JSON.stringify({ format: "bricks-map", version: 1, tree }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "bricks-map.json";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const importBoard = async (file: File) => {
    setFileError("");
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error("File is too large (maximum 5 MB).");
      const data = JSON.parse(await file.text());
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
      const next = validate(data.tree);
      setTree(next);
      setSelectedIds(new Set());
      setEditingId(null);
      setHoverPlusId(null);
      setCamera({ x: 80, y: 90, scale: 1 });
    } catch (error) {
      setFileError(error instanceof SyntaxError ? "Invalid JSON file." : error instanceof Error ? error.message : "Could not read the board file.");
    }
  };

  const selected = selectedIds.size === 1 ? placed.find((p) => selectedIds.has(p.id)) : undefined;

  return (
    <div className="app">
      <header className="toolbar">
        <div className="brand">
          <span className="logo" />
          lk Bricks
        </div>
        <div className="toolbar-actions">
          <button type="button" onClick={exportBoard}>Export</button>
          <button type="button" onClick={() => importRef.current?.click()} title="Replace the current board from a file">Import</button>
          <input ref={importRef} type="file" accept=".json,application/json" hidden onChange={(e) => {
            const file = e.currentTarget.files?.[0];
            e.currentTarget.value = "";
            if (file) void importBoard(file);
          }} />
          <button
            type="button"
            onClick={() => {
              setTree(blankTree());
              setSelectedIds(new Set());
              setEditingId(null);
              setCamera({ x: 80, y: 90, scale: 1 });
            }}
          >
            New map
          </button>
          <button
            type="button"
            onClick={() => {
              setTree(exampleTree());
              setSelectedIds(new Set());
              setEditingId(null);
              setCamera({ x: 80, y: 90, scale: 1 });
            }}
          >
            Load example
          </button>
        </div>

      </header>
      {fileError && <div role="alert" className="file-error">{fileError}</div>}

      <div
        ref={boardRef}
        className={`board ${spaceDown ? "panning" : ""}`}
        onWheel={onWheel}
        onPointerDown={onPointerDownBoard}
        onPointerMove={onPointerMoveBoard}
        onPointerUp={onPointerUpBoard}
        onPointerCancel={onPointerUpBoard}
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
              onSelect={(toggle) => setSelectedIds((prev) => {
                if (!toggle) return new Set([brick.id]);
                const next = new Set(prev);
                if (next.has(brick.id)) next.delete(brick.id);
                else next.add(brick.id);
                return next;
              })}
              onEdit={() => setEditingId(brick.id)}
              onRename={(title) => {
                setTree((prev) => renameNode(prev, brick.id, title));
                setEditingId(null);
              }}
              onPlusEnter={() => setHoverPlusId(brick.id)}
              onPlusLeave={() => setHoverPlusId((id) => (id === brick.id ? null : id))}
              onAdd={() => handleAdd(brick.id)}
            />
          ))}
        </div>
      </div>

      <footer className="statusbar">
        <p className="hint">
          Hover the bottom of a brick for <b>+</b> · double-click to rename · Shift + click to select multiple · X / Delete to remove · drag canvas or hold Space to pan · scroll to zoom · F to fit all · Ctrl+Z to undo
        </p>
        <button type="button" className="fit-all" onClick={fitAll} title="Fit All (F)" aria-label="Fit All (F)">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M8 3H3v5M16 3h5v5M21 16v5h-5M8 21H3v-5" />
          </svg>
        </button>
      </footer>

      {selected && (
        <aside className="inspector">
          <label>
            Color
            <div className="swatches">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={c.toLowerCase() === selected.color.toLowerCase() ? "swatch on" : "swatch"}
                  style={{ background: c }}
                  onClick={() => setTree((prev) => recolorNode(prev, selected.id, c))}
                  aria-label={c}
                />
              ))}
            </div>
          </label>
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
  onSelect,
  onEdit,
  onRename,
  onPlusEnter,
  onPlusLeave,
  onAdd,
}: {
  brick: PlacedBrick;
  selected: boolean;
  editing: boolean;
  showPlus: boolean;
  onSelect: (toggle: boolean) => void;
  onEdit: () => void;
  onRename: (title: string) => void;
  onPlusEnter: () => void;
  onPlusLeave: () => void;
  onAdd: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const dark = isDark(brick.color);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
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
      onPointerDown={(e) => {
        e.stopPropagation();
        if (e.button === 0) onSelect(e.shiftKey);
      }}
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
          onPointerDown={(e) => e.stopPropagation()}
          onBlur={(e) => onRename(e.currentTarget.value.trim() || "New")}
          onKeyDown={(e) => {
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
        onPointerDown={(e) => e.stopPropagation()}
      />

      {(showPlus || selected) && (
        <button
          type="button"
          className="plus"
          title="Add brick underneath"
          onPointerEnter={onPlusEnter}
          onPointerLeave={onPlusLeave}
          onPointerDown={(e) => e.stopPropagation()}
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
