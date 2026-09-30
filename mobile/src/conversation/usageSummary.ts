function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
export function usageSummary(value: unknown) {
  const data = object(value),
    account = object(data.account),
    thread = object(data.thread);
  const byId = object(account.rateLimitsByLimitId);
  const entries = Object.keys(byId).length ? Object.entries(byId) : [['codex', account.rateLimits]];
  const groups = entries.flatMap(([id, raw]) => {
    const limit = object(raw);
    const windows = ['primary', 'secondary'].flatMap((key) => {
      const window = object(limit[key]);
      if (typeof window.usedPercent !== 'number') return [];
      const minutes = Number(window.windowDurationMins);
      const label =
        minutes === 10080
          ? 'Weekly limit'
          : minutes === 1440
            ? 'Daily limit'
            : minutes > 0 && minutes % 60 === 0
              ? `${minutes / 60}-hour limit`
              : 'Usage limit';
      return [
        {
          label,
          used: Math.max(0, Math.min(100, window.usedPercent)),
          resetsAt: typeof window.resetsAt === 'number' ? window.resetsAt * 1000 : undefined,
        },
      ];
    });
    return windows.length
      ? [
          {
            name:
              typeof limit.limitName === 'string'
                ? limit.limitName
                : id === 'codex'
                  ? 'Codex'
                  : String(id),
            windows,
          },
        ]
      : [];
  });
  const total = object(thread.total),
    last = object(thread.last);
  const tokens = [
    ['Conversation tokens', total.totalTokens],
    ['Last turn tokens', last.totalTokens],
    ['Input tokens', total.inputTokens],
    ['Cached input', total.cachedInputTokens],
    ['Output tokens', total.outputTokens],
  ].flatMap(([label, value]) =>
    typeof value === 'number' ? [{ label: String(label), value: value.toLocaleString() }] : [],
  );
  return {
    groups,
    tokens,
    note: typeof data.unavailable === 'string' ? data.unavailable : '',
    observedAt: typeof data.observedAt === 'string' ? data.observedAt : undefined,
  };
}
export function relativeChangePath(path: string, root?: string | null) {
  return root && path.startsWith(`${root}/`) ? path.slice(root.length + 1) : path;
}
