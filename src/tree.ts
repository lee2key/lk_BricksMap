export type BrickNode = {
  id: string;
  title: string;
  color: string;
  children: BrickNode[];
};

export type PlacedBrick = {
  id: string;
  title: string;
  color: string;
  x: number;
  y: number;
  width: number;
  height: number;
  depth: number;
};

export const NODE_HEIGHT = 44;
export const MIN_WIDTH = 128;
export const H_GAP = 8;
export const V_GAP = 10;

const PALETTE = [
  "#7BC67E",
  "#4DA6E8",
  "#9B6BDB",
  "#F5A04A",
  "#5EC8C5",
  "#E8789A",
  "#8B9AE0",
];

const SWATCH_HUES = ["#F44336", "#F88917", "#F2C500", "#69BA32", "#16AF84", "#10BACA", "#2485F5", "#554BDE", "#A544DB", "#E43D9A"];

export const COLOR_ROWS = [
  ...[0, 0.18, 0.36, 0.54, 0.72, 0.87].map((fade) =>
    SWATCH_HUES.map((hue) => mixHex(hue, "#ffffff", fade)),
  ),
  Array.from({ length: SWATCH_HUES.length }, (_, column) =>
    mixHex("#000000", "#ffffff", column / (SWATCH_HUES.length - 1)),
  ),
];

function uid() {
  return crypto.randomUUID();
}

function mixHex(hex: string, withColor: string, amount: number) {
  const a = hexToRgb(hex);
  const b = hexToRgb(withColor);
  const t = amount;
  const r = Math.round(a.r + (b.r - a.r) * t);
  const g = Math.round(a.g + (b.g - a.g) * t);
  const bl = Math.round(a.b + (b.b - a.b) * t);
  return rgbToHex(r, g, bl);
}

function hexToRgb(hex: string) {
  const n = hex.replace("#", "");
  return {
    r: parseInt(n.slice(0, 2), 16),
    g: parseInt(n.slice(2, 4), 16),
    b: parseInt(n.slice(4, 6), 16),
  };
}

function rgbToHex(r: number, g: number, b: number) {
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

export function childColor(parentColor: string, siblingIndex: number, depth: number) {
  if (depth === 0) return PALETTE[siblingIndex % PALETTE.length];
  const toward = siblingIndex % 2 === 0 ? "#ffffff" : "#dce8f5";
  return mixHex(parentColor, toward, Math.min(0.22 + depth * 0.08, 0.55));
}

export function createNode(title: string, color: string, children: BrickNode[] = []): BrickNode {
  return { id: uid(), title, color, children };
}

export function cloneTree(node: BrickNode): BrickNode {
  return {
    ...node,
    children: node.children.map(cloneTree),
  };
}

export function findParent(node: BrickNode, id: string): BrickNode | null {
  for (const child of node.children) {
    if (child.id === id) return node;
    const found = findParent(child, id);
    if (found) return found;
  }
  return null;
}

export function mapTree(node: BrickNode, fn: (n: BrickNode, depth: number) => BrickNode, depth = 0): BrickNode {
  const next = fn(node, depth);
  return {
    ...next,
    children: next.children.map((c) => mapTree(c, fn, depth + 1)),
  };
}

export function addChildren(root: BrickNode, parentIds: ReadonlySet<string>) {
  const added = new Map<string, string>();
  const tree = mapTree(root, (parent, depth) => {
    if (!parentIds.has(parent.id)) return parent;
    const color = childColor(parent.color, parent.children.length, depth);
    const child = createNode("New", color);
    added.set(parent.id, child.id);
    return { ...parent, children: [...parent.children, child] };
  });
  return { tree, added };
}

export function renameAndAddSibling(root: BrickNode, id: string, title: string) {
  const tree = cloneTree(root);
  const parent = findParent(tree, id);
  if (!parent) return null;
  const index = parent.children.findIndex((child) => child.id === id);
  parent.children[index].title = title;
  const depth = nodeDepth(tree, parent.id);
  const sibling = createNode("New", childColor(parent.color, index + 1, depth));
  parent.children.splice(index + 1, 0, sibling);
  return { tree, newId: sibling.id };
}

export function renameNodes(root: BrickNode, ids: ReadonlySet<string>, title: string): BrickNode {
  return mapTree(root, (node) => (ids.has(node.id) ? { ...node, title } : node));
}

export function removeNode(root: BrickNode, id: string): BrickNode {
  if (root.id === id) return root;
  return {
    ...root,
    children: root.children
      .filter((c) => c.id !== id)
      .map((c) => removeNode(c, id)),
  };
}

export function recolorNodes(root: BrickNode, ids: ReadonlySet<string>, color: string): BrickNode {
  return mapTree(root, (node) => (ids.has(node.id) ? { ...node, color } : node));
}

function nodeDepth(root: BrickNode, id: string, depth = 0): number {
  if (root.id === id) return depth;
  for (const child of root.children) {
    const d = nodeDepth(child, id, depth + 1);
    if (d >= 0) return d;
  }
  return -1;
}

let measureCanvas: HTMLCanvasElement | null = null;

function measureTextWidth(title: string) {
  measureCanvas ??= document.createElement("canvas");
  const ctx = measureCanvas.getContext("2d");
  if (!ctx) return title.length * 8;
  ctx.font = '400 15px "Roboto Flex", system-ui, sans-serif';
  return ctx.measureText(title || "New").width;
}

export type TreeDirection = "down" | "right";

type Sized = { span: number; children: Sized[] };

export function layoutTree(root: BrickNode, direction: TreeDirection = "down"): PlacedBrick[] {
  const placed: PlacedBrick[] = [];
  const columnWidths: number[] = [];
  const sideways = direction === "right";
  const gap = sideways ? V_GAP : H_GAP;

  const measure = (node: BrickNode, depth: number): Sized => {
    const labelWidth = Math.max(MIN_WIDTH, Math.ceil(measureTextWidth(node.title) + 36));
    if (sideways) columnWidths[depth] = Math.max(columnWidths[depth] ?? 0, labelWidth);
    const children = node.children.map((child) => measure(child, depth + 1));
    const childrenSpan = children.reduce((sum, child) => sum + child.span, 0) + gap * Math.max(0, children.length - 1);
    return { span: Math.max(sideways ? NODE_HEIGHT : labelWidth, childrenSpan), children };
  };

  const walk = (node: BrickNode, size: Sized, along: number, across: number, depth: number, span = size.span) => {
    const width = sideways ? columnWidths[depth] : span;
    const height = sideways ? span : NODE_HEIGHT;
    placed.push({
      id: node.id, title: node.title, color: node.color,
      x: sideways ? along : across,
      y: sideways ? across : along,
      width, height, depth,
    });
    if (node.children.length === 0) return;

    const nextAlong = along + (sideways ? width + H_GAP : height + V_GAP);
    if (node.children.length === 1) {
      walk(node.children[0], size.children[0], nextAlong, across, depth + 1, span);
      return;
    }

    const childrenSpan = size.children.reduce((sum, child) => sum + child.span, 0) + gap * (node.children.length - 1);
    let nextAcross = across + (span - childrenSpan) / 2;
    node.children.forEach((child, index) => {
      const childSize = size.children[index];
      walk(child, childSize, nextAlong, nextAcross, depth + 1);
      nextAcross += childSize.span + gap;
    });
  };

  walk(root, measure(root, 0), 0, 0, 0);
  return placed;
}

export function blankTree(): BrickNode {
  return createNode("Root", "#F5A04A");
}
