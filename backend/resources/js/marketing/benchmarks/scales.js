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
    f.ticks = () => {
        const ticks = [];
        for (let power = Math.floor(l0); power <= Math.ceil(l1); power++) {
            for (const multiplier of [1, 3]) {
                const value = multiplier * 10 ** power;
                if (value >= d0 && value <= d1) ticks.push(value);
            }
        }
        const stride = Math.max(1, Math.ceil(ticks.length / 7));
        return ticks.filter((_, i) => i % stride === 0);
    };
    return f;
}

function niceStep(raw) {
    const power = 10 ** Math.floor(Math.log10(raw));
    const n = raw / power;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * power;
}

export const pad = ([lo, hi], share = 0.08) => [lo - (hi - lo) * share, hi + (hi - lo) * share];
export const padLog = ([lo, hi]) => [lo / 1.6, hi * 1.6];
