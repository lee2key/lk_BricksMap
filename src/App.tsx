import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

export default function App() {
  const [tree, setTree] = useState<BrickNode>(loadTree);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [hoverPlusId, setHoverPlusId] = useState<string | null>(null);
  const [camera, setCamera] = useState({ x: 80, y: 90, scale: 1 });
  const [spaceDown, setSpaceDown] = useState(false);

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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
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
      if (e.type === "keydown" && (e.key === "Delete" || e.key === "Backspace")) {
        const t = e.target as HTMLElement;
        if (t.tagName === "INPUT" || t.isContentEditable) return;
        if (selectedId && selectedId !== tree.id) {
          e.preventDefault();
          setTree((prev) => removeNode(prev, selectedId));
          setSelectedId(null);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
    };
  }, [selectedId, tree.id]);

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
    if (onEmpty && !spaceDown) setSelectedId(null);
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
    setSelectedId(newId);
    setEditingId(newId);
    setHoverPlusId(null);
  };

  const selected = placed.find((p) => p.id === selectedId);

  return (
    <div className="app">
      <header className="toolbar">
        <div className="brand">
          <span className="logo" />
          Bricks Map
        </div>
        <div className="toolbar-actions">
          <button
            type="button"
            onClick={() => {
              setTree(blankTree());
              setSelectedId(null);
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
              setSelectedId(null);
              setEditingId(null);
              setCamera({ x: 80, y: 90, scale: 1 });
            }}
          >
            Load example
          </button>
        </div>
        <p className="hint">
          Hover the bottom of a brick for <b>+</b> · double-click to rename · Delete to remove · drag canvas or hold Space to pan · scroll to zoom
        </p>
      </header>

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
              selected={brick.id === selectedId}
              editing={brick.id === editingId}
              showPlus={hoverPlusId === brick.id}
              onSelect={() => setSelectedId(brick.id)}
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
  onSelect: () => void;
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
        onSelect();
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
