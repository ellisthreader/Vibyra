import { StyleSheet } from "react-native";
import { transformColorForLight } from "./themeColorTransform";

const COLOR_KEYS = new Set([
  "color",
  "backgroundColor",
  "borderColor",
  "borderTopColor",
  "borderRightColor",
  "borderBottomColor",
  "borderLeftColor",
  "borderStartColor",
  "borderEndColor",
  "shadowColor",
  "tintColor",
  "textShadowColor",
  "textDecorationColor",
  "overlayColor",
  "placeholderTextColor",
  "underlayColor"
]);

function transformValue(key: string, value: unknown): unknown {
  if (typeof value === "string" && COLOR_KEYS.has(key)) {
    return transformColorForLight(value, key);
  }
  if (Array.isArray(value)) {
    return value.map((v) => (typeof v === "object" && v !== null ? transformStyleObject(v as Record<string, unknown>) : v));
  }
  if (value && typeof value === "object") {
    return transformStyleObject(value as Record<string, unknown>);
  }
  return value;
}

function transformStyleObject(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key in obj) {
    out[key] = transformValue(key, obj[key]);
  }
  return out;
}

export function transformStyleMap(map: Record<string, Record<string, unknown>>): Record<string, Record<string, unknown>> {
  const out: Record<string, Record<string, unknown>> = {};
  for (const key in map) {
    out[key] = transformStyleObject(map[key]);
  }
  return out;
}

let activeScheme: "dark" | "light" = "dark";

export function setThemeTransformScheme(scheme: "dark" | "light") {
  activeScheme = scheme;
}

export function createThemedStyleSheet<T extends Record<string, Record<string, unknown>>>(raw: T): any {
  const darkSheet = StyleSheet.create(raw as any);
  const lightSheet = StyleSheet.create(transformStyleMap(raw) as any);

  return new Proxy({} as T, {
    get(_, key: string) {
      const sheet = activeScheme === "light" ? lightSheet : darkSheet;
      return (sheet as Record<string, unknown>)[key] as T[keyof T];
    },
    has(_, key: string) {
      return key in (activeScheme === "light" ? lightSheet : darkSheet);
    },
    ownKeys() {
      return Object.keys(activeScheme === "light" ? lightSheet : darkSheet);
    },
    getOwnPropertyDescriptor(_, key: string) {
      const sheet = activeScheme === "light" ? lightSheet : darkSheet;
      if (key in sheet) {
        return { enumerable: true, configurable: true, value: (sheet as Record<string, unknown>)[key] };
      }
      return undefined;
    }
  });
}

export function themedColor(color: string, scheme: "light" | "dark"): string {
  return scheme === "light" ? transformColorForLight(color) : color;
}
