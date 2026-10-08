export type DeviceKind = "iphone" | "ipad" | "mac" | "watch";

/** The device's family, read from the name the phone gave itself. Every
 * client today is an iPhone, so that is the default. */
export function deviceKind(name: string): DeviceKind {
  const lower = name.toLowerCase();
  if (lower.includes("ipad")) return "ipad";
  if (lower.includes("watch")) return "watch";
  if (lower.includes("macbook") || lower.includes("imac") || /\bmac\b/.test(lower)) return "mac";
  return "iphone";
}

/**
 * Device silhouettes in the Find My idiom: a dark body, a lit screen, the
 * one detail that names the family. Drawn to a 40-unit grid; the size is
 * the box the whole thing sits in.
 */
export function PhoneDeviceIcon({ kind, size = 36, online }: { kind: DeviceKind; size?: number; online?: boolean }) {
  const screen = online ? "url(#vb-screen-on)" : "url(#vb-screen-off)";
  return (
    <svg className="device-icon" width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
      <defs>
        <linearGradient id="vb-body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#4b5160" />
          <stop offset="1" stopColor="#262a33" />
        </linearGradient>
        <linearGradient id="vb-screen-on" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#4d79ff" />
          <stop offset="1" stopColor="#1e2f7a" />
        </linearGradient>
        <linearGradient id="vb-screen-off" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1b1e26" />
          <stop offset="1" stopColor="#0f1116" />
        </linearGradient>
      </defs>
      {kind === "iphone" && (
        <>
          <rect x="11" y="3" width="18" height="34" rx="4.2" fill="url(#vb-body)" />
          <rect x="12.6" y="4.6" width="14.8" height="30.8" rx="3" fill={screen} />
          <rect x="16.5" y="6.2" width="7" height="2.2" rx="1.1" fill="#0b0d12" />
        </>
      )}
      {kind === "ipad" && (
        <>
          <rect x="6" y="5" width="28" height="30" rx="3.4" fill="url(#vb-body)" />
          <rect x="7.8" y="6.8" width="24.4" height="26.4" rx="2" fill={screen} />
          <circle cx="20" cy="6.2" r="0.9" fill="#0b0d12" />
        </>
      )}
      {kind === "mac" && (
        <>
          <rect x="6" y="8" width="28" height="19" rx="2.4" fill="url(#vb-body)" />
          <rect x="7.6" y="9.6" width="24.8" height="15.8" rx="1.4" fill={screen} />
          <path d="M3 29.5h34a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" fill="#3a3f4b" />
          <rect x="16" y="29.5" width="8" height="1" fill="#1a1d24" />
        </>
      )}
      {kind === "watch" && (
        <>
          <rect x="14" y="2" width="12" height="7" rx="2" fill="#3a3f4b" />
          <rect x="14" y="31" width="12" height="7" rx="2" fill="#3a3f4b" />
          <rect x="11" y="9" width="18" height="22" rx="5" fill="url(#vb-body)" />
          <rect x="12.8" y="10.8" width="14.4" height="18.4" rx="3.6" fill={screen} />
          <rect x="29.2" y="15" width="1.6" height="4" rx="0.8" fill="#6b7280" />
        </>
      )}
    </svg>
  );
}
