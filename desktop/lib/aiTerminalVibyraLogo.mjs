const STATIC_PALETTE = {
  left: "38;2;123;44;255",
  right: "38;2;255;53;200",
  depth: "38;2;255;184;77",
  label: "38;2;183;148;255"
};

const MOTION_PALETTES = [
  STATIC_PALETTE,
  { left: "38;2;139;65;255", right: "38;2;255;73;209", depth: "38;2;255;196;104", label: "38;2;201;178;255" },
  { left: "38;2;157;91;255", right: "38;2;255;96;220", depth: "38;2;255;211;132", label: "38;2;218;202;255" },
  { left: "38;2;139;65;255", right: "38;2;255;73;209", depth: "38;2;255;196;104", label: "38;2;201;178;255" }
];

const WAVE_COLORS = [
  "38;2;123;44;255",
  "38;2;155;69;255",
  "38;2;205;91;255",
  "38;2;255;53;200",
  "38;2;255;128;221",
  "38;2;255;226;250",
  "38;2;255;184;77"
];

const FACE_ROWS = [
  { inset: 0, left: "#####\\", gap: 16, right: "/#####" },
  { inset: 1, left: "#####\\", gap: 14, right: "/#####" },
  { inset: 2, left: "#####\\", gap: 12, right: "/#####" },
  { inset: 3, left: "#####\\", gap: 10, right: "/#####" },
  { inset: 4, left: "#####\\", gap: 8, right: "/#####" },
  { inset: 5, left: "#####\\", gap: 6, right: "/#####" },
  { inset: 6, left: "#####\\", gap: 4, right: "/#####" },
  { inset: 7, left: "#####\\", gap: 2, right: "/#####" },
  { inset: 8, left: "#####\\", gap: 0, right: "/#####" },
  { inset: 9, face: "##########" },
  { inset: 10, face: "########" },
  { inset: 11, face: "######" },
  { inset: 12, face: "####" },
  { inset: 13, face: "##" }
];

const COMPACT_ROWS = [
  { inset: 0, left: "####\\", gap: 8, right: "/####" },
  { inset: 1, left: "####\\", gap: 6, right: "/####" },
  { inset: 2, left: "####\\", gap: 4, right: "/####" },
  { inset: 3, left: "####\\", gap: 2, right: "/####" },
  { inset: 4, left: "####\\", gap: 0, right: "/####" },
  { inset: 5, face: "########" },
  { inset: 6, face: "######" },
  { inset: 7, face: "####" },
  { inset: 8, face: "##" }
];

const MICRO_ROWS = [
  { inset: 0, left: "###\\", gap: 6, right: "/###" },
  { inset: 1, left: "###\\", gap: 4, right: "/###" },
  { inset: 2, left: "###\\", gap: 2, right: "/###" },
  { inset: 3, left: "###\\", gap: 0, right: "/###" },
  { inset: 4, face: "######" },
  { inset: 5, face: "####" },
  { inset: 6, face: "##" }
];

const NANO_ROWS = [
  { inset: 0, left: "###\\", gap: 4, right: "/###" },
  { inset: 1, left: "###\\", gap: 2, right: "/###" },
  { inset: 2, left: "###\\", gap: 0, right: "/###" },
  { inset: 3, face: "######" },
  { inset: 4, face: "##" }
];

export function renderVibyraVLogo({ color = true, phase = -1, size = "full" } = {}) {
  const palette = phase < 0
    ? STATIC_PALETTE
    : MOTION_PALETTES[phase % MOTION_PALETTES.length];
  const spec = logoSpec(size);
  const rows = spec.rows.map((row, index) => {
    const face = row.face
      ? paintFace(row.face, row.inset, index, phase, palette.left, color)
      : `${paintFace(row.left, row.inset, index, phase, palette.left, color)}${" ".repeat(row.gap)}${paintFace(row.right, row.inset + row.left.length + row.gap, index, phase, palette.right, color)}`;
    const depth = index === 0
      ? " ".repeat(spec.depth.length)
      : paintDepth(spec.depth, row.inset + visibleRowWidth(row), index, phase, palette.depth, color);
    return pad(`${" ".repeat(row.inset)}${face}${depth}`, spec.width);
  });
  rows.push(pad(
    `${" ".repeat(spec.depthInset)}${paintDepth(spec.depth, spec.depthInset, spec.rows.length, phase, palette.depth, color)}`,
    spec.width
  ));
  return rows;
}

export function renderAutoDecidingFrame({
  columns = 80,
  rows = 30,
  color = true,
  phase = 0
} = {}) {
  const width = Math.max(36, Number(columns) || 80);
  const height = Number(rows) || 30;
  const size = height >= 26 ? "full" : height >= 16 ? "compact" : "nano";
  const logo = renderVibyraVLogo({ color, phase, size });
  const palette = MOTION_PALETTES[phase % MOTION_PALETTES.length];
  const title = paintSpacedTitle("VIBYRA AUTO", phase, color);
  const status = paint("<  SELECTING THE BEST MODEL  >", palette.label, color);
  const signal = paintRoutingSignal(31, phase, color);
  const content = height <= 10 ? [
    ...logo.map((line) => centerVisible(line, width)),
    centerVisible(paint("VIBYRA AUTO // SELECTING MODEL", palette.label, color), width),
    centerVisible(paintRoutingSignal(21, phase, color), width)
  ] : [
    ...logo.map((line) => centerVisible(line, width)),
    "",
    centerVisible(title, width),
    centerVisible(status, width),
    centerVisible(signal, width)
  ];
  const topPadding = Math.max(0, Math.floor((height - content.length) / 2));
  return [...Array(topPadding).fill(""), ...content];
}

function logoSpec(size) {
  if (size === "nano") {
    return { rows: NANO_ROWS, width: 19, depth: "++", depthInset: 7 };
  }
  if (size === "micro") {
    return { rows: MICRO_ROWS, width: 21, depth: "++", depthInset: 8 };
  }
  if (size === "compact") {
    return { rows: COMPACT_ROWS, width: 23, depth: "++", depthInset: 11 };
  }
  return { rows: FACE_ROWS, width: 31, depth: "+++", depthInset: 15 };
}

function pad(value, width) {
  return `${value}${" ".repeat(Math.max(0, width - visibleLength(value)))}`;
}

function visibleRowWidth(row) {
  return row.face
    ? row.face.length
    : row.left.length + row.gap + row.right.length;
}

function centerVisible(value, width) {
  const length = visibleLength(value);
  return `${" ".repeat(Math.max(0, Math.floor((width - length) / 2)))}${value}`;
}

function visibleLength(value) {
  return String(value).replace(/\x1b\[[0-9;]*m/g, "").length;
}

function paint(value, colorCode, enabled) {
  return enabled ? `\x1b[${colorCode}m${value}\x1b[0m` : value;
}

function paintFace(value, x, y, phase, fallback, enabled) {
  if (phase < 0 || !enabled) return paint(value, fallback, enabled);
  return Array.from(value)
    .map((char, index) => paint(char, waveColor(x + index, y, phase), true))
    .join("");
}

function paintDepth(value, x, y, phase, fallback, enabled) {
  if (phase < 0 || !enabled) return paint(value, fallback, enabled);
  return Array.from(value)
    .map((char, index) => paint(
      char,
      WAVE_COLORS[(phase + x + y + index) % WAVE_COLORS.length],
      true
    ))
    .join("");
}

function paintSpacedTitle(value, phase, enabled) {
  const text = Array.from(value).join(" ");
  if (!enabled) return text;
  return Array.from(text)
    .map((char, index) => char === " "
      ? char
      : paint(char, WAVE_COLORS[(phase + index) % WAVE_COLORS.length], true))
    .join("");
}

function paintRoutingSignal(width, phase, enabled) {
  const spark = phase % width;
  const text = Array.from({ length: width }, (_, index) => index === spark ? "*" : ".");
  if (!enabled) return text.join("");
  return text.map((char, index) => paint(
    char,
    index === spark ? "38;2;255;244;255" : WAVE_COLORS[(phase + index) % 4],
    true
  )).join("");
}

function waveColor(x, y, phase) {
  const coordinate = x + y * 2;
  const index = (coordinate - phase * 2) % WAVE_COLORS.length;
  return WAVE_COLORS[(index + WAVE_COLORS.length) % WAVE_COLORS.length];
}
