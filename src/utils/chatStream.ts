export const TYPING_CURSOR = "▍";

export function streamChatText(
  fullText: string,
  onUpdate: (text: string, done: boolean) => void
): () => void {
  const text = fullText ?? "";
  if (!text) {
    onUpdate("", true);
    return () => {};
  }
  const chunks = text.match(/\S+\s*|\s+/g) ?? [text];
  let index = 0;
  let cancelled = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const tick = () => {
    if (cancelled) return;
    index += 1;
    const done = index >= chunks.length;
    const partial = chunks.slice(0, index).join("");
    onUpdate(done ? partial : `${partial}${TYPING_CURSOR}`, done);
    if (done) return;
    timer = setTimeout(tick, 15 + Math.random() * 30);
  };
  tick();

  return () => {
    if (cancelled) return;
    cancelled = true;
    if (timer) clearTimeout(timer);
    onUpdate(text, true);
  };
}
