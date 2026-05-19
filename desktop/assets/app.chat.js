async function requestDesktopChat(payload) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 130000);
  try {
    const response = await fetch("/desktop/chat", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.ok === false) {
      throw new Error(result.error || result.message || "Vibyra AI could not complete this chat.");
    }
    return result;
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("Vibyra AI chat timed out. Try a smaller request or retry.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
