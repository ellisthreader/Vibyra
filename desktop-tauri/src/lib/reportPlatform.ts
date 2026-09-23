/** Use the OS name in reports; WebKit often exposes "Macintosh" or "X11". */
export function reportPlatform(userAgent: string, navigatorPlatform: string): string {
  const system = `${userAgent} ${navigatorPlatform}`;
  if (/Windows|Win32|Win64/i.test(system)) return "Windows";
  if (/Macintosh|Mac OS|MacIntel|MacPPC/i.test(system)) return "macOS";
  if (/Linux|X11/i.test(system)) return "Linux";
  return navigatorPlatform || "Unknown platform";
}
