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

export function findNode(node: BrickNode, id: string): BrickNode | null {
  if (node.id === id) return node;
  for (const child of node.children) {
    const found = findNode(child, id);
    if (found) return found;
  }
  return null;
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

export function addChild(root: BrickNode, parentId: string): { tree: BrickNode; newId: string } {
  const tree = cloneTree(root);
  const parent = findNode(tree, parentId);
  if (!parent) return { tree, newId: "" };
  const depth = nodeDepth(tree, parentId);
  const color = childColor(parent.color, parent.children.length, depth);
  const child = createNode("New", color);
  parent.children = [...parent.children, child];
  return { tree, newId: child.id };
}

export function renameNode(root: BrickNode, id: string, title: string): BrickNode {
  return mapTree(root, (n) => (n.id === id ? { ...n, title } : n));
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

export function recolorNode(root: BrickNode, id: string, color: string): BrickNode {
  return mapTree(root, (n) => (n.id === id ? { ...n, color } : n));
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
  ctx.font = '700 15px "Plus Jakarta Sans", system-ui, sans-serif';
  return ctx.measureText(title || "New").width;
}

type Sized = { width: number; subtreeHeight: number };

function measure(node: BrickNode): Sized {
  const labelW = Math.ceil(measureTextWidth(node.title) + 36);
  if (node.children.length === 0) {
    return { width: Math.max(MIN_WIDTH, labelW), subtreeHeight: NODE_HEIGHT };
  }
  const kids = node.children.map(measure);
  const kidsW = kids.reduce((s, k) => s + k.width, 0) + H_GAP * (node.children.length - 1);
  return {
    width: Math.max(MIN_WIDTH, labelW, kidsW),
    subtreeHeight: NODE_HEIGHT + V_GAP + Math.max(...kids.map((k) => k.subtreeHeight)),
  };
}

export function layoutTree(root: BrickNode, originX = 0, originY = 0): PlacedBrick[] {
  const placed: PlacedBrick[] = [];

  const walk = (node: BrickNode, x: number, y: number, depth: number): Sized => {
    const size = measure(node);
    placed.push({
      id: node.id,
      title: node.title,
      color: node.color,
      x,
      y,
      width: size.width,
      height: NODE_HEIGHT,
      depth,
    });

    if (node.children.length === 0) return size;

    const kidSizes = node.children.map(measure);
    const kidsW = kidSizes.reduce((s, k) => s + k.width, 0) + H_GAP * (node.children.length - 1);
    let cx = x + Math.max(0, (size.width - kidsW) / 2);
    const cy = y + NODE_HEIGHT + V_GAP;
    node.children.forEach((child, i) => {
      walk(child, cx, cy, depth + 1);
      cx += kidSizes[i].width + H_GAP;
    });
    return size;
  };

  walk(root, originX, originY, 0);
  return placed;
}

export function exampleTree(): BrickNode {
  const characters = createNode("Characters", "#C8E6C4", [
    createNode("Body", "#2A2A2A"),
    createNode("Face", "#2A2A2A"),
    createNode("Hands", "#2A2A2A"),
    createNode("Clothes", "#2A2A2A"),
  ]);
  const crowd = createNode("Crowd", "#C8E6C4");
  const animation = createNode("Animation", "#7BC67E", [characters, crowd]);

  const rbd = createNode("RBD", "#B9DFF7");
  const velum = createNode("Velum", "#B9DFF7", [
    createNode("Deformation", "#9FD0F0"),
    createNode("Veg", "#9FD0F0"),
    createNode("Clothes", "#9FD0F0"),
    createNode("Fur", "#9FD0F0"),
    createNode("Muscle", "#9FD0F0"),
    createNode("Hair", "#9FD0F0"),
  ]);
  const fluids = createNode("Fluids", "#B9DFF7");
  const particles = createNode("Particles", "#B9DFF7", [
    createNode("Dust", "#2A2A2A"),
    createNode("Debris", "#2A2A2A"),
    createNode("Sparks", "#2A2A2A"),
    createNode("Magic", "#2A2A2A"),
  ]);
  const grains = createNode("Grains", "#B9DFF7");
  const volume = createNode("Volume", "#B9DFF7", [
    createNode("Fire", "#D6EEFB"),
    createNode("Steam", "#D6EEFB"),
    createNode("Smoke", "#D6EEFB"),
    createNode("Clouds", "#D6EEFB"),
    createNode("VDB", "#D6EEFB"),
  ]);
  const simulations = createNode("Simulations", "#4DA6E8", [
    rbd,
    velum,
    fluids,
    particles,
    grains,
    volume,
  ]);

  const other = createNode("Other", "#9B6BDB", [
    createNode("Modeling", "#C9B3F0"),
    createNode("PDD", "#C9B3F0"),
  ]);

  return createNode("HOUDINI", "#F5A04A", [animation, simulations, other]);
}

export function blankTree(): BrickNode {
  return createNode("Root", "#F5A04A");
}
