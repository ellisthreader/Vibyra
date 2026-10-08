import { METRICS } from "./metrics.js";

export function sourceMetric(source, metricId) {
    if (!source) return METRICS[metricId];
    return {
        title: source.name, label: source.name, better: source.higherIsBetter === false ? "low" : "high",
        get: (model) => model.boards?.[source.id]?.value ?? null,
        fmt: (value) => Number(value.toFixed(2)).toLocaleString("en-GB"),
        note: `${source.metric}. Published results for the selected effort; ${source.updated}.${source.consensus === false ? ` Reference only: ${source.consensusReason ?? "does not affect Vibyra Score"}.` : ""}`,
    };
}
export function rankRows(models, metric) {
    return models.filter((m) => metric.get(m) != null).sort((a, b) =>
        metric.better === "low" ? metric.get(a) - metric.get(b) : metric.get(b) - metric.get(a));
}
export function barWidth(value, values, better) {
    const min = Math.min(0, ...values);
    const max = Math.max(...values);
    if (min === max) return 100;
    const fraction = (value - min) / (max - min);
    return 100 * (better === "low" ? 1 - fraction : fraction);
}
