const terminalTestPresets = [
  deviceGroup("Apple iPhone", "phone", [
    ["iphone-16-pro-max", "iPhone 16 Pro Max", 440, 956, 3, 56],
    ["iphone-16-pro", "iPhone 16 Pro", 402, 874, 3, 54],
    ["iphone-16-plus", "iPhone 16 Plus", 430, 932, 3, 54],
    ["iphone-16", "iPhone 16", 393, 852, 3, 52],
    ["iphone-16e", "iPhone 16e", 390, 844, 3, 46],
    ["iphone-15-pro-max", "iPhone 15 Pro Max", 430, 932, 3, 56],
    ["iphone-15-pro", "iPhone 15 Pro", 393, 852, 3, 52],
    ["iphone-15-plus", "iPhone 15 Plus", 430, 932, 3, 54],
    ["iphone-15", "iPhone 15", 393, 852, 3, 50],
    ["iphone-14-pro-max", "iPhone 14 Pro Max", 430, 932, 3, 56],
    ["iphone-14-pro", "iPhone 14 Pro", 393, 852, 3, 52],
    ["iphone-14-plus", "iPhone 14 Plus", 428, 926, 3, 46],
    ["iphone-14", "iPhone 14", 390, 844, 3, 46],
    ["iphone-13-pro-max", "iPhone 13 Pro Max", 428, 926, 3, 46],
    ["iphone-13-pro", "iPhone 13 Pro", 390, 844, 3, 46],
    ["iphone-13", "iPhone 13", 390, 844, 3, 46],
    ["iphone-13-mini", "iPhone 13 mini", 375, 812, 3, 42],
    ["iphone-12-pro-max", "iPhone 12 Pro Max", 428, 926, 3, 46],
    ["iphone-12-pro", "iPhone 12 Pro", 390, 844, 3, 46],
    ["iphone-12", "iPhone 12", 390, 844, 3, 46],
    ["iphone-12-mini", "iPhone 12 mini", 375, 812, 3, 42],
    ["iphone-se-3", "iPhone SE 3", 375, 667, 2, 34],
    ["iphone-se", "iPhone SE", 320, 568, 2, 30]
  ]),
  deviceGroup("Google Pixel", "phone", [
    ["pixel-9-pro-xl", "Pixel 9 Pro XL", 448, 997, 3, 46],
    ["pixel-9-pro", "Pixel 9 Pro", 427, 952, 3, 44],
    ["pixel-9", "Pixel 9", 360, 808, 3, 40],
    ["pixel-8-pro", "Pixel 8 Pro", 448, 997, 3, 44],
    ["pixel-8", "Pixel 8", 412, 915, 2.625, 42],
    ["pixel-8a", "Pixel 8a", 412, 915, 2.625, 40],
    ["pixel-7-pro", "Pixel 7 Pro", 412, 915, 3.5, 42],
    ["pixel-7", "Pixel 7", 412, 915, 2.625, 40],
    ["pixel-7a", "Pixel 7a", 412, 915, 2.625, 38]
  ]),
  deviceGroup("Samsung Galaxy", "phone", [
    ["galaxy-s24", "Galaxy S24", 360, 780, 3, 38],
    ["galaxy-a55", "Galaxy A55", 480, 1040, 2.25, 38],
    ["galaxy-z-fold-7", "Galaxy Z Fold 7", 984, 1092, 2, 34, "foldable"],
    ["galaxy-z-fold-7-cover", "Galaxy Z Fold 7 Cover", 360, 840, 3, 38],
    ["galaxy-z-fold-6", "Galaxy Z Fold 6", 928, 1080, 2, 34, "foldable"],
    ["galaxy-z-fold-6-cover", "Galaxy Z Fold 6 Cover", 484, 1188, 2, 38],
    ["galaxy-z-flip-7", "Galaxy Z Flip 7", 360, 764, 3, 38],
    ["galaxy-z-flip-7-cover", "Galaxy Z Flip 7 Cover", 474, 448, 2, 28],
    ["galaxy-z-flip-6", "Galaxy Z Flip 6", 360, 804, 3, 38],
    ["galaxy-z-flip-6-cover", "Galaxy Z Flip 6 Cover", 360, 298, 2, 28]
  ]),
  deviceGroup("Tablets", "tablet", [
    ["galaxy-tab-s9", "Galaxy Tab S9", 640, 1024, 2.5, 36],
    ["ipad-mini", "iPad mini", 744, 1133, 2, 38],
    ["ipad-air-11", "iPad Air 11", 820, 1180, 2, 38],
    ["ipad-air-13", "iPad Air 13", 1024, 1366, 2, 38],
    ["ipad-pro-11", "iPad Pro 11", 834, 1194, 2, 38],
    ["ipad-pro-13", "iPad Pro 13", 1032, 1376, 2, 38]
  ]),
  deviceGroup("Computers", "desktop", [
    ["small-laptop", "Small laptop", 1280, 720, 1, 9],
    ["laptop", "Laptop", 1366, 768, 1, 9],
    ["macbook-air-13", "MacBook Air 13", 1440, 900, 2, 9],
    ["macbook-pro-14", "MacBook Pro 14", 1512, 982, 2, 9],
    ["surface-pro-9", "Surface Pro 9", 1440, 960, 2, 9],
    ["desktop", "Desktop", 1440, 900, 1, 9],
    ["desktop-large", "Large desktop", 1536, 864, 1, 9],
    ["full-hd", "Full HD", 1920, 1080, 1, 9],
    ["qhd", "QHD", 2560, 1440, 1, 9],
    ["ultrawide", "Ultrawide", 3440, 1440, 1, 9],
    ["4k", "4K", 3840, 2160, 1, 9]
  ]),
  [{ key: "custom", label: "Custom size", width: 1280, height: 800, dpr: 1, radius: 9, kind: "custom", group: "Custom" }]
].flat();

const terminalTestPresetAliases = {
  "iphone-15": "iphone-15-pro",
  ipad: "ipad-air-11",
  "ipad-pro": "ipad-pro-13"
};

function deviceGroup(group, kind, entries) {
  return entries.map(([key, label, width, height, dpr, radius, deviceKind]) => ({
    key, label, width, height, dpr, radius, kind: deviceKind || kind, group
  }));
}
