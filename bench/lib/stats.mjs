// Scores are means over tasks; uncertainty is a bootstrap over tasks, so a
// small suite shows a wide interval instead of a falsely precise rank.
export const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export function median(xs) {
    const s = xs.filter((x) => x != null).sort((a, b) => a - b);
    if (!s.length) return null;
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// Seeded so the same results always print the same interval.
function rng(seed) {
    let s = seed >>> 0;
    return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

export function bootstrap(scores, { rounds = 2000, seed = 7 } = {}) {
    if (!scores.length) return null;
    const rand = rng(seed);
    const means = [];
    for (let r = 0; r < rounds; r++) {
        let sum = 0;
        for (let i = 0; i < scores.length; i++) sum += scores[Math.floor(rand() * scores.length)];
        means.push(sum / scores.length);
    }
    means.sort((a, b) => a - b);
    return { mean: mean(scores), low: means[Math.floor(rounds * 0.025)], high: means[Math.ceil(rounds * 0.975) - 1] };
}

// The index interval resamples tasks inside every suite at once and averages
// the suite means, which is narrower (and correct) versus averaging suite bounds.
export function bootstrapIndex(suiteScores, { rounds = 2000, seed = 11 } = {}) {
    if (!suiteScores.length || suiteScores.some((s) => !s.length)) return null;
    const rand = rng(seed);
    const values = [];
    for (let r = 0; r < rounds; r++) {
        let total = 0;
        for (const scores of suiteScores) {
            let sum = 0;
            for (let i = 0; i < scores.length; i++) sum += scores[Math.floor(rand() * scores.length)];
            total += sum / scores.length;
        }
        values.push(total / suiteScores.length);
    }
    values.sort((a, b) => a - b);
    return { low: values[Math.floor(rounds * 0.025)], high: values[Math.ceil(rounds * 0.975) - 1] };
}

// Two models are tied when their intervals overlap; the page says so instead of ranking.
export const tied = (a, b) => a && b && a.low <= b.high && b.low <= a.high;
