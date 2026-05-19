import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAppContext } from "../../../context/AppContext";
import { usePreferences, useThemedColor } from "../../../context/PreferencesContext";
import type { DesktopPermissionMode } from "../../../types/domain";
import { PcPermissionUsageLimits } from "./PcPermissionUsageLimits";

const MODES: Array<{ mode: DesktopPermissionMode; label: string; detail: string; icon: keyof typeof Ionicons.glyphMap }> = [
  { mode: "read", label: "Read", detail: "PC context only", icon: "eye-outline" },
  { mode: "ask", label: "Ask", detail: "Approve edits", icon: "shield-checkmark-outline" },
  { mode: "auto", label: "Auto", detail: "Apply edits", icon: "flash-outline" }
];

export function PcPermissionControl({ onOpenConnect, projectId }: { onOpenConnect: () => void; projectId?: string }) {
  const app = useAppContext();
  const prefs = usePreferences();
  const [open, setOpen] = useState(false);
  const connected = Boolean(app.connection);
  const palette = prefs.effectiveScheme === "light" ? lightPalette : darkPalette;
  const iconColor = useThemedColor(connected ? "#D7C4FF" : "#9E98B1");
  const effectiveMode = projectId && app.editApprovals[projectId] === "always" ? "auto" : app.desktopPermissionMode;
  const activeMode = MODES.find((item) => item.mode === effectiveMode) ?? MODES[1];

  useEffect(() => {
    if (!connected) setOpen(false);
  }, [connected]);

  function handlePress() {
    if (!connected) {
      onOpenConnect();
      return;
    }
    setOpen((value) => !value);
  }

  function selectMode(mode: DesktopPermissionMode) {
    app.setDesktopPermissionMode(mode, projectId);
    setOpen(false);
  }

  return (
    <View style={localStyles.shell}>
      {open ? (
        <View style={[localStyles.menu, { backgroundColor: palette.menu, borderColor: palette.border }]}>
          {MODES.map((item) => {
            const active = item.mode === effectiveMode;
            return (
              <Pressable key={item.mode} onPress={() => selectMode(item.mode)} style={[localStyles.row, active ? { backgroundColor: palette.active } : null]}>
                <Ionicons name={item.icon} color={active ? palette.text : palette.muted} size={16} />
                <View style={localStyles.rowCopy}>
                  <Text style={[localStyles.rowLabel, { color: palette.text }]}>{item.label}</Text>
                  <Text style={[localStyles.rowDetail, { color: palette.muted }]}>{item.detail}</Text>
                </View>
                {active ? <Ionicons name="checkmark" color={palette.text} size={16} /> : null}
              </Pressable>
            );
          })}
          <PcPermissionUsageLimits />
        </View>
      ) : null}
      <Pressable accessibilityLabel={connected ? "Change PC permission mode" : "Connect PC"} onPress={handlePress} style={({ pressed }) => [localStyles.trigger, pressed && localStyles.pressed]}>
        <Ionicons name="desktop-outline" color={iconColor} size={18} />
        <Text numberOfLines={1} style={[localStyles.label, { color: connected ? palette.text : palette.muted }]}>
          {connected ? activeMode.detail : "Connect PC"}
        </Text>
      </Pressable>
    </View>
  );
}

const localStyles = StyleSheet.create({
  label: { fontSize: 12, fontWeight: "800", letterSpacing: 0, lineHeight: 16 },
  menu: {
    borderRadius: 14,
    borderWidth: 1,
    bottom: 38,
    gap: 2,
    left: 0,
    minWidth: 268,
    padding: 6,
    position: "absolute",
    zIndex: 30
  },
  pressed: { opacity: 0.74, transform: [{ scale: 0.96 }] },
  row: { alignItems: "center", borderRadius: 10, flexDirection: "row", gap: 9, minHeight: 42, paddingHorizontal: 9, paddingVertical: 7 },
  rowCopy: { flex: 1, minWidth: 0 },
  rowDetail: { fontSize: 11, fontWeight: "700", lineHeight: 15 },
  rowLabel: { fontSize: 12.5, fontWeight: "900", lineHeight: 16 },
  shell: { alignItems: "flex-start", marginTop: 4, position: "relative", zIndex: 20 },
  trigger: { alignItems: "center", flexDirection: "row", gap: 7, minHeight: 32, minWidth: 0, padding: 2 }
});

const darkPalette = {
  active: "rgba(176, 132, 255, 0.16)",
  border: "rgba(176, 132, 255, 0.24)",
  menu: "#13131F",
  muted: "#A9A3BA",
  text: "#EAE6F8"
};

const lightPalette = {
  active: "rgba(109, 59, 255, 0.12)",
  border: "rgba(109, 59, 255, 0.16)",
  menu: "#FFFFFF",
  muted: "#6B647C",
  text: "#312A46"
};
