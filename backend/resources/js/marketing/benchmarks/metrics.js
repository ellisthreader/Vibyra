// Metric definitions and the small amount of maths the charts share.
// Every chart reads models through these so a value is formatted one way.
import { LABELS } from "./data.js";
import { efficientCoder, taskMoney } from "./costPerformance.js";

export const blended = (m) =>
    m.blended ?? (m.priceIn != null && m.priceOut != null ? (3 * m.priceIn + m.priceOut) / 4 : null);

const money = (v) => `$${v >= 10 ? v.toFixed(0) : v.toFixed(2).replace(/\.00$/, "")}`;

export const METRICS = {
    intelligence: {
        label: LABELS.intelligence.label ?? "Intelligence",
        title: LABELS.intelligence.title,
        get: (m) => m.intelligence,
        fmt: (v) => v.toFixed(LABELS.intelligence.label === "Vibyra Score" ? 1 : 0),
        better: "high",
        note: LABELS.intelligence.note,
    },
    coding: {
        label: "Coding",
        title: LABELS.coding.title,
        get: (m) => m.coding,
        fmt: (v) => v.toFixed(0),
        better: "high",
        note: LABELS.coding.note,
    },
    price: {
        label: "Price",
        title: "Price per 1M tokens",
        get: blended,
        fmt: money,
        better: "low",
        note: "USD per million tokens, blended 3 input : 1 output. Lower is better.",
    },
    speed: {
        label: "Speed",
        title: "Output speed",
        get: (m) => m.speed,
        fmt: (v) => `${Math.round(v)} t/s`,
        approx: (m) => m.approx?.includes("speed"),
        better: "high",
        note: "Median output tokens per second through the first-party API. Higher is better.",
    },
    taskCost: {
        label: "Coding task cost", title: "AA coding USD / task",
        get: (m) => m.boards?.["aa-coding-agent"]?.costPerTask ?? null,
        fmt: taskMoney, better: "low",
        note: "Published mean API cost per AA coding-agent task attempt, including caching and fallback attempts.",
    },
};

export const METRIC_ORDER = ["intelligence", "coding", "price", "speed"];

// Best first; models with no value for the metric are left out, not ranked last.
export function ranked(models, metricId) {
    const metric = METRICS[metricId];
    return models
        .filter((m) => metric.get(m) != null)
        .sort((a, b) => (metric.better === "high" ? metric.get(b) - metric.get(a) : metric.get(a) - metric.get(b)));
}

// Models no other model beats on both axes at once: the "you can't do better" line.
export function frontier(models, xMetric, yMetric) {
    const x = METRICS[xMetric];
    const y = METRICS[yMetric];
    const xBetter = (a, b) => (x.better === "low" ? x.get(a) <= x.get(b) : x.get(a) >= x.get(b));
    const points = models.filter((m) => x.get(m) != null && y.get(m) != null);
    return points
        .filter((m) => !points.some((o) => o !== m && xBetter(o, m) && y.get(o) >= y.get(m)
            && (x.get(o) !== x.get(m) || y.get(o) !== y.get(m))))
        .sort((a, b) => x.get(a) - x.get(b));
}

// The four answers most visitors came for.
export function topPicks(models) {
    const best = (id) => ranked(models, id)[0];
    const smartest = best("intelligence");
    const value = efficientCoder(models)?.model;
    return [
        { id: "smartest", label: "Smartest overall", model: smartest, metric: "intelligence",
            line: LABELS.pickSmartest },
        { id: "coder", label: "Best for coding", model: best("coding"), metric: "coding",
            line: best("coding")?.codingAgent ? `${LABELS.pickCoder.replace(/\.$/, "")}, running in ${best("coding").codingAgent.split(" + ")[0]}.` : LABELS.pickCoder },
        { id: "value", label: "Efficient coder", model: value, metric: "taskCost",
            line: "Lowest published cost per AA coding-agent task within 5 index points of the displayed performance leader." },
        { id: "fastest", label: "Fastest", model: best("speed"), metric: "speed",
            line: "Most output tokens per second." },
    ];
}

export const logoPath = (provider) => `/media/marketing/providers/${provider.logo}.svg`;

export const tidyNumber = (v) => (v >= 1e6 ? `${+(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${Math.round(v / 1e3)}K` : `${v}`);

// A value as the page prints it; "~" marks a figure the source only approximates.
export function display(id, m) {
    const metric = METRICS[id];
    const v = metric.get(m);
    return v == null ? "–" : `${metric.approx?.(m) ? "~" : ""}${metric.fmt(v)}`;
}

export const scoreFmt = (b) => (v) => (b.unit === "Elo" || b.unit === "score" ? `${Math.round(v)}` : `${+v.toFixed(1)}`);
