function empty(text) {
  const item = document.createElement("div");
  item.className = "empty";
  item.textContent = text;
  return item;
}

function toneColor(tone) {
  if (tone === "success") return "#22c55e";
  if (tone === "warning") return "#f59e0b";
  if (tone === "error") return "#ef4444";
  return "#3b82f6";
}
