import type {
  PreviewDevice,
  PreviewDeviceHint,
  PreviewDeviceKind,
} from "../previewTypes";

type Entry = [
  key: string,
  label: string,
  width: number,
  height: number,
  dpr: number,
  radius: number,
  screenRadius?: number,
  camera?: PreviewDevice["camera"],
  kind?: PreviewDeviceKind,
];

function group(groupName: string, kind: PreviewDeviceKind, entries: Entry[]): PreviewDevice[] {
  return entries.map(([key, label, width, height, dpr, radius, screenRadius, camera, entryKind]) => ({
    key,
    label,
    width,
    height,
    dpr,
    radius,
    screenRadius: screenRadius ?? Math.max(2, radius - 10),
    camera: camera ?? (kind === "phone" ? "dot" : "none"),
    kind: entryKind ?? kind,
    group: groupName,
  }));
}

export const PREVIEW_DEVICES: PreviewDevice[] = [
  ...group("Apple iPhone", "phone", [
    ["iphone-16-pro-max", "iPhone 16 Pro Max", 440, 956, 3, 56, 44, "island"],
    ["iphone-16-pro", "iPhone 16 Pro", 402, 874, 3, 54, 42, "island"],
    ["iphone-16-plus", "iPhone 16 Plus", 430, 932, 3, 54, 42, "island"],
    ["iphone-16", "iPhone 16", 393, 852, 3, 52, 40, "island"],
    ["iphone-16e", "iPhone 16e", 390, 844, 3, 46, 36, "dot"],
    ["iphone-15-pro-max", "iPhone 15 Pro Max", 430, 932, 3, 56, 44, "island"],
    ["iphone-15-pro", "iPhone 15 Pro", 393, 852, 3, 52, 40, "island"],
    ["iphone-14", "iPhone 14", 390, 844, 3, 46, 36, "dot"],
    ["iphone-13-mini", "iPhone 13 mini", 375, 812, 3, 42, 32, "dot"],
    ["iphone-se-3", "iPhone SE (3rd gen)", 375, 667, 2, 34, 24, "none"],
    ["iphone-se", "iPhone SE (compact)", 320, 568, 2, 30, 22, "none"],
  ]),
  ...group("Google Pixel", "phone", [
    ["pixel-9-pro-xl", "Pixel 9 Pro XL", 448, 997, 3, 46, 36],
    ["pixel-9-pro", "Pixel 9 Pro", 427, 952, 3, 44, 34],
    ["pixel-9", "Pixel 9", 360, 808, 3, 40, 30],
    ["pixel-8-pro", "Pixel 8 Pro", 448, 997, 3, 44, 34],
    ["pixel-8", "Pixel 8", 412, 915, 2.625, 42, 32],
    ["pixel-7a", "Pixel 7a", 412, 915, 2.625, 38, 28],
  ]),
  ...group("Samsung Galaxy", "phone", [
    ["galaxy-s24", "Galaxy S24", 360, 780, 3, 38, 30],
    ["galaxy-a55", "Galaxy A55", 480, 1040, 2.25, 38, 30],
    ["galaxy-z-fold-7", "Galaxy Z Fold 7 · open", 984, 1092, 2, 34, 24, "dot", "foldable"],
    ["galaxy-z-fold-7-cover", "Galaxy Z Fold 7 · cover", 360, 840, 3, 38, 28],
    ["galaxy-z-fold-6", "Galaxy Z Fold 6 · open", 928, 1080, 2, 34, 24, "dot", "foldable"],
    ["galaxy-z-flip-7", "Galaxy Z Flip 7", 360, 764, 3, 38, 28],
    ["galaxy-z-flip-7-cover", "Galaxy Z Flip 7 · cover", 474, 448, 2, 28, 20, "none"],
  ]),
  ...group("Tablets", "tablet", [
    ["galaxy-tab-s9", "Galaxy Tab S9", 640, 1024, 2.5, 36, 26],
    ["ipad-mini", "iPad mini", 744, 1133, 2, 38, 28],
    ["ipad-air-11", "iPad Air 11-inch", 820, 1180, 2, 38, 28],
    ["ipad-air-13", "iPad Air 13-inch", 1024, 1366, 2, 38, 28],
    ["ipad-pro-11", "iPad Pro 11-inch", 834, 1194, 2, 38, 28],
    ["ipad-pro-13", "iPad Pro 13-inch", 1032, 1376, 2, 38, 28],
  ]),
  ...group("Laptops", "laptop", [
    ["small-laptop", "Small laptop", 1280, 720, 1, 10],
    ["laptop", "Standard laptop", 1366, 768, 1, 10],
    ["macbook-air-13", "MacBook Air 13-inch", 1440, 900, 2, 10],
    ["macbook-pro-14", "MacBook Pro 14-inch", 1512, 982, 2, 10],
    ["surface-pro-9", "Surface Pro 9", 1440, 960, 2, 10],
  ]),
  ...group("Desktop displays", "desktop", [
    ["desktop", "Desktop · 1440 × 900", 1440, 900, 1, 8],
    ["desktop-large", "Desktop · 1536 × 864", 1536, 864, 1, 8],
    ["full-hd", "Full HD monitor", 1920, 1080, 1, 7],
    ["qhd", "QHD monitor", 2560, 1440, 1, 7],
    ["ultrawide", "Ultrawide monitor", 3440, 1440, 1, 7],
    ["4k-monitor", "4K monitor", 3840, 2160, 1, 7],
  ]),
  ...group("TVs & large screens", "tv", [
    ["hd-tv", "HD TV · 720p", 1280, 720, 1, 3],
    ["full-hd-tv", "Full HD TV · 1080p", 1920, 1080, 1, 3],
    ["qhd-tv", "Gaming TV · 1440p", 2560, 1440, 1, 3],
    ["4k-tv", "4K UHD TV", 3840, 2160, 1, 3],
    ["digital-signage", "Portrait signage", 1080, 1920, 1, 2],
  ]),
  {
    key: "custom",
    label: "Custom viewport",
    group: "Custom",
    kind: "custom",
    width: 1280,
    height: 800,
    dpr: 1,
    radius: 8,
    screenRadius: 7,
    camera: "none",
  },
];

const HINT_DEFAULTS: Record<PreviewDeviceHint, string> = {
  phone: "iphone-16-pro",
  tablet: "ipad-air-11",
  laptop: "macbook-pro-14",
  desktop: "desktop",
  tv: "full-hd-tv",
};

export function deviceByKey(key: string): PreviewDevice {
  return PREVIEW_DEVICES.find((device) => device.key === key) ?? PREVIEW_DEVICES[0];
}

export function isPreviewDeviceKey(key: string): boolean {
  return PREVIEW_DEVICES.some((device) => device.key === key);
}

export function recommendedDevice(hint: PreviewDeviceHint): PreviewDevice {
  return deviceByKey(HINT_DEFAULTS[hint]);
}
