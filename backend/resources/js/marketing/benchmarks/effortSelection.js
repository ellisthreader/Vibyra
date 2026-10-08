export const EFFORT_LABELS = {
    none: "No reasoning", low: "Low", medium: "Medium", high: "High", xhigh: "Xhigh", max: "Max",
    default: "Default", unspecified: "Effort unreported",
};
export const effortLabel = (model) => EFFORT_LABELS[model.effort] ?? "";
export const modelLabel = (model) => `${model.name}${model.effort ? ` · ${effortLabel(model)}` : ""}`;
export function selectEffort(models, effort) {
    if (effort === "all") return models;
    if (effort === "highest") return models.filter((m) => m.highest ?? true);
    return models.filter((m) => m.effort === effort);
}
