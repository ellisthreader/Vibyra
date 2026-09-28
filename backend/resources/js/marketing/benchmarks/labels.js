// Greedy label placement: try right of the dot, then left; skip a label that
// would cover another label or dot (the tooltip and table still carry it).
export default function placeLabels(candidates, width, dots = []) {
    const placed = [];
    const marks = dots.map((d) => ({ id: d.id, x0: d.cx - 8, x1: d.cx + 8, y0: d.cy - 8, y1: d.cy + 8 }));
    const hit = (a, b) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
    const overlaps = (a, id) => placed.some((b) => hit(a, b)) || marks.some((m) => m.id !== id && hit(a, m));
    for (const c of candidates) {
        const w = c.text.length * 6.9 + 6;
        const sides = [
            { x0: c.cx + 10, x1: c.cx + 10 + w, anchor: "start" },
            { x0: c.cx - 10 - w, x1: c.cx - 10, anchor: "end" },
        ].filter((s) => s.x0 > 0 && s.x1 < width);
        const box = sides.map((s) => ({ ...s, y0: c.cy - 9, y1: c.cy + 9 })).find((s) => !overlaps(s, c.id));
        if (box) placed.push({ ...box, id: c.id, x: box.anchor === "start" ? box.x0 : box.x1 });
    }
    return new Map(placed.map((p) => [p.id, p]));
}
