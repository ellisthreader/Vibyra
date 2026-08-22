export function recommendedPlatform(navigatorObject = window.navigator) {
  const value = [
    navigatorObject.userAgentData?.platform,
    navigatorObject.platform,
    navigatorObject.userAgent,
  ].filter(Boolean).join(" ").toLowerCase();
  if (value.includes("win")) return "windows";
  const looksLikeIos = /iphone|ipad|ipod/.test(value)
    || (String(navigatorObject.platform).toLowerCase() === "macintel" && Number(navigatorObject.maxTouchPoints) > 1);
  if (value.includes("mac") && !looksLikeIos) return "macos";
  if (value.includes("linux") && !value.includes("android")) return "linux";
  return null;
}

export function formatBytes(bytes) {
  const value = Number(bytes ?? 0);
  if (!Number.isFinite(value) || value <= 0) return "";
  const megabytes = value / (1024 * 1024);
  return `${megabytes >= 100 ? Math.round(megabytes) : megabytes.toFixed(1)} MB`;
}
