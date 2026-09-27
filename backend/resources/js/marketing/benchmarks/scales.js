// Tiny scale helpers; a log axis for price because prices span 100×.
export function linear([d0, d1], [r0, r1]) {
    const f = (v) => r0 + ((v - d0) / (d1 - d0)) * (r1 - r0);
    f.ticks = (count = 5) => {
        const step = niceStep((d1 - d0) / count);
        const out = [];
        for (let v = Math.ceil(d0 / step) * step; v <= d1 + 1e-9; v += step) out.push(+v.toFixed(6));
        return out;
    };
    return f;
}

export function log([d0, d1], [r0, r1]) {
    const l0 = Math.log10(d0);
    const l1 = Math.log10(d1);
    const f = (v) => r0 + ((Math.log10(v) - l0) / (l1 - l0)) * (r1 - r0);
    f.ticks = () => [0.03, 0.1, 0.3, 1, 3, 10, 30, 100].filter((v) => v >= d0 && v <= d1);
    return f;
}

function niceStep(raw) {
    const power = 10 ** Math.floor(Math.log10(raw));
    const n = raw / power;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * power;
}

export const pad = ([lo, hi], share = 0.08) => [lo - (hi - lo) * share, hi + (hi - lo) * share];
export const padLog = ([lo, hi]) => [lo / 1.6, hi * 1.6];
